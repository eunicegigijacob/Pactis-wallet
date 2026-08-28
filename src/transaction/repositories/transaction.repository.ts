import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  BaseRepository,
  PaginationOptions,
  PaginationResult,
} from "../../common/repositories/base.repository";
import { Transaction } from "../entities/transaction.entity";

@Injectable()
export class TransactionRepository extends BaseRepository<Transaction> {
  constructor(
    @InjectRepository(Transaction)
    transactionRepo: Repository<Transaction>
  ) {
    super(transactionRepo);
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
}
