import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransactionService } from './transaction.service';
import { TransactionRepository } from './transaction.repository';
import { WalletRepository } from '../wallet/wallet.repository';
import { Transaction, TransactionType, TransactionStatus } from './entities/transaction.entity';
import { TransferDto } from './dto/transfer.dto';
import { TransactionHistoryDto } from './dto/transaction-history.dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('TransactionService', () => {
  let service: TransactionService;
  let transactionRepository: jest.Mocked<TransactionRepository>;
  let walletRepository: jest.Mocked<WalletRepository>;

  const mockTransactionRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findWithFilters: jest.fn(),
    getStats: jest.fn(),
    findFailedTransactions: jest.fn(),
    findPendingTransactions: jest.fn(),
    findTransactionsByDateRange: jest.fn(),
  };

  const mockWalletRepository = {
    findOne: jest.fn(),
    updateBalance: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: TransactionRepository,
          useValue: mockTransactionRepository,
        },
        {
          provide: WalletRepository,
          useValue: mockWalletRepository,
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    transactionRepository = module.get(TransactionRepository);
    walletRepository = module.get(WalletRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('transfer', () => {
    it('should transfer funds successfully', async () => {
      const transferDto: TransferDto = {
        fromWalletId: 'wallet1',
        toWalletId: 'wallet2',
        amount: 100,
        description: 'Test transfer',
      };

      const fromWallet = {
        id: transferDto.fromWalletId,
        balance: 500,
        status: 'ACTIVE',
      };

      const toWallet = {
        id: transferDto.toWalletId,
        balance: 200,
        status: 'ACTIVE',
      };

      const mockTransaction = new Transaction();
      mockTransaction.id = 'txn123';
      mockTransaction.type = TransactionType.TRANSFER;
      mockTransaction.status = TransactionStatus.COMPLETED;
      mockTransaction.amount = transferDto.amount;

      walletRepository.findOne
        .mockResolvedValueOnce(fromWallet)
        .mockResolvedValueOnce(toWallet);

      walletRepository.updateBalance
        .mockResolvedValueOnce({ ...fromWallet, balance: 400 })
        .mockResolvedValueOnce({ ...toWallet, balance: 300 });

      transactionRepository.create.mockReturnValue(mockTransaction);
      transactionRepository.save.mockResolvedValue(mockTransaction);

      const result = await service.transfer(transferDto);

      expect(walletRepository.findOne).toHaveBeenCalledWith(transferDto.fromWalletId);
      expect(walletRepository.findOne).toHaveBeenCalledWith(transferDto.toWalletId);
      expect(walletRepository.updateBalance).toHaveBeenCalledWith(transferDto.fromWalletId, 400);
      expect(walletRepository.updateBalance).toHaveBeenCalledWith(transferDto.toWalletId, 300);
      expect(transactionRepository.create).toHaveBeenCalledWith({
        type: TransactionType.TRANSFER,
        amount: transferDto.amount,
        fromWalletId: transferDto.fromWalletId,
        toWalletId: transferDto.toWalletId,
        description: transferDto.description,
        status: TransactionStatus.COMPLETED,
      });
      expect(transactionRepository.save).toHaveBeenCalledWith(mockTransaction);
      expect(result.transaction).toEqual(mockTransaction);
      expect(result.fromWallet.balance).toBe(400);
      expect(result.toWallet.balance).toBe(300);
    });

    it('should throw BadRequestException if from wallet not found', async () => {
      const transferDto: TransferDto = {
        fromWalletId: 'nonexistent',
        toWalletId: 'wallet2',
        amount: 100,
        description: 'Test transfer',
      };

      walletRepository.findOne.mockResolvedValue(null);

      await expect(service.transfer(transferDto)).rejects.toThrow(
        new BadRequestException('From wallet not found'),
      );

      expect(walletRepository.findOne).toHaveBeenCalledWith(transferDto.fromWalletId);
      expect(walletRepository.updateBalance).not.toHaveBeenCalled();
      expect(transactionRepository.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if to wallet not found', async () => {
      const transferDto: TransferDto = {
        fromWalletId: 'wallet1',
        toWalletId: 'nonexistent',
        amount: 100,
        description: 'Test transfer',
      };

      const fromWallet = {
        id: transferDto.fromWalletId,
        balance: 500,
        status: 'ACTIVE',
      };

      walletRepository.findOne
        .mockResolvedValueOnce(fromWallet)
        .mockResolvedValueOnce(null);

      await expect(service.transfer(transferDto)).rejects.toThrow(
        new BadRequestException('To wallet not found'),
      );

      expect(walletRepository.findOne).toHaveBeenCalledWith(transferDto.fromWalletId);
      expect(walletRepository.findOne).toHaveBeenCalledWith(transferDto.toWalletId);
      expect(walletRepository.updateBalance).not.toHaveBeenCalled();
      expect(transactionRepository.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if insufficient funds', async () => {
      const transferDto: TransferDto = {
        fromWalletId: 'wallet1',
        toWalletId: 'wallet2',
        amount: 600,
        description: 'Test transfer',
      };

      const fromWallet = {
        id: transferDto.fromWalletId,
        balance: 500,
        status: 'ACTIVE',
      };

      const toWallet = {
        id: transferDto.toWalletId,
        balance: 200,
        status: 'ACTIVE',
      };

      walletRepository.findOne
        .mockResolvedValueOnce(fromWallet)
        .mockResolvedValueOnce(toWallet);

      await expect(service.transfer(transferDto)).rejects.toThrow(
        new BadRequestException('Insufficient funds'),
      );

      expect(walletRepository.findOne).toHaveBeenCalledWith(transferDto.fromWalletId);
      expect(walletRepository.findOne).toHaveBeenCalledWith(transferDto.toWalletId);
      expect(walletRepository.updateBalance).not.toHaveBeenCalled();
      expect(transactionRepository.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if amount is invalid', async () => {
      const transferDto: TransferDto = {
        fromWalletId: 'wallet1',
        toWalletId: 'wallet2',
        amount: -50,
        description: 'Test transfer',
      };

      await expect(service.transfer(transferDto)).rejects.toThrow(
        new BadRequestException('Invalid transfer amount'),
      );

      expect(walletRepository.findOne).not.toHaveBeenCalled();
      expect(walletRepository.updateBalance).not.toHaveBeenCalled();
      expect(transactionRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('processTransferAsync', () => {
    it('should process transfer asynchronously', async () => {
      const transferDto: TransferDto = {
        fromWalletId: 'wallet1',
        toWalletId: 'wallet2',
        amount: 100,
        description: 'Test transfer',
      };

      // Mock the transfer method
      jest.spyOn(service, 'transfer').mockResolvedValue({
        transaction: new Transaction(),
        fromWallet: { id: 'wallet1', balance: 400 },
        toWallet: { id: 'wallet2', balance: 300 },
      });

      await service.processTransferAsync(transferDto);

      expect(service.transfer).toHaveBeenCalledWith(transferDto);
    });
  });

  describe('getTransactionHistory', () => {
    it('should return transaction history successfully', async () => {
      const query: TransactionHistoryDto = {
        walletId: 'wallet123',
        page: 1,
        limit: 20,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      const mockTransactions = [
        {
          id: 'txn1',
          type: TransactionType.DEPOSIT,
          amount: 100,
          status: TransactionStatus.COMPLETED,
        },
        {
          id: 'txn2',
          type: TransactionType.WITHDRAWAL,
          amount: 50,
          status: TransactionStatus.COMPLETED,
        },
      ];

      const mockResult = {
        transactions: mockTransactions,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      };

      transactionRepository.findWithFilters.mockResolvedValue(mockResult);

      const result = await service.getTransactionHistory(query);

      expect(transactionRepository.findWithFilters).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getTransaction', () => {
    it('should return transaction by ID successfully', async () => {
      const transactionId = 'txn123';
      const mockTransaction = new Transaction();
      mockTransaction.id = transactionId;
      mockTransaction.type = TransactionType.TRANSFER;
      mockTransaction.amount = 100;
      mockTransaction.status = TransactionStatus.COMPLETED;

      transactionRepository.findOne.mockResolvedValue(mockTransaction);

      const result = await service.getTransaction(transactionId);

      expect(transactionRepository.findOne).toHaveBeenCalledWith(transactionId);
      expect(result).toEqual(mockTransaction);
    });

    it('should throw NotFoundException if transaction not found', async () => {
      const transactionId = 'nonexistent';

      transactionRepository.findOne.mockResolvedValue(null);

      await expect(service.getTransaction(transactionId)).rejects.toThrow(
        new NotFoundException('Transaction not found'),
      );

      expect(transactionRepository.findOne).toHaveBeenCalledWith(transactionId);
    });
  });

  describe('getTransactionStats', () => {
    it('should return transaction statistics successfully', async () => {
      const walletId = 'wallet123';
      const mockStats = {
        totalDeposits: 1000,
        totalWithdrawals: 500,
        totalTransfers: 200,
        totalFees: 50,
      };

      transactionRepository.getStats.mockResolvedValue(mockStats);

      const result = await service.getTransactionStats(walletId);

      expect(transactionRepository.getStats).toHaveBeenCalledWith(walletId);
      expect(result).toEqual(mockStats);
    });
  });

  describe('getFailedTransactions', () => {
    it('should return failed transactions successfully', async () => {
      const page = 1;
      const limit = 20;

      const mockTransactions = [
        {
          id: 'txn1',
          type: TransactionType.TRANSFER,
          amount: 100,
          status: TransactionStatus.FAILED,
          errorMessage: 'Insufficient funds',
        },
      ];

      const mockResult = {
        items: mockTransactions,
        pagination: {
          page,
          limit,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      transactionRepository.findFailedTransactions.mockResolvedValue(mockResult);

      const result = await service.getFailedTransactions(page, limit);

      expect(transactionRepository.findFailedTransactions).toHaveBeenCalledWith(page, limit);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getPendingTransactions', () => {
    it('should return pending transactions successfully', async () => {
      const page = 1;
      const limit = 20;

      const mockTransactions = [
        {
          id: 'txn1',
          type: TransactionType.TRANSFER,
          amount: 100,
          status: TransactionStatus.PENDING,
        },
      ];

      const mockResult = {
        items: mockTransactions,
        pagination: {
          page,
          limit,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      transactionRepository.findPendingTransactions.mockResolvedValue(mockResult);

      const result = await service.getPendingTransactions(page, limit);

      expect(transactionRepository.findPendingTransactions).toHaveBeenCalledWith(page, limit);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getTransactionsByDateRange', () => {
    it('should return transactions by date range successfully', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-12-31';
      const page = 1;
      const limit = 20;

      const mockTransactions = [
        {
          id: 'txn1',
          type: TransactionType.DEPOSIT,
          amount: 100,
          status: TransactionStatus.COMPLETED,
          createdAt: '2024-06-15T10:00:00Z',
        },
      ];

      const mockResult = {
        items: mockTransactions,
        pagination: {
          page,
          limit,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      transactionRepository.findTransactionsByDateRange.mockResolvedValue(mockResult);

      const result = await service.getTransactionsByDateRange(startDate, endDate, page, limit);

      expect(transactionRepository.findTransactionsByDateRange).toHaveBeenCalledWith(
        startDate,
        endDate,
        page,
        limit,
      );
      expect(result).toEqual(mockResult);
    });
  });
}); 