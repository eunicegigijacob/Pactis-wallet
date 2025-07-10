import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  BaseRepository,
  PaginationOptions,
  PaginationResult,
} from "../../common/repositories/base.repository";
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from "../entities/transaction.entity";

export interface TransactionFilters {
  walletId?: string;
  targetWalletId?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

@Injectable()
export class TransactionRepository extends BaseRepository<Transaction> {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>
  ) {
    super(transactionRepo);
  }

  async findByTransactionId(
    transactionId: string
  ): Promise<Transaction | null> {
    return await this.findOneBy({ transactionId } as any);
  }

  async findByWalletId(walletId: string): Promise<Transaction[]> {
    return await this.findMany({ where: { walletId } as any });
  }

  async findByType(type: TransactionType): Promise<Transaction[]> {
    return await this.findMany({ where: { type } as any });
  }

  async findByStatus(status: TransactionStatus): Promise<Transaction[]> {
    return await this.findMany({ where: { status } as any });
  }

  async findByUserId(userId: string): Promise<Transaction[]> {
    const queryBuilder = this.createQueryBuilder("transaction")
      .leftJoinAndSelect("transaction.wallet", "wallet")
      .leftJoinAndSelect("transaction.targetWallet", "targetWallet")
      .where("wallet.userId = :userId", { userId })
      .orWhere("targetWallet.userId = :userId", { userId })
      .orderBy("transaction.createdAt", "DESC");

    return await queryBuilder.getMany();
  }

  async findWithRelations(transactionId: string): Promise<Transaction | null> {
    return await this.transactionRepo.findOne({
      where: { transactionId },
      relations: ["wallet", "targetWallet"],
    });
  }

  async findWithFilters(
    filters: TransactionFilters,
    pagination: PaginationOptions
  ): Promise<PaginationResult<Transaction>> {
    const queryBuilder = this.createQueryBuilder("transaction")
      .leftJoinAndSelect("transaction.wallet", "wallet")
      .leftJoinAndSelect("transaction.targetWallet", "targetWallet");

    if (filters.walletId) {
      queryBuilder.andWhere("transaction.walletId = :walletId", {
        walletId: filters.walletId,
      });
    }

    if (filters.targetWalletId) {
      queryBuilder.andWhere("transaction.targetWalletId = :targetWalletId", {
        targetWalletId: filters.targetWalletId,
      });
    }

    if (filters.type) {
      queryBuilder.andWhere("transaction.type = :type", { type: filters.type });
    }

    if (filters.status) {
      queryBuilder.andWhere("transaction.status = :status", {
        status: filters.status,
      });
    }

    if (filters.startDate) {
      queryBuilder.andWhere("transaction.createdAt >= :startDate", {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      queryBuilder.andWhere("transaction.createdAt <= :endDate", {
        endDate: filters.endDate,
      });
    }

    if (filters.minAmount) {
      queryBuilder.andWhere("transaction.amount >= :minAmount", {
        minAmount: filters.minAmount,
      });
    }

    if (filters.maxAmount) {
      queryBuilder.andWhere("transaction.amount <= :maxAmount", {
        maxAmount: filters.maxAmount,
      });
    }

    queryBuilder.orderBy("transaction.createdAt", "DESC");

    return await this.paginateQuery(queryBuilder, pagination);
  }

  async getTransactionStats(walletId?: string): Promise<{
    totalTransactions: number;
    totalDeposits: number;
    totalWithdrawals: number;
    totalTransfers: number;
    totalFees: number;
    totalAmount: number;
  }> {
    const queryBuilder = this.transactionRepo
      .createQueryBuilder("transaction")
      .select([
        "COUNT(*) as totalTransactions",
        "SUM(CASE WHEN transaction.type = :depositType THEN 1 ELSE 0 END) as totalDeposits",
        "SUM(CASE WHEN transaction.type = :withdrawalType THEN 1 ELSE 0 END) as totalWithdrawals",
        "SUM(CASE WHEN transaction.type = :transferType THEN 1 ELSE 0 END) as totalTransfers",
        "SUM(COALESCE(transaction.fee, 0)) as totalFees",
        "SUM(transaction.amount) as totalAmount",
      ])
      .setParameters({
        depositType: TransactionType.DEPOSIT,
        withdrawalType: TransactionType.WITHDRAWAL,
        transferType: TransactionType.TRANSFER,
      });

    if (walletId) {
      queryBuilder.where("transaction.walletId = :walletId", { walletId });
    }

    const stats = await queryBuilder.getRawOne();

    return {
      totalTransactions: parseInt(stats.totalTransactions) || 0,
      totalDeposits: parseInt(stats.totalDeposits) || 0,
      totalWithdrawals: parseInt(stats.totalWithdrawals) || 0,
      totalTransfers: parseInt(stats.totalTransfers) || 0,
      totalFees: parseFloat(stats.totalFees) || 0,
      totalAmount: parseFloat(stats.totalAmount) || 0,
    };
  }

  async findTransactionsByDateRange(
    startDate: Date,
    endDate: Date,
    pagination: PaginationOptions,
    userId?: string
  ): Promise<PaginationResult<Transaction>> {
    const queryBuilder = this.createQueryBuilder("transaction")
      .leftJoinAndSelect("transaction.wallet", "wallet")
      .leftJoinAndSelect("transaction.targetWallet", "targetWallet")
      .where("transaction.createdAt >= :startDate", { startDate })
      .andWhere("transaction.createdAt <= :endDate", { endDate });

    if (userId) {
      queryBuilder.andWhere(
        "(wallet.userId = :userId OR targetWallet.userId = :userId)",
        { userId }
      );
    }

    queryBuilder.orderBy("transaction.createdAt", "DESC");

    return await this.paginateQuery(queryBuilder, pagination);
  }

  async findTransactionsByUserId(
    userId: string,
    pagination: PaginationOptions
  ): Promise<PaginationResult<Transaction>> {
    const queryBuilder = this.createQueryBuilder("transaction")
      .leftJoinAndSelect("transaction.wallet", "wallet")
      .leftJoinAndSelect("transaction.targetWallet", "targetWallet")
      .where("wallet.userId = :userId", { userId })
      .orWhere("targetWallet.userId = :userId", { userId })
      .orderBy("transaction.createdAt", "DESC");

    return await this.paginateQuery(queryBuilder, pagination);
  }

  async findFailedTransactions(
    pagination: PaginationOptions
  ): Promise<PaginationResult<Transaction>> {
    const queryBuilder = this.createQueryBuilder("transaction")
      .where("transaction.status = :status", {
        status: TransactionStatus.FAILED,
      })
      .orderBy("transaction.createdAt", "DESC");

    return await this.paginateQuery(queryBuilder, pagination);
  }

  async updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus,
    errorMessage?: string
  ): Promise<Transaction | null> {
    const updateData: any = { status };
    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }
    return await this.update(transactionId, updateData);
  }

  async findPendingTransactions(
    pagination: PaginationOptions
  ): Promise<PaginationResult<Transaction>> {
    const queryBuilder = this.createQueryBuilder("transaction")
      .where("transaction.status = :status", {
        status: TransactionStatus.PENDING,
      })
      .orderBy("transaction.createdAt", "ASC");

    return await this.paginateQuery(queryBuilder, pagination);
  }
}
