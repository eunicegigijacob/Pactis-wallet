import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { getDataSourceToken } from "@nestjs/typeorm";
import { TransactionService } from "./transaction.service";
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from "./entities/transaction.entity";
import { Wallet } from "../wallet/entities/wallet.entity";
import { TransferDto } from "./dto/transfer.dto";
import { TransactionHistoryDto } from "./dto/transaction-history.dto";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { Queue } from "bull";
import { TransactionRepository } from "./repositories/transaction.repository";
import { WalletRepository } from "../wallet/repositories/wallet.repository";

describe("TransactionService", () => {
  let service: TransactionService;
  let transactionRepository: jest.Mocked<any>;
  let walletRepository: jest.Mocked<any>;
  let dataSource: jest.Mocked<any>;
  let transactionsQueue: jest.Mocked<Queue>;

  const mockTransactionRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockWalletRepository = {
    findOne: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  const mockTransactionsQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: mockWalletRepository,
        },
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
        {
          provide: "BullQueue_transactions",
          useValue: mockTransactionsQueue,
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    transactionRepository = module.get(getRepositoryToken(Transaction));
    walletRepository = module.get(getRepositoryToken(Wallet));
    dataSource = module.get(getDataSourceToken());
    transactionsQueue = module.get("BullQueue_transactions");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createTransaction", () => {
    it("should create a transaction successfully", async () => {
      const transactionData = {
        transactionId: "txn123",
        walletId: "wallet1",
        type: TransactionType.DEPOSIT,
        amount: 100,
        description: "Test deposit",
      };

      const mockTransaction = new Transaction();
      mockTransaction.id = "txn123";
      mockTransaction.type = TransactionType.DEPOSIT;
      mockTransaction.amount = 100;
      mockTransaction.status = TransactionStatus.COMPLETED;

      transactionRepository.create.mockReturnValue(mockTransaction);
      transactionRepository.save.mockResolvedValue(mockTransaction);

      const result = await service.createTransaction(transactionData);

      expect(transactionRepository.create).toHaveBeenCalledWith({
        ...transactionData,
        status: TransactionStatus.COMPLETED,
      });
      expect(transactionRepository.save).toHaveBeenCalledWith(mockTransaction);
      expect(result).toEqual(mockTransaction);
    });
  });

  describe("transfer", () => {
    it("should transfer funds successfully", async () => {
      const transferDto: TransferDto = {
        fromWalletId: "wallet1",
        toWalletId: "wallet2",
        amount: 100,
        description: "Test transfer",
      };

      const fromWallet = {
        id: "wallet1",
        userId: "user1",
        status: "ACTIVE",
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
        balance: 400,
        subtractBalance: jest.fn(),
        addBalance: jest.fn(),
        // add any other required properties with dummy values
      };
      const toWallet = {
        id: "wallet2",
        userId: "user2",
        status: "ACTIVE",
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
        balance: 300,
        subtractBalance: jest.fn(),
        addBalance: jest.fn(),
        // add any other required properties with dummy values
      };

      const mockTransaction = new Transaction();
      mockTransaction.id = "txn123";
      mockTransaction.type = TransactionType.TRANSFER;
      mockTransaction.status = TransactionStatus.COMPLETED;
      mockTransaction.amount = transferDto.amount;
      mockTransaction.markAsCompleted = jest.fn();

      const mockQueryBuilder = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
      };

      transactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder
      );
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(fromWallet)
        .mockResolvedValueOnce(toWallet);

      transactionRepository.create.mockReturnValue(mockTransaction);

      const mockTransactionManager = {
        save: jest.fn(),
      };

      dataSource.transaction.mockImplementation(async (callback) => {
        return await callback(mockTransactionManager);
      });

      const result = await service.transfer(transferDto);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(fromWallet.subtractBalance).toHaveBeenCalledWith(
        transferDto.amount
      );
      expect(toWallet.addBalance).toHaveBeenCalledWith(transferDto.amount);
      expect(mockTransaction.markAsCompleted).toHaveBeenCalled();
      expect(result.transaction).toEqual(mockTransaction);
      expect(result.fromWallet).toEqual(fromWallet);
      expect(result.toWallet).toEqual(toWallet);
    });

    it("should throw BadRequestException if wallets are the same", async () => {
      const transferDto: TransferDto = {
        fromWalletId: "wallet1",
        toWalletId: "wallet1",
        amount: 100,
        description: "Test transfer",
      };

      await expect(service.transfer(transferDto)).rejects.toThrow(
        new BadRequestException("Cannot transfer to the same wallet")
      );
    });
  });

  describe("getTransactionHistory", () => {
    it("should return transaction history successfully", async () => {
      const query: TransactionHistoryDto = {
        walletId: "wallet1",
        page: 1,
        limit: 20,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      const mockTransactions = [
        {
          id: "txn1",
          type: TransactionType.DEPOSIT,
          amount: 100,
          status: TransactionStatus.COMPLETED,
        },
        {
          id: "txn2",
          type: TransactionType.WITHDRAWAL,
          amount: 50,
          status: TransactionStatus.COMPLETED,
        },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockTransactions, 2]),
      };

      transactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder
      );

      const result = await service.getTransactionHistory(query);

      expect(transactionRepository.createQueryBuilder).toHaveBeenCalledWith(
        "transaction"
      );
      expect(result).toEqual({
        transactions: mockTransactions,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });
  });

  describe("getTransaction", () => {
    it("should return transaction by ID successfully", async () => {
      const transactionId = "txn123";
      const mockTransaction = new Transaction();
      mockTransaction.id = transactionId;
      mockTransaction.type = TransactionType.TRANSFER;
      mockTransaction.amount = 100;
      mockTransaction.status = TransactionStatus.COMPLETED;

      transactionRepository.findOne.mockResolvedValue(mockTransaction);

      const result = await service.getTransaction(transactionId);

      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: { transactionId },
        relations: ["wallet", "targetWallet"],
      });
      expect(result).toEqual(mockTransaction);
    });

    it("should throw NotFoundException if transaction not found", async () => {
      const transactionId = "nonexistent";

      transactionRepository.findOne.mockResolvedValue(null);

      await expect(service.getTransaction(transactionId)).rejects.toThrow(
        new NotFoundException("Transaction not found")
      );

      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: { transactionId },
        relations: ["wallet", "targetWallet"],
      });
    });
  });

  describe("getTransactionStats", () => {
    it("should return transaction statistics successfully", async () => {
      const walletId = "wallet123";
      const mockStats = {
        totalDeposits: "1000",
        totalWithdrawals: "500",
        totalTransfers: "200",
        totalFees: "50",
      };

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(mockStats),
      };

      transactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder
      );

      const result = await service.getTransactionStats(walletId);

      expect(transactionRepository.createQueryBuilder).toHaveBeenCalledWith(
        "transaction"
      );
      expect(result).toEqual({
        totalDeposits: 1000,
        totalWithdrawals: 500,
        totalTransfers: 200,
        totalFees: 50,
      });
    });
  });

  describe("getFailedTransactions", () => {
    it("should return failed transactions successfully", async () => {
      const page = 1;
      const limit = 20;

      const mockTransactions = [
        {
          id: "txn1",
          type: TransactionType.TRANSFER,
          amount: 100,
          status: TransactionStatus.FAILED,
          errorMessage: "Insufficient funds",
        },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockTransactions, 1]),
      };

      transactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder
      );

      const result = await service.getFailedTransactions(page, limit);

      expect(transactionRepository.createQueryBuilder).toHaveBeenCalledWith(
        "transaction"
      );
      expect(result).toEqual({
        items: mockTransactions,
        pagination: {
          page,
          limit,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    });
  });

  describe("getPendingTransactions", () => {
    it("should return pending transactions successfully", async () => {
      const page = 1;
      const limit = 20;

      const mockTransactions = [
        {
          id: "txn1",
          type: TransactionType.TRANSFER,
          amount: 100,
          status: TransactionStatus.PENDING,
        },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockTransactions, 1]),
      };

      transactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder
      );

      const result = await service.getPendingTransactions(page, limit);

      expect(transactionRepository.createQueryBuilder).toHaveBeenCalledWith(
        "transaction"
      );
      expect(result).toEqual({
        items: mockTransactions,
        pagination: {
          page,
          limit,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    });
  });

  describe("getTransactionsByDateRange", () => {
    it("should return transactions by date range successfully", async () => {
      const startDate = "2024-01-01";
      const endDate = "2024-12-31";
      const page = 1;
      const limit = 20;

      const mockTransactions = [
        {
          id: "txn1",
          type: TransactionType.DEPOSIT,
          amount: 100,
          status: TransactionStatus.COMPLETED,
          createdAt: "2024-06-15T10:00:00Z",
        },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockTransactions, 1]),
      };

      transactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder
      );

      const result = await service.getTransactionsByDateRange(
        startDate,
        endDate,
        page,
        limit
      );

      expect(transactionRepository.createQueryBuilder).toHaveBeenCalledWith(
        "transaction"
      );
      expect(result).toEqual({
        items: mockTransactions,
        pagination: {
          page,
          limit,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    });
  });
});
