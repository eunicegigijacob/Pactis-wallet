import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { DataSource, EntityManager } from "typeorm";
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";

import { WalletService } from "./wallet.service";
import { WalletRepository } from "./repositories/wallet.repository";
import { Wallet, WalletStatus } from "./entities/wallet.entity";
import { TransactionService } from "../transaction/transaction.service";
import { TransactionType } from "../transaction/entities/transaction.entity";
import { CreateWalletDto } from "./dto/create-wallet.dto";
import { DepositDto } from "./dto/deposit.dto";
import { WithdrawDto } from "./dto/withdraw.dto";

describe("WalletService", () => {
  let service: WalletService;
  let typeormWalletRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let transactionService: {
    createTransaction: jest.Mock;
    requireIdempotentMatch: jest.Mock;
  };
  let walletRepo: { findOneById: jest.Mock };
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const makeWallet = (overrides: Partial<Wallet> = {}): Wallet => {
    const wallet = new Wallet();
    wallet.id = "wallet123";
    wallet.userId = "user123";
    wallet.balance = 500;
    wallet.status = WalletStatus.ACTIVE;
    wallet.currency = "USD";
    wallet.version = 1;
    Object.assign(wallet, overrides);
    return wallet;
  };

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    typeormWalletRepo = {
      findOne: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(async (cb: (em: EntityManager) => Promise<unknown>) =>
        cb(manager as unknown as EntityManager)
      ),
    };

    transactionService = {
      createTransaction: jest.fn(),
      requireIdempotentMatch: jest.fn().mockResolvedValue(null),
    };

    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    walletRepo = {
      findOneById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: getRepositoryToken(Wallet),
          useValue: typeormWalletRepo,
        },
        {
          provide: WalletRepository,
          useValue: {
            findByUserId: jest.fn(),
            findOneById: walletRepo.findOneById,
            create: jest.fn(),
            updateStatus: jest.fn(),
            findWithFilters: jest.fn(),
          },
        },
        { provide: DataSource, useValue: dataSource },
        { provide: TransactionService, useValue: transactionService },
        { provide: CACHE_MANAGER, useValue: cacheManager },
      ],
    }).compile();

    service = module.get(WalletService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createWallet", () => {
    it("should create wallet", async () => {
      const dto: CreateWalletDto = {
        currency: "USD",
        initialBalance: 100,
      };

      manager.findOne.mockResolvedValue(null);
      manager.create.mockImplementation((_cls, data) => {
        const wallet = Object.assign(new Wallet(), data);
        wallet.id = "wallet123";
        wallet.version = 1;
        return wallet;
      });
      manager.save.mockImplementation(async (entity) => entity);
      transactionService.createTransaction.mockResolvedValue({
        id: "tx1",
        type: TransactionType.DEPOSIT,
      });

      const result = await service.createWallet("user123", dto);

      expect(result.status).toBe(true);
      expect(result.message).toBe("Wallet created successfully");
      expect(result.data.userId).toBe("user123");
      expect(result.data.balance).toBe(100);
      expect(transactionService.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: "wallet123",
          type: TransactionType.DEPOSIT,
          amount: 100,
        }),
        manager
      );
      expect(cacheManager.set).toHaveBeenCalled();
    });

    it("should throw ConflictException if wallet already exists for user", async () => {
      manager.findOne.mockResolvedValue(makeWallet());

      await expect(
        service.createWallet("user123", { currency: "USD" })
      ).rejects.toThrow(ConflictException);

      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe("deposit", () => {
    it("should deposit funds", async () => {
      const dto: DepositDto = {
        walletId: "wallet123",
        amount: 100,
        description: "Test deposit",
      };
      const wallet = makeWallet({ balance: 500 });

      typeormWalletRepo.findOne.mockResolvedValue(wallet);
      manager.findOne.mockResolvedValue(wallet);
      manager.save.mockImplementation(async (entity) => entity);
      transactionService.createTransaction.mockResolvedValue({ id: "tx1" });

      const result = await service.deposit(dto);

      expect(result.status).toBe(true);
      expect(result.message).toBe("Deposit successful");
      expect(result.data.balance).toBe(600);
      expect(transactionService.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: "wallet123",
          type: TransactionType.DEPOSIT,
          amount: 100,
        }),
        manager
      );
      expect(cacheManager.del).toHaveBeenCalled();
    });

    it("should return the existing wallet for a matching deposit idempotency key", async () => {
      const dto: DepositDto = {
        walletId: "wallet123",
        amount: 100,
        transactionId: "dep-1",
      };
      const wallet = makeWallet({ balance: 600 });
      const existing = {
        isCompleted: () => true,
        amount: 100,
        walletId: "wallet123",
        type: TransactionType.DEPOSIT,
      };

      transactionService.requireIdempotentMatch.mockResolvedValue(existing);
      walletRepo.findOneById.mockResolvedValue(wallet);

      const result = await service.deposit(dto);

      expect(result.message).toBe("Deposit successful (idempotent)");
      expect(result.data.balance).toBe(600);
      expect(transactionService.createTransaction).not.toHaveBeenCalled();
    });

    it("should throw BadRequestException if amount is invalid", async () => {
      await expect(
        service.deposit({
          walletId: "wallet123",
          amount: -50,
          description: "bad",
        })
      ).rejects.toThrow(new BadRequestException("Invalid deposit amount"));

      expect(typeormWalletRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe("withdraw", () => {
    it("should withdraw funds", async () => {
      const dto: WithdrawDto = {
        walletId: "wallet123",
        amount: 50,
        description: "Test withdrawal",
      };
      const wallet = makeWallet({ balance: 500 });

      typeormWalletRepo.findOne.mockResolvedValue(wallet);
      manager.findOne.mockResolvedValue(wallet);
      manager.save.mockImplementation(async (entity) => entity);
      transactionService.createTransaction.mockResolvedValue({ id: "tx1" });

      const result = await service.withdraw(dto);

      expect(result.status).toBe(true);
      expect(result.message).toBe("Withdrawal successful");
      expect(result.data.balance).toBe(450);
      expect(transactionService.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: "wallet123",
          type: TransactionType.WITHDRAWAL,
          amount: 50,
        }),
        manager
      );
    });

    it("should reject insufficient balance", async () => {
      const dto: WithdrawDto = {
        walletId: "wallet123",
        amount: 600,
        description: "Overdraw",
      };
      const wallet = makeWallet({ balance: 500 });

      typeormWalletRepo.findOne.mockResolvedValue(wallet);
      manager.findOne.mockResolvedValue(wallet);

      await expect(service.withdraw(dto)).rejects.toThrow(
        new BadRequestException(
          "Insufficient funds or invalid wallet status"
        )
      );
      expect(transactionService.createTransaction).not.toHaveBeenCalled();
    });

    it("should throw NotFoundException if wallet not found", async () => {
      typeormWalletRepo.findOne.mockResolvedValue(null);

      await expect(
        service.withdraw({
          walletId: "missing",
          amount: 10,
        })
      ).rejects.toThrow(new NotFoundException("Wallet not found"));
    });
  });

  describe("cache", () => {
    it("should return a cached wallet on cache hit", async () => {
      const wallet = makeWallet();
      cacheManager.get.mockResolvedValue(wallet);

      const result = await service.getWallet("wallet123");

      expect(result.message).toBe("Wallet retrieved from cache");
      expect(result.data).toEqual(wallet);
      expect(walletRepo.findOneById).not.toHaveBeenCalled();
    });

    it("should load from MySQL and populate cache on cache miss", async () => {
      const wallet = makeWallet();
      cacheManager.get.mockResolvedValue(undefined);
      walletRepo.findOneById.mockResolvedValue(wallet);

      const result = await service.getWallet("wallet123");

      expect(result.message).toBe("Wallet retrieved successfully");
      expect(walletRepo.findOneById).toHaveBeenCalledWith("wallet123");
      expect(cacheManager.set).toHaveBeenCalled();
    });

    it("should return a cached balance on cache hit", async () => {
      cacheManager.get.mockResolvedValue(250);

      const result = await service.getBalance("wallet123");

      expect(result.message).toBe("Balance retrieved from cache");
      expect(result.data.balance).toBe(250);
      expect(walletRepo.findOneById).not.toHaveBeenCalled();
    });

    it("should invalidate wallet and balance keys after a deposit", async () => {
      const dto: DepositDto = { walletId: "wallet123", amount: 100 };
      const wallet = makeWallet({ balance: 500 });

      typeormWalletRepo.findOne.mockResolvedValue(wallet);
      manager.findOne.mockResolvedValue(wallet);
      manager.save.mockImplementation(async (entity) => entity);
      transactionService.createTransaction.mockResolvedValue({ id: "tx1" });

      await service.deposit(dto);

      expect(cacheManager.del).toHaveBeenCalledWith("wallet:wallet123");
      expect(cacheManager.del).toHaveBeenCalledWith("wallet:balance:wallet123");
    });
  });
});
