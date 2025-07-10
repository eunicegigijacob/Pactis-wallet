import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { v4 as uuidv4 } from "uuid";

import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from "./entities/transaction.entity";
import { Wallet, WalletStatus } from "../wallet/entities/wallet.entity";
import { TransferDto } from "./dto/transfer.dto";
import { TransactionHistoryDto } from "./dto/transaction-history.dto";
import { ApiResponse } from "../common/interfaces/api-response.interface";
import { TransactionRepository } from "./repositories/transaction.repository";

export interface CreateTransactionData {
  transactionId: string;
  walletId: string;
  targetWalletId?: string;
  type: TransactionType;
  amount: number;
  description?: string;
  currency?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly dataSource: DataSource,
    @InjectQueue("transactions") private transactionsQueue: Queue,
    private readonly transactionRepo: TransactionRepository
  ) {}

  async createTransaction(data: CreateTransactionData): Promise<Transaction> {
    const transaction = this.transactionRepository.create({
      ...data,
      status: TransactionStatus.COMPLETED,
    });

    return await this.transactionRepository.save(transaction);
  }

  async transfer(transferDto: TransferDto): Promise<
    ApiResponse<{
      transaction: Transaction;
      fromWallet: Wallet;
      toWallet: Wallet;
    }>
  > {
    const {
      fromWalletId,
      toWalletId,
      amount,
      description,
      currency,
      transactionId,
    } = transferDto;

    // Check if wallets are different
    if (fromWalletId === toWalletId) {
      throw new BadRequestException("Cannot transfer to the same wallet");
    }

    // Use provided transactionId or generate new one for idempotency
    const finalTransactionId = transactionId || uuidv4();

    // Check if transaction already exists (idempotency)
    const existingTransaction = await this.transactionRepository.findOne({
      where: { transactionId: finalTransactionId },
    });

    if (existingTransaction) {
      if (existingTransaction.isCompleted()) {
        // Return existing successful transaction
        const fromWallet = await this.walletRepository.findOne({
          where: { id: fromWalletId },
        });
        const toWallet = await this.walletRepository.findOne({
          where: { id: toWalletId },
        });
        return {
          status: true,
          message: "Transfer completed successfully (idempotent)",
          data: { transaction: existingTransaction, fromWallet, toWallet },
        };
      } else if (existingTransaction.isFailed()) {
        throw new BadRequestException("Previous transfer attempt failed");
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
      // Lock both wallets for update
      const fromWallet = await manager
        .createQueryBuilder(Wallet, "wallet")
        .setLock("pessimistic_write")
        .where("wallet.id = :walletId", { walletId: fromWalletId })
        .getOne();

      const toWallet = await manager
        .createQueryBuilder(Wallet, "wallet")
        .setLock("pessimistic_write")
        .where("wallet.id = :walletId", { walletId: toWalletId })
        .getOne();

      if (!fromWallet) {
        throw new NotFoundException("Source wallet not found");
      }

      if (!toWallet) {
        throw new NotFoundException("Target wallet not found");
      }

      if (!fromWallet.canWithdraw(amount)) {
        throw new BadRequestException(
          "Insufficient funds or invalid source wallet status"
        );
      }

      if (!toWallet.canDeposit(amount)) {
        throw new BadRequestException("Invalid target wallet status");
      }

      // Create or update transaction record
      let transaction: Transaction;
      if (existingTransaction) {
        transaction = existingTransaction;
        transaction.status = TransactionStatus.PENDING;
      } else {
        transaction = this.transactionRepository.create({
          transactionId: finalTransactionId,
          walletId: fromWalletId,
          targetWalletId: toWalletId,
          type: TransactionType.TRANSFER,
          amount,
          description,
          currency: currency || fromWallet.currency,
          status: TransactionStatus.PENDING,
        });
      }

      // Update wallet balances
      fromWallet.subtractBalance(amount);
      toWallet.addBalance(amount);

      // Save all changes
      await manager.save(fromWallet);
      await manager.save(toWallet);
      transaction.markAsCompleted();
      await manager.save(transaction);

      return { transaction, fromWallet, toWallet };
    });

    return {
      status: true,
      message: "Transfer completed successfully",
      data: result,
    };
  }

  async getTransactionHistory(query: TransactionHistoryDto): Promise<
    ApiResponse<{
      transactions: Transaction[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>
  > {
    const {
      walletId,
      page = 1,
      limit = 20,
      type,
      status,
      startDate,
      endDate,
    } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.transactionRepository
      .createQueryBuilder("transaction")
      .where("transaction.walletId = :walletId", { walletId })
      .orWhere("transaction.targetWalletId = :walletId", { walletId })
      .orderBy("transaction.createdAt", "DESC")
      .skip(skip)
      .take(limit);

    if (type) {
      queryBuilder.andWhere("transaction.type = :type", { type });
    }

    if (status) {
      queryBuilder.andWhere("transaction.status = :status", { status });
    }

    if (startDate) {
      queryBuilder.andWhere("transaction.createdAt >= :startDate", {
        startDate: new Date(startDate),
      });
    }

    if (endDate) {
      queryBuilder.andWhere("transaction.createdAt <= :endDate", {
        endDate: new Date(endDate),
      });
    }

    const [transactions, total] = await queryBuilder.getManyAndCount();

    return {
      status: true,
      message: "Transaction history retrieved successfully",
      data: {
        transactions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTransaction(
    transactionId: string
  ): Promise<ApiResponse<Transaction>> {
    const transaction = await this.transactionRepository.findOne({
      where: { transactionId },
      relations: ["wallet", "targetWallet"],
    });

    if (!transaction) {
      throw new NotFoundException("Transaction not found");
    }

    return {
      status: true,
      message: "Transaction retrieved successfully",
      data: transaction,
    };
  }

  async processTransferAsync(
    transferDto: TransferDto
  ): Promise<ApiResponse<{ message: string }>> {
    // Add transfer to queue for async processing
    await this.transactionsQueue.add("transfer", transferDto, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    return {
      status: true,
      message: "Transfer queued for processing",
      data: { message: "Transfer queued for processing" },
    };
  }

  async getTransactionStats(walletId: string): Promise<
    ApiResponse<{
      totalDeposits: number;
      totalWithdrawals: number;
      totalTransfers: number;
      totalFees: number;
    }>
  > {
    const stats = await this.transactionRepository
      .createQueryBuilder("transaction")
      .select([
        "SUM(CASE WHEN transaction.type = :depositType THEN transaction.amount ELSE 0 END) as totalDeposits",
        "SUM(CASE WHEN transaction.type = :withdrawalType THEN transaction.amount ELSE 0 END) as totalWithdrawals",
        "SUM(CASE WHEN transaction.type = :transferType THEN transaction.amount ELSE 0 END) as totalTransfers",
        "SUM(COALESCE(transaction.fee, 0)) as totalFees",
      ])
      .where("transaction.walletId = :walletId", { walletId })
      .andWhere("transaction.status = :status", {
        status: TransactionStatus.COMPLETED,
      })
      .setParameters({
        depositType: TransactionType.DEPOSIT,
        withdrawalType: TransactionType.WITHDRAWAL,
        transferType: TransactionType.TRANSFER,
      })
      .getRawOne();

    return {
      status: true,
      message: "Transaction statistics retrieved successfully",
      data: {
        totalDeposits: parseFloat(stats.totalDeposits) || 0,
        totalWithdrawals: parseFloat(stats.totalWithdrawals) || 0,
        totalTransfers: parseFloat(stats.totalTransfers) || 0,
        totalFees: parseFloat(stats.totalFees) || 0,
      },
    };
  }

  async getFailedTransactions(
    page: number = 1,
    limit: number = 20
  ): Promise<
    ApiResponse<{
      items: Transaction[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>
  > {
    const skip = (page - 1) * limit;

    const queryBuilder = this.transactionRepository
      .createQueryBuilder("transaction")
      .where("transaction.status = :status", {
        status: TransactionStatus.FAILED,
      })
      .orderBy("transaction.createdAt", "DESC")
      .skip(skip)
      .take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      status: true,
      message: "Failed transactions retrieved successfully",
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    };
  }

  async getPendingTransactions(
    page: number = 1,
    limit: number = 20
  ): Promise<
    ApiResponse<{
      items: Transaction[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>
  > {
    const skip = (page - 1) * limit;

    const queryBuilder = this.transactionRepository
      .createQueryBuilder("transaction")
      .where("transaction.status = :status", {
        status: TransactionStatus.PENDING,
      })
      .orderBy("transaction.createdAt", "ASC")
      .skip(skip)
      .take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      status: true,
      message: "Pending transactions retrieved successfully",
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    };
  }

  async getTransactionsByDateRange(
    startDate: string,
    endDate: string,
    page: number = 1,
    limit: number = 20,
    userId?: string
  ): Promise<
    ApiResponse<{
      items: Transaction[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>
  > {
    const result = await this.transactionRepo.findTransactionsByDateRange(
      new Date(startDate),
      new Date(`${endDate}T23:59:59.999Z`),
      { page, limit },
      userId
    );

    return {
      status: true,
      message: "Transactions retrieved successfully",
      data: result,
    };
  }

  async getTransactionsByUserId(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<
    ApiResponse<{
      items: Transaction[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>
  > {
    const result = await this.transactionRepo.findTransactionsByUserId(userId, {
      page,
      limit,
    });

    return {
      status: true,
      message: "Transactions retrieved successfully",
      data: result,
    };
  }

  async createTestTransactions(
    userId: string,
    count: number = 5
  ): Promise<Transaction[]> {
    // First, ensure we have a wallet for this user
    let wallet = await this.walletRepository.findOne({
      where: { userId },
    });

    if (!wallet) {
      // Create a wallet for the user if it doesn't exist
      wallet = this.walletRepository.create({
        userId,
        balance: 1000,
        currency: "USD",
        status: WalletStatus.ACTIVE,
      });
      await this.walletRepository.save(wallet);
    }

    const transactions: Transaction[] = [];
    const types = [
      TransactionType.DEPOSIT,
      TransactionType.WITHDRAWAL,
      TransactionType.TRANSFER,
    ];
    const statuses = [
      TransactionStatus.COMPLETED,
      TransactionStatus.PENDING,
      TransactionStatus.FAILED,
    ];

    for (let i = 0; i < count; i++) {
      const transaction = this.transactionRepository.create({
        transactionId: `test-tx-${userId}-${Date.now()}-${i}`,
        walletId: wallet.id,
        type: types[i % types.length],
        status: statuses[i % statuses.length],
        amount: Math.floor(Math.random() * 1000) + 10,
        description: `Test transaction ${i + 1} for user ${userId}`,
        currency: "USD",
        createdAt: new Date(
          Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
        ), // Random date within last 30 days
      });

      const savedTransaction =
        await this.transactionRepository.save(transaction);
      transactions.push(savedTransaction);
    }

    return transactions;
  }
}
