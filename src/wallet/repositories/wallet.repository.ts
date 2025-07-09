import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository, PaginationOptions, PaginationResult } from '../../common/repositories/base.repository';
import { Wallet, WalletStatus } from '../entities/wallet.entity';

export interface WalletFilters {
  status?: WalletStatus;
  currency?: string;
  userId?: string;
}

@Injectable()
export class WalletRepository extends BaseRepository<Wallet> {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
  ) {
    super(walletRepo);
  }

  async findByUserId(userId: string): Promise<Wallet | null> {
    return await this.findOneBy({ userId } as any);
  }

  async findByStatus(status: WalletStatus): Promise<Wallet[]> {
    return await this.findMany({ where: { status } as any });
  }

  async findByCurrency(currency: string): Promise<Wallet[]> {
    return await this.findMany({ where: { currency } as any });
  }

  async findWithTransactions(walletId: string): Promise<Wallet | null> {
    return await this.walletRepo.findOne({
      where: { id: walletId },
      relations: ['transactions'],
    });
  }

  async findWithFilters(
    filters: WalletFilters,
    pagination: PaginationOptions,
  ): Promise<PaginationResult<Wallet>> {
    const queryBuilder = this.createQueryBuilder('wallet');

    if (filters.status) {
      queryBuilder.andWhere('wallet.status = :status', { status: filters.status });
    }

    if (filters.currency) {
      queryBuilder.andWhere('wallet.currency = :currency', { currency: filters.currency });
    }

    if (filters.userId) {
      queryBuilder.andWhere('wallet.userId = :userId', { userId: filters.userId });
    }

    queryBuilder.orderBy('wallet.createdAt', 'DESC');

    return await this.paginateQuery(queryBuilder, pagination);
  }

  async updateBalance(walletId: string, newBalance: number): Promise<Wallet | null> {
    return await this.update(walletId, { balance: newBalance } as any);
  }

  async updateStatus(walletId: string, status: WalletStatus): Promise<Wallet | null> {
    return await this.update(walletId, { status } as any);
  }

  async getWalletStats(): Promise<{
    totalWallets: number;
    activeWallets: number;
    totalBalance: number;
    averageBalance: number;
  }> {
    const totalWallets = await this.count();
    const activeWallets = await this.count({ status: WalletStatus.ACTIVE } as any);
    
    const balanceStats = await this.walletRepo
      .createQueryBuilder('wallet')
      .select([
        'SUM(wallet.balance) as totalBalance',
        'AVG(wallet.balance) as averageBalance',
      ])
      .getRawOne();

    return {
      totalWallets,
      activeWallets,
      totalBalance: parseFloat(balanceStats.totalBalance) || 0,
      averageBalance: parseFloat(balanceStats.averageBalance) || 0,
    };
  }

  async findWalletsByBalanceRange(
    minBalance: number,
    maxBalance: number,
    pagination: PaginationOptions,
  ): Promise<PaginationResult<Wallet>> {
    const queryBuilder = this.createQueryBuilder('wallet')
      .where('wallet.balance >= :minBalance', { minBalance })
      .andWhere('wallet.balance <= :maxBalance', { maxBalance })
      .orderBy('wallet.balance', 'DESC');

    return await this.paginateQuery(queryBuilder, pagination);
  }
} 