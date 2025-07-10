import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, QueryFailedError } from "typeorm";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { Inject } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";

import { Wallet, WalletStatus } from "./entities/wallet.entity";
import { CreateWalletDto } from "./dto/create-wallet.dto";
import { DepositDto } from "./dto/deposit.dto";
import { WithdrawDto } from "./dto/withdraw.dto";
import { TransactionService } from "../transaction/transaction.service";
import { TransactionType } from "../transaction/entities/transaction.entity";
import { WalletRepository } from "./repositories/wallet.repository";
import { ApiResponse } from "../common/interfaces/api-response.interface";

@Injectable()
export class WalletService {
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly BALANCE_CACHE_PREFIX = "wallet:balance:";
  private readonly WALLET_CACHE_PREFIX = "wallet:";
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 100; // milliseconds

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly walletRepo: WalletRepository,
    private readonly dataSource: DataSource,
    private readonly transactionService: TransactionService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  /**
   * Ensures proper decimal handling for monetary values
   */
  private ensureDecimalPrecision(value: number): number {
    return Math.round(value * 100) / 100;
  }

  async createWallet(
    createWalletDto: CreateWalletDto
  ): Promise<ApiResponse<Wallet>> {
    const {
      userId,
      initialBalance = 0,
      status = WalletStatus.ACTIVE,
      currency = "USD",
    } = createWalletDto;

    // Check if wallet already exists for this user
    const existingWallet = await this.walletRepo.findByUserId(userId);

    if (existingWallet) {
      throw new ConflictException("Wallet already exists for this user");
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
        description: "Initial wallet balance",
        currency,
      });
    }

    return {
      status: true,
      message: "Wallet created successfully",
      data: wallet,
    };
  }

  async getWallet(walletId: string): Promise<ApiResponse<Wallet>> {
    // Try to get from cache first
    const cachedWallet = await this.cacheManager.get<Wallet>(
      `${this.WALLET_CACHE_PREFIX}${walletId}`
    );
    if (cachedWallet) {
      return {
        status: true,
        message: "Wallet retrieved from cache",
        data: cachedWallet,
      };
    }

    const wallet = await this.walletRepo.findOneById(walletId);

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    // Cache the wallet
    await this.cacheWallet(wallet);

    return {
      status: true,
      message: "Wallet retrieved successfully",
      data: wallet,
    };
  }

  async getWalletByUserId(userId: string): Promise<ApiResponse<Wallet>> {
    const wallet = await this.walletRepo.findByUserId(userId);

    if (!wallet) {
      throw new NotFoundException("Wallet not found for this user");
    }

    return {
      status: true,
      message: "Wallet retrieved successfully",
      data: wallet,
    };
  }

  private async executeWithOptimisticLock<T>(
    walletId: string,
    operation: (wallet: Wallet) => Promise<T>
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        // Get the current wallet state
        const wallet = await this.walletRepository.findOne({
          where: { id: walletId },
        });
        if (!wallet) {
          throw new NotFoundException("Wallet not found");
        }

        // Execute the operation with optimistic locking
        return await this.dataSource.transaction(async (manager) => {
          // Re-fetch wallet with current version for optimistic locking
          const currentWallet = await manager.findOne(Wallet, {
            where: { id: walletId },
            lock: { mode: "optimistic", version: wallet.version },
          });

          if (!currentWallet) {
            throw new NotFoundException("Wallet not found");
          }

          // Execute the operation
          const result = await operation(currentWallet);

          // Save the wallet (this will increment the version)
          await manager.save(currentWallet);

          return result;
        });
      } catch (error) {
        lastError = error;

        // Check if it's a version conflict (optimistic lock failure)
        if (
          error.message.includes("version") ||
          error.message.includes("optimistic")
        ) {
          if (attempt < this.MAX_RETRIES) {
            const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        // If it's not a version conflict, throw immediately
        throw error;
      }
    }

    throw (
      lastError ||
      new Error("Failed to execute operation after maximum retries")
    );
  }

  async deposit(depositDto: DepositDto): Promise<ApiResponse<Wallet>> {
    const { walletId, amount, description, currency } = depositDto;

    if (amount <= 0) {
      throw new BadRequestException("Invalid deposit amount");
    }

    const result = await this.executeWithOptimisticLock(
      walletId,
      async (wallet) => {
        if (currency && currency !== wallet.currency) {
          throw new BadRequestException("Currency mismatch");
        }

        if (!wallet.canDeposit(amount)) {
          throw new BadRequestException(
            "Invalid deposit amount or wallet status"
          );
        }

        wallet.addBalance(amount);

        await this.transactionService.createTransaction({
          transactionId: uuidv4(),
          walletId,
          type: TransactionType.DEPOSIT,
          amount: this.ensureDecimalPrecision(amount),
          description,
          currency: currency || wallet.currency,
        });

        return wallet;
      }
    );

    // Invalidate cache AFTER transaction success
    await this.invalidateWalletCache(walletId);

    return {
      status: true,
      message: "Deposit successful",
      data: result,
    };
  }

  async withdraw(withdrawDto: WithdrawDto): Promise<ApiResponse<Wallet>> {
    const { walletId, amount, description, currency } = withdrawDto;

    if (amount <= 0) {
      throw new BadRequestException("Invalid withdrawal amount");
    }

    const result = await this.executeWithOptimisticLock(
      walletId,
      async (wallet) => {
        if (currency && currency !== wallet.currency) {
          throw new BadRequestException("Currency mismatch");
        }

        if (!wallet.canWithdraw(amount)) {
          throw new BadRequestException(
            "Insufficient funds or invalid wallet status"
          );
        }

        wallet.subtractBalance(amount);

        await this.transactionService.createTransaction({
          transactionId: uuidv4(),
          walletId,
          type: TransactionType.WITHDRAWAL,
          amount: this.ensureDecimalPrecision(amount),
          description,
          currency: currency || wallet.currency,
        });

        return wallet;
      }
    );

    // Invalidate cache AFTER transaction success
    await this.invalidateWalletCache(walletId);

    return {
      status: true,
      message: "Withdrawal successful",
      data: result,
    };
  }

  async getBalance(
    walletId: string
  ): Promise<ApiResponse<{ balance: number }>> {
    // Try to get from cache first
    const cachedBalance = await this.cacheManager.get<number>(
      `${this.BALANCE_CACHE_PREFIX}${walletId}`
    );
    if (cachedBalance !== null && cachedBalance !== undefined) {
      return {
        status: true,
        message: "Balance retrieved from cache",
        data: { balance: cachedBalance },
      };
    }

    const wallet = await this.walletRepo.findOneById(walletId);
    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    // Cache the balance
    await this.cacheManager.set(
      `${this.BALANCE_CACHE_PREFIX}${walletId}`,
      wallet.balance,
      this.CACHE_TTL
    );

    return {
      status: true,
      message: "Balance retrieved successfully",
      data: { balance: wallet.balance },
    };
  }

  async updateWalletStatus(
    walletId: string,
    status: WalletStatus
  ): Promise<ApiResponse<Wallet>> {
    const wallet = await this.walletRepo.updateStatus(walletId, status);

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    // Invalidate cache
    await this.invalidateWalletCache(walletId);

    return {
      status: true,
      message: "Wallet status updated successfully",
      data: wallet,
    };
  }

  async getWalletStats(): Promise<ApiResponse<any>> {
    const stats = await this.walletRepo.getWalletStats();

    return {
      status: true,
      message: "Wallet statistics retrieved successfully",
      data: stats,
    };
  }

  async getWallets(
    page: number = 1,
    limit: number = 20,
    status?: WalletStatus,
    currency?: string
  ): Promise<ApiResponse<any>> {
    const filters = { status, currency };
    const pagination = { page, limit };

    const result = await this.walletRepo.findWithFilters(filters, pagination);

    return {
      status: true,
      message: "Wallets retrieved successfully",
      data: result,
    };
  }

  async getWalletsByBalanceRange(
    minBalance: number,
    maxBalance: number,
    page: number = 1,
    limit: number = 20
  ): Promise<ApiResponse<any>> {
    const pagination = { page, limit };

    const result = await this.walletRepo.findWalletsByBalanceRange(
      minBalance,
      maxBalance,
      pagination
    );

    return {
      status: true,
      message: "Wallets retrieved successfully",
      data: result,
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
