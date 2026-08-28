import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository, DataSource, EntityManager } from "typeorm";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
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
import { isDuplicateKeyError } from "../common/utils/database-error";
import {
  isClientHttpError,
  errorMessage,
} from "../common/utils/http-error";
import {
  TRANSACTION_QUEUE,
  TRANSFER_JOB,
  TRANSFER_JOB_ATTEMPTS,
  TRANSFER_JOB_BACKOFF_MS,
} from "../queue/queue.constants";

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

export interface LedgerMatch {
  walletId: string;
  targetWalletId?: string | null;
  amount: number;
  type: TransactionType;
}

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly dataSource: DataSource,
    @InjectQueue(TRANSACTION_QUEUE) private transactionsQueue: Queue,
    private readonly transactionRepo: TransactionRepository,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  private async invalidateWalletCache(walletId: string): Promise<void> {
    await this.cacheManager.del(`wallet:${walletId}`);
    await this.cacheManager.del(`wallet:balance:${walletId}`);
  }

  async createTransaction(
    data: CreateTransactionData,
    manager?: EntityManager
  ): Promise<Transaction> {
    const repo = manager
      ? manager.getRepository(Transaction)
      : this.transactionRepository;
    const transaction = repo.create({
      ...data,
      status: TransactionStatus.COMPLETED,
    });

    return await repo.save(transaction);
  }

  async markTransactionFailed(
    transactionId: string,
    errorMessageText: string
  ): Promise<void> {
    const transaction = await this.transactionRepository.findOne({
      where: { transactionId },
    });

    if (transaction?.isPending()) {
      transaction.markAsFailed(errorMessageText);
      await this.transactionRepository.save(transaction);
    }
  }

  assertSameOperation(existing: Transaction, expected: LedgerMatch): void {
    const amountMatches =
      Math.round(Number(existing.amount) * 100) ===
      Math.round(expected.amount * 100);
    const existingTarget = existing.targetWalletId ?? null;
    const expectedTarget = expected.targetWalletId ?? null;

    if (
      existing.walletId !== expected.walletId ||
      existingTarget !== expectedTarget ||
      !amountMatches ||
      existing.type !== expected.type
    ) {
      throw new ConflictException(
        "Idempotency key reused with a different payload"
      );
    }
  }

  async requireIdempotentMatch(
    transactionId: string | undefined,
    expected: LedgerMatch
  ): Promise<Transaction | null> {
    if (!transactionId) {
      return null;
    }

    const existing = await this.transactionRepository.findOne({
      where: { transactionId },
    });

    if (!existing) {
      return null;
    }

    this.assertSameOperation(existing, expected);

    if (existing.isCompleted()) {
      return existing;
    }

    if (existing.isFailed()) {
      throw new BadRequestException("Previous transaction attempt failed");
    }

    throw new ConflictException("Duplicate idempotency key");
  }

  private async persistFailedTransfer(
    transactionId: string,
    transferDto: TransferDto,
    error: unknown
  ): Promise<void> {
    const existing = await this.transactionRepository.findOne({
      where: { transactionId },
    });
    if (existing) {
      if (existing.isPending()) {
        existing.markAsFailed(errorMessage(error));
        await this.transactionRepository.save(existing);
      }
      return;
    }

    const fromWallet = await this.walletRepository.findOne({
      where: { id: transferDto.fromWalletId },
    });
    if (!fromWallet) {
      return;
    }

    const toWallet = await this.walletRepository.findOne({
      where: { id: transferDto.toWalletId },
    });

    try {
      const failed = this.transactionRepository.create({
        transactionId,
        walletId: transferDto.fromWalletId,
        targetWalletId: toWallet ? transferDto.toWalletId : null,
        type: TransactionType.TRANSFER,
        amount: transferDto.amount,
        description: transferDto.description,
        currency: transferDto.currency || fromWallet.currency,
        status: TransactionStatus.FAILED,
        errorMessage: errorMessage(error),
      });
      await this.transactionRepository.save(failed);
    } catch {
      // Best-effort audit row; never mask the original business error.
    }
  }

  private async lockWallet(
    manager: EntityManager,
    walletId: string
  ): Promise<Wallet | null> {
    return manager
      .createQueryBuilder(Wallet, "wallet")
      .setLock("pessimistic_write")
      .where("wallet.id = :walletId", { walletId })
      .getOne();
  }

  /**
   * Lock both wallets in UUID order so A→B concurrent with B→A cannot deadlock.
   */
  private async lockWalletsForTransfer(
    manager: EntityManager,
    fromWalletId: string,
    toWalletId: string
  ): Promise<{ fromWallet: Wallet | null; toWallet: Wallet | null }> {
    const [firstId, secondId] =
      fromWalletId < toWalletId
        ? [fromWalletId, toWalletId]
        : [toWalletId, fromWalletId];

    const first = await this.lockWallet(manager, firstId);
    const second = await this.lockWallet(manager, secondId);

    const byId = new Map<string, Wallet | null>([
      [firstId, first],
      [secondId, second],
    ]);

    return {
      fromWallet: byId.get(fromWalletId) ?? null,
      toWallet: byId.get(toWalletId) ?? null,
    };
  }

  private async completedTransferResponse(
    transaction: Transaction,
    fromWalletId: string,
    toWalletId: string | null,
    idempotent = false
  ): Promise<
    ApiResponse<{
      transaction: Transaction;
      fromWallet: Wallet;
      toWallet: Wallet;
    }>
  > {
    const fromWallet = await this.walletRepository.findOne({
      where: { id: fromWalletId },
    });
    const toWallet = toWalletId
      ? await this.walletRepository.findOne({
          where: { id: toWalletId },
        })
      : null;

    return {
      status: true,
      message: idempotent
        ? "Transfer completed successfully (idempotent)"
        : "Transfer completed successfully",
      data: { transaction, fromWallet, toWallet },
    };
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

    if (fromWalletId === toWalletId) {
      throw new BadRequestException("Cannot transfer to the same wallet");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Invalid transfer amount");
    }

    const finalTransactionId = transactionId || uuidv4();
    const expected: LedgerMatch = {
      walletId: fromWalletId,
      targetWalletId: toWalletId,
      amount,
      type: TransactionType.TRANSFER,
    };

    const existingTransaction = await this.requireIdempotentMatch(
      finalTransactionId,
      expected
    );

    if (existingTransaction) {
      return this.completedTransferResponse(
        existingTransaction,
        existingTransaction.walletId,
        existingTransaction.targetWalletId,
        true
      );
    }

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const { fromWallet, toWallet } = await this.lockWalletsForTransfer(
          manager,
          fromWalletId,
          toWalletId
        );

        if (!fromWallet) {
          throw new NotFoundException("Source wallet not found");
        }

        if (!toWallet) {
          throw new NotFoundException("Target wallet not found");
        }

        if (fromWallet.currency !== toWallet.currency) {
          throw new BadRequestException("Currency mismatch between wallets");
        }

        if (currency && currency !== fromWallet.currency) {
          throw new BadRequestException("Currency mismatch");
        }

        if (!fromWallet.canWithdraw(amount)) {
          throw new BadRequestException(
            "Insufficient funds or invalid source wallet status"
          );
        }

        if (!toWallet.canDeposit(amount)) {
          throw new BadRequestException("Invalid target wallet status");
        }

        const transaction = manager.create(Transaction, {
          transactionId: finalTransactionId,
          walletId: fromWalletId,
          targetWalletId: toWalletId,
          type: TransactionType.TRANSFER,
          amount,
          description,
          currency: currency || fromWallet.currency,
          status: TransactionStatus.PENDING,
        });

        await manager.save(transaction);

        fromWallet.subtractBalance(amount);
        toWallet.addBalance(amount);

        await manager.save(fromWallet);
        await manager.save(toWallet);
        transaction.markAsCompleted();
        await manager.save(transaction);

        return { transaction, fromWallet, toWallet };
      });

      await this.invalidateWalletCache(fromWalletId);
      await this.invalidateWalletCache(toWalletId);

      return {
        status: true,
        message: "Transfer completed successfully",
        data: result,
      };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const raced = await this.transactionRepository.findOne({
          where: { transactionId: finalTransactionId },
        });

        if (raced?.isCompleted()) {
          this.assertSameOperation(raced, expected);
          return this.completedTransferResponse(
            raced,
            raced.walletId,
            raced.targetWalletId,
            true
          );
        }

        throw new ConflictException("Duplicate idempotency key");
      }

      if (isClientHttpError(error)) {
        await this.persistFailedTransfer(finalTransactionId, transferDto, error);
      }

      throw error;
    }
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
      .where(
        new Brackets((qb) => {
          qb.where("transaction.walletId = :walletId", { walletId }).orWhere(
            "transaction.targetWalletId = :walletId",
            { walletId }
          );
        })
      )
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
  ): Promise<ApiResponse<{ message: string; transactionId: string }>> {
    const transactionId = transferDto.transactionId || uuidv4();
    const payload: TransferDto = { ...transferDto, transactionId };

    try {
      await this.transactionsQueue.add(TRANSFER_JOB, payload, {
        jobId: transactionId,
        attempts: TRANSFER_JOB_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: TRANSFER_JOB_BACKOFF_MS,
        },
        removeOnComplete: 100,
        removeOnFail: false,
      });
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";
      if (!message.toLowerCase().includes("already exists")) {
        throw error;
      }
    }

    return {
      status: true,
      message: "Transfer queued for processing",
      data: {
        message: "Transfer queued for processing",
        transactionId,
      },
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
    const skip = (page - 1) * limit;

    const queryBuilder = this.transactionRepository
      .createQueryBuilder("transaction")
      .leftJoin("transaction.wallet", "wallet")
      .leftJoin("transaction.targetWallet", "targetWallet")
      .where("transaction.status = :status", {
        status: TransactionStatus.FAILED,
      })
      .orderBy("transaction.createdAt", "DESC")
      .skip(skip)
      .take(limit);

    if (userId) {
      queryBuilder.andWhere(
        "(wallet.userId = :userId OR targetWallet.userId = :userId)",
        { userId }
      );
    }

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
    const skip = (page - 1) * limit;

    const queryBuilder = this.transactionRepository
      .createQueryBuilder("transaction")
      .leftJoin("transaction.wallet", "wallet")
      .leftJoin("transaction.targetWallet", "targetWallet")
      .where("transaction.status = :status", {
        status: TransactionStatus.PENDING,
      })
      .orderBy("transaction.createdAt", "ASC")
      .skip(skip)
      .take(limit);

    if (userId) {
      queryBuilder.andWhere(
        "(wallet.userId = :userId OR targetWallet.userId = :userId)",
        { userId }
      );
    }

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
