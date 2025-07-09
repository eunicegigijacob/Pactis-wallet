import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { Wallet, WalletStatus } from './entities/wallet.entity';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransactionService } from '../transaction/transaction.service';
import { TransactionType } from '../transaction/entities/transaction.entity';
import { WalletRepository } from './repositories/wallet.repository';
import { ApiResponse } from '../common/interfaces/api-response.interface';

@Injectable()
export class WalletService {
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly BALANCE_CACHE_PREFIX = 'wallet:balance:';
  private readonly WALLET_CACHE_PREFIX = 'wallet:';

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly walletRepo: WalletRepository,
    private readonly dataSource: DataSource,
    private readonly transactionService: TransactionService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async createWallet(createWalletDto: CreateWalletDto): Promise<ApiResponse<Wallet>> {
    const { userId, initialBalance = 0, status = WalletStatus.ACTIVE, currency = 'USD' } = createWalletDto;

    // Check if wallet already exists for this user
    const existingWallet = await this.walletRepo.findByUserId(userId);

    if (existingWallet) {
      throw new ConflictException('Wallet already exists for this user');
    }

    // Create new wallet
    const wallet = await this.walletRepo.create({
      userId,
      balance: initialBalance,
      status,
      currency,
    });

    // Cache the wallet
    await this.cacheWallet(wallet);

    // If initial balance > 0, create initial deposit transaction
    if (initialBalance > 0) {
      await this.transactionService.createTransaction({
        transactionId: uuidv4(),
        walletId: wallet.id,
        type: TransactionType.DEPOSIT,
        amount: initialBalance,
        description: 'Initial wallet balance',
        currency,
      });
    }

    return {
      status: true,
      message: 'Wallet created successfully',
      data: wallet,
    };
  }

  async getWallet(walletId: string): Promise<ApiResponse<Wallet>> {
    // Try to get from cache first
    const cachedWallet = await this.cacheManager.get<Wallet>(`${this.WALLET_CACHE_PREFIX}${walletId}`);
    if (cachedWallet) {
      return {
        status: true,
        message: 'Wallet retrieved from cache',
        data: cachedWallet,
      };
    }

    const wallet = await this.walletRepo.findWithTransactions(walletId);

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Cache the wallet
    await this.cacheWallet(wallet);

    return {
      status: true,
      message: 'Wallet retrieved successfully',
      data: wallet,
    };
  }

  async getWalletByUserId(userId: string): Promise<ApiResponse<Wallet>> {
    const wallet = await this.walletRepo.findWithTransactions(userId);

    if (!wallet) {
      throw new NotFoundException('Wallet not found for this user');
    }

    return {
      status: true,
      message: 'Wallet retrieved successfully',
      data: wallet,
    };
  }

  async deposit(depositDto: DepositDto): Promise<ApiResponse<Wallet>> {
    const { walletId, amount, description, currency } = depositDto;

    const result = await this.dataSource.transaction(async (manager) => {
      // Lock the wallet for update
      const wallet = await manager
        .createQueryBuilder(Wallet, 'wallet')
        .setLock('pessimistic_write')
        .where('wallet.id = :walletId', { walletId })
        .getOne();

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (!wallet.canDeposit(amount)) {
        throw new BadRequestException('Invalid deposit amount or wallet status');
      }

      // Update wallet balance
      wallet.addBalance(amount);
      const updatedWallet = await manager.save(wallet);

      // Create transaction record
      await this.transactionService.createTransaction({
        transactionId: uuidv4(),
        walletId,
        type: TransactionType.DEPOSIT,
        amount,
        description,
        currency: currency || wallet.currency,
      });

      // Invalidate cache
      await this.invalidateWalletCache(walletId);

      return updatedWallet;
    });

    return {
      status: true,
      message: 'Deposit successful',
      data: result,
    };
  }

  async withdraw(withdrawDto: WithdrawDto): Promise<ApiResponse<Wallet>> {
    const { walletId, amount, description, currency } = withdrawDto;

    const result = await this.dataSource.transaction(async (manager) => {
      // Lock the wallet for update
      const wallet = await manager
        .createQueryBuilder(Wallet, 'wallet')
        .setLock('pessimistic_write')
        .where('wallet.id = :walletId', { walletId })
        .getOne();

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (!wallet.canWithdraw(amount)) {
        throw new BadRequestException('Insufficient funds or invalid wallet status');
      }

      // Update wallet balance
      wallet.subtractBalance(amount);
      const updatedWallet = await manager.save(wallet);

      // Create transaction record
      await this.transactionService.createTransaction({
        transactionId: uuidv4(),
        walletId,
        type: TransactionType.WITHDRAWAL,
        amount,
        description,
        currency: currency || wallet.currency,
      });

      // Invalidate cache
      await this.invalidateWalletCache(walletId);

      return updatedWallet;
    });

    return {
      status: true,
      message: 'Withdrawal successful',
      data: result,
    };
  }

  async getBalance(walletId: string): Promise<ApiResponse<{ balance: number }>> {
    // Try to get from cache first
    const cachedBalance = await this.cacheManager.get<number>(`${this.BALANCE_CACHE_PREFIX}${walletId}`);
    if (cachedBalance !== null && cachedBalance !== undefined) {
      return {
        status: true,
        message: 'Balance retrieved from cache',
        data: { balance: cachedBalance },
      };
    }

    const wallet = await this.walletRepo.findOneById(walletId);
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    
    // Cache the balance
    await this.cacheManager.set(`${this.BALANCE_CACHE_PREFIX}${walletId}`, wallet.balance, this.CACHE_TTL);

    return {
      status: true,
      message: 'Balance retrieved successfully',
      data: { balance: wallet.balance },
    };
  }

  async updateWalletStatus(walletId: string, status: WalletStatus): Promise<ApiResponse<Wallet>> {
    const wallet = await this.walletRepo.updateStatus(walletId, status);
    
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    
    // Invalidate cache
    await this.invalidateWalletCache(walletId);
    
    return {
      status: true,
      message: 'Wallet status updated successfully',
      data: wallet,
    };
  }

  async getWalletStats(): Promise<ApiResponse<any>> {
    const stats = await this.walletRepo.getWalletStats();
    
    return {
      status: true,
      message: 'Wallet statistics retrieved successfully',
      data: stats,
    };
  }

  private async cacheWallet(wallet: Wallet): Promise<void> {
    await this.cacheManager.set(
      `${this.WALLET_CACHE_PREFIX}${wallet.id}`,
      wallet,
      this.CACHE_TTL
    );
    await this.cacheManager.set(
      `${this.BALANCE_CACHE_PREFIX}${wallet.id}`,
      wallet.balance,
      this.CACHE_TTL
    );
  }

  private async invalidateWalletCache(walletId: string): Promise<void> {
    await this.cacheManager.del(`${this.WALLET_CACHE_PREFIX}${walletId}`);
    await this.cacheManager.del(`${this.BALANCE_CACHE_PREFIX}${walletId}`);
  }
} 