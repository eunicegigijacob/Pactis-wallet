import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  BaseRepository,
  PaginationOptions,
  PaginationResult,
} from "../../common/repositories/base.repository";
import { Wallet, WalletStatus } from "../entities/wallet.entity";

export interface WalletFilters {
  status?: WalletStatus;
  currency?: string;
  userId?: string;
}

@Injectable()
export class WalletRepository extends BaseRepository<Wallet> {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>
  ) {
    super(walletRepo);
  }

  async findByUserId(userId: string): Promise<Wallet | null> {
    return await this.findOneBy({ userId } as any);
  }

  async findWithFilters(
    filters: WalletFilters,
    pagination: PaginationOptions
  ): Promise<PaginationResult<Wallet>> {
    const queryBuilder = this.createQueryBuilder("wallet");

    if (filters.status) {
      queryBuilder.andWhere("wallet.status = :status", {
        status: filters.status,
      });
    }

    if (filters.currency) {
      queryBuilder.andWhere("wallet.currency = :currency", {
        currency: filters.currency,
      });
    }

    if (filters.userId) {
      queryBuilder.andWhere("wallet.userId = :userId", {
        userId: filters.userId,
      });
    }

    queryBuilder.orderBy("wallet.createdAt", "DESC");

    return await this.paginateQuery(queryBuilder, pagination);
  }

  async updateStatus(
    walletId: string,
    status: WalletStatus
  ): Promise<Wallet | null> {
    return await this.update(walletId, { status } as any);
  }
}
