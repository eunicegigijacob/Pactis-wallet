import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { getQueueToken } from "@nestjs/bull";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { DataSource, EntityManager } from "typeorm";
import { BadRequestException, ConflictException } from "@nestjs/common";

import { TransactionService } from "./transaction.service";
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from "./entities/transaction.entity";
import { Wallet, WalletStatus } from "../wallet/entities/wallet.entity";
import { TransferDto } from "./dto/transfer.dto";
import { TransactionRepository } from "./repositories/transaction.repository";
import { TRANSACTION_QUEUE } from "../queue/queue.constants";

describe("TransactionService", () => {
  let service: TransactionService;
  let transactionRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let walletRepository: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let transactionsQueue: { add: jest.Mock };
  let manager: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    getRepository: jest.Mock;
  };

  const FROM_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const TO_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  const makeWallet = (
    id: string,
    balance: number,
    overrides: Partial<Wallet> = {}
  ): Wallet => {
    const wallet = new Wallet();
    wallet.id = id;
    wallet.userId = `user-${id}`;
    wallet.balance = balance;
    wallet.status = WalletStatus.ACTIVE;
    wallet.currency = "USD";
    wallet.version = 1;
    Object.assign(wallet, overrides);
    return wallet;
  };

  const makeQueryBuilder = (wallet: Wallet | null) => ({
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(wallet),
  });

  beforeEach(async () => {
    manager = {
      createQueryBuilder: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      getRepository: jest.fn(),
    };

    transactionRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    walletRepository = {
      findOne: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(async (cb: (em: EntityManager) => Promise<unknown>) =>
        cb(manager as unknown as EntityManager)
      ),
    };

    transactionsQueue = {
      add: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionRepository,
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: walletRepository,
        },
        { provide: DataSource, useValue: dataSource },
        {
          provide: getQueueToken(TRANSACTION_QUEUE),
          useValue: transactionsQueue,
        },
        {
          provide: TransactionRepository,
          useValue: {
            findTransactionsByDateRange: jest.fn(),
            findTransactionsByUserId: jest.fn(),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(TransactionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("transfer", () => {
    it("should transfer funds", async () => {
      const dto: TransferDto = {
        fromWalletId: FROM_ID,
        toWalletId: TO_ID,
        amount: 100,
        description: "Test transfer",
      };

      const fromWallet = makeWallet(FROM_ID, 400);
      const toWallet = makeWallet(TO_ID, 200);
      const ledger = new Transaction();
      ledger.transactionId = "txn-1";
      ledger.markAsCompleted = Transaction.prototype.markAsCompleted;

      transactionRepository.findOne.mockResolvedValue(null);
      manager.createQueryBuilder
        .mockReturnValueOnce(makeQueryBuilder(fromWallet))
        .mockReturnValueOnce(makeQueryBuilder(toWallet));
      manager.create.mockReturnValue(ledger);
      manager.save.mockImplementation(async (entity) => entity);

      const result = await service.transfer(dto);

      expect(result.status).toBe(true);
      expect(result.message).toBe("Transfer completed successfully");
      expect(fromWallet.balance).toBe(300);
      expect(toWallet.balance).toBe(300);
      expect(result.data.transaction.status).toBe(TransactionStatus.COMPLETED);
      expect(manager.createQueryBuilder).toHaveBeenCalledTimes(2);
    });

    it("should throw BadRequestException if wallets are the same", async () => {
      await expect(
        service.transfer({
          fromWalletId: FROM_ID,
          toWalletId: FROM_ID,
          amount: 100,
        })
      ).rejects.toThrow(
        new BadRequestException("Cannot transfer to the same wallet")
      );
    });

    it("should reject duplicate idempotency key", async () => {
      const dto: TransferDto = {
        fromWalletId: FROM_ID,
        toWalletId: TO_ID,
        amount: 100,
        transactionId: "idempotent-key-1",
      };

      const existing = new Transaction();
      existing.transactionId = dto.transactionId;
      existing.status = TransactionStatus.PENDING;
      existing.isCompleted = Transaction.prototype.isCompleted;
      existing.isFailed = Transaction.prototype.isFailed;
      existing.isPending = Transaction.prototype.isPending;

      transactionRepository.findOne.mockResolvedValue(existing);

      await expect(service.transfer(dto)).rejects.toThrow(
        new ConflictException("Duplicate idempotency key")
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it("should reject a racing insert on the unique transactionId index", async () => {
      const dto: TransferDto = {
        fromWalletId: FROM_ID,
        toWalletId: TO_ID,
        amount: 100,
        transactionId: "idempotent-key-2",
      };

      const fromWallet = makeWallet(FROM_ID, 400);
      const toWallet = makeWallet(TO_ID, 200);

      transactionRepository.findOne.mockResolvedValue(null);
      manager.createQueryBuilder
        .mockReturnValueOnce(makeQueryBuilder(fromWallet))
        .mockReturnValueOnce(makeQueryBuilder(toWallet));
      manager.create.mockReturnValue(new Transaction());
      manager.save.mockRejectedValue({
        code: "ER_DUP_ENTRY",
        driverError: { errno: 1062, code: "ER_DUP_ENTRY" },
        message: "Duplicate entry 'idempotent-key-2' for key 'transactionId'",
      });

      await expect(service.transfer(dto)).rejects.toThrow(ConflictException);
      expect(fromWallet.balance).toBe(400);
      expect(toWallet.balance).toBe(200);
    });

    it("should rollback failed transaction", async () => {
      const dto: TransferDto = {
        fromWalletId: FROM_ID,
        toWalletId: TO_ID,
        amount: 100,
        description: "Will fail after debit",
      };

      const fromWallet = makeWallet(FROM_ID, 400);
      const toWallet = makeWallet(TO_ID, 200);
      const ledger = new Transaction();
      ledger.markAsCompleted = Transaction.prototype.markAsCompleted;

      transactionRepository.findOne.mockResolvedValue(null);
      manager.createQueryBuilder
        .mockReturnValueOnce(makeQueryBuilder(fromWallet))
        .mockReturnValueOnce(makeQueryBuilder(toWallet));
      manager.create.mockReturnValue(ledger);

      let saveCount = 0;
      manager.save.mockImplementation(async (entity) => {
        saveCount += 1;
        if (saveCount === 3) {
          throw new Error("simulated commit failure");
        }
        return entity;
      });

      await expect(service.transfer(dto)).rejects.toThrow(
        "simulated commit failure"
      );
      expect(dataSource.transaction).toHaveBeenCalled();
    });
  });

  describe("processTransferAsync", () => {
    it("should stamp a transactionId and use it as the Bull jobId", async () => {
      const dto: TransferDto = {
        fromWalletId: FROM_ID,
        toWalletId: TO_ID,
        amount: 100,
        transactionId: "queued-tx-1",
      };

      transactionsQueue.add.mockResolvedValue({ id: "queued-tx-1" });

      const result = await service.processTransferAsync(dto);

      expect(transactionsQueue.add).toHaveBeenCalledWith(
        "transfer",
        expect.objectContaining({ transactionId: "queued-tx-1" }),
        expect.objectContaining({
          jobId: "queued-tx-1",
          attempts: 3,
        })
      );
      expect(result.data.transactionId).toBe("queued-tx-1");
    });
  });
});
