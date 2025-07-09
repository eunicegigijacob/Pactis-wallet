import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WalletService } from './wallet.service';
import { WalletRepository } from './wallet.repository';
import { Wallet, WalletStatus } from './entities/wallet.entity';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('WalletService', () => {
  let service: WalletService;
  let walletRepository: jest.Mocked<WalletRepository>;

  const mockWalletRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findByUserId: jest.fn(),
    updateBalance: jest.fn(),
    updateStatus: jest.fn(),
    findWithFilters: jest.fn(),
    findWithBalanceRange: jest.fn(),
    getStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: WalletRepository,
          useValue: mockWalletRepository,
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    walletRepository = module.get(WalletRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createWallet', () => {
    it('should create a new wallet successfully', async () => {
      const createWalletDto: CreateWalletDto = {
        userId: 'user123',
        currency: 'USD',
        initialBalance: 100,
      };

      const mockWallet = new Wallet();
      mockWallet.id = 'wallet123';
      mockWallet.userId = createWalletDto.userId;
      mockWallet.currency = createWalletDto.currency;
      mockWallet.balance = createWalletDto.initialBalance;
      mockWallet.status = WalletStatus.ACTIVE;

      walletRepository.findByUserId.mockResolvedValue(null);
      walletRepository.create.mockReturnValue(mockWallet);
      walletRepository.save.mockResolvedValue(mockWallet);

      const result = await service.createWallet(createWalletDto);

      expect(walletRepository.findByUserId).toHaveBeenCalledWith(createWalletDto.userId);
      expect(walletRepository.create).toHaveBeenCalledWith(createWalletDto);
      expect(walletRepository.save).toHaveBeenCalledWith(mockWallet);
      expect(result.status).toBe(true);
      expect(result.message).toBe('Wallet created successfully');
      expect(result.data).toEqual(mockWallet);
    });

    it('should throw BadRequestException if wallet already exists for user', async () => {
      const createWalletDto: CreateWalletDto = {
        userId: 'user123',
        currency: 'USD',
        initialBalance: 100,
      };

      const existingWallet = new Wallet();
      existingWallet.id = 'existing123';
      existingWallet.userId = createWalletDto.userId;

      walletRepository.findByUserId.mockResolvedValue(existingWallet);

      await expect(service.createWallet(createWalletDto)).rejects.toThrow(
        new BadRequestException('Wallet already exists for this user'),
      );

      expect(walletRepository.findByUserId).toHaveBeenCalledWith(createWalletDto.userId);
      expect(walletRepository.create).not.toHaveBeenCalled();
      expect(walletRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getWallet', () => {
    it('should return wallet by ID successfully', async () => {
      const walletId = 'wallet123';
      const mockWallet = new Wallet();
      mockWallet.id = walletId;
      mockWallet.userId = 'user123';
      mockWallet.balance = 500;
      mockWallet.status = WalletStatus.ACTIVE;

      walletRepository.findOne.mockResolvedValue(mockWallet);

      const result = await service.getWallet(walletId);

      expect(walletRepository.findOne).toHaveBeenCalledWith(walletId);
      expect(result.status).toBe(true);
      expect(result.message).toBe('Wallet retrieved successfully');
      expect(result.data).toEqual(mockWallet);
    });

    it('should throw NotFoundException if wallet not found', async () => {
      const walletId = 'nonexistent';

      walletRepository.findOne.mockResolvedValue(null);

      await expect(service.getWallet(walletId)).rejects.toThrow(
        new NotFoundException('Wallet not found'),
      );

      expect(walletRepository.findOne).toHaveBeenCalledWith(walletId);
    });
  });

  describe('getWalletByUserId', () => {
    it('should return wallet by user ID successfully', async () => {
      const userId = 'user123';
      const mockWallet = new Wallet();
      mockWallet.id = 'wallet123';
      mockWallet.userId = userId;
      mockWallet.balance = 500;
      mockWallet.status = WalletStatus.ACTIVE;

      walletRepository.findByUserId.mockResolvedValue(mockWallet);

      const result = await service.getWalletByUserId(userId);

      expect(walletRepository.findByUserId).toHaveBeenCalledWith(userId);
      expect(result.status).toBe(true);
      expect(result.message).toBe('Wallet retrieved successfully');
      expect(result.data).toEqual(mockWallet);
    });

    it('should throw NotFoundException if wallet not found for user', async () => {
      const userId = 'nonexistent';

      walletRepository.findByUserId.mockResolvedValue(null);

      await expect(service.getWalletByUserId(userId)).rejects.toThrow(
        new NotFoundException('Wallet not found for this user'),
      );

      expect(walletRepository.findByUserId).toHaveBeenCalledWith(userId);
    });
  });

  describe('getBalance', () => {
    it('should return wallet balance successfully', async () => {
      const walletId = 'wallet123';
      const mockWallet = new Wallet();
      mockWallet.id = walletId;
      mockWallet.balance = 750.50;

      walletRepository.findOne.mockResolvedValue(mockWallet);

      const result = await service.getBalance(walletId);

      expect(walletRepository.findOne).toHaveBeenCalledWith(walletId);
      expect(result.status).toBe(true);
      expect(result.message).toBe('Balance retrieved successfully');
      expect(result.data).toEqual({ balance: 750.50 });
    });

    it('should throw NotFoundException if wallet not found', async () => {
      const walletId = 'nonexistent';

      walletRepository.findOne.mockResolvedValue(null);

      await expect(service.getBalance(walletId)).rejects.toThrow(
        new NotFoundException('Wallet not found'),
      );

      expect(walletRepository.findOne).toHaveBeenCalledWith(walletId);
    });
  });

  describe('deposit', () => {
    it('should deposit funds successfully', async () => {
      const depositDto: DepositDto = {
        walletId: 'wallet123',
        amount: 100,
        description: 'Test deposit',
      };

      const mockWallet = new Wallet();
      mockWallet.id = depositDto.walletId;
      mockWallet.balance = 500;
      mockWallet.status = WalletStatus.ACTIVE;

      const updatedWallet = { ...mockWallet, balance: 600 };

      walletRepository.findOne.mockResolvedValue(mockWallet);
      walletRepository.updateBalance.mockResolvedValue(updatedWallet);

      const result = await service.deposit(depositDto);

      expect(walletRepository.findOne).toHaveBeenCalledWith(depositDto.walletId);
      expect(walletRepository.updateBalance).toHaveBeenCalledWith(
        depositDto.walletId,
        600,
      );
      expect(result.status).toBe(true);
      expect(result.message).toBe('Deposit successful');
      expect(result.data).toEqual(updatedWallet);
    });

    it('should throw BadRequestException if wallet is not active', async () => {
      const depositDto: DepositDto = {
        walletId: 'wallet123',
        amount: 100,
        description: 'Test deposit',
      };

      const mockWallet = new Wallet();
      mockWallet.id = depositDto.walletId;
      mockWallet.status = WalletStatus.SUSPENDED;

      walletRepository.findOne.mockResolvedValue(mockWallet);

      await expect(service.deposit(depositDto)).rejects.toThrow(
        new BadRequestException('Wallet is not active'),
      );

      expect(walletRepository.findOne).toHaveBeenCalledWith(depositDto.walletId);
      expect(walletRepository.updateBalance).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if amount is invalid', async () => {
      const depositDto: DepositDto = {
        walletId: 'wallet123',
        amount: -50,
        description: 'Test deposit',
      };

      await expect(service.deposit(depositDto)).rejects.toThrow(
        new BadRequestException('Invalid deposit amount'),
      );

      expect(walletRepository.findOne).not.toHaveBeenCalled();
      expect(walletRepository.updateBalance).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('should withdraw funds successfully', async () => {
      const withdrawDto: WithdrawDto = {
        walletId: 'wallet123',
        amount: 50,
        description: 'Test withdrawal',
      };

      const mockWallet = new Wallet();
      mockWallet.id = withdrawDto.walletId;
      mockWallet.balance = 500;
      mockWallet.status = WalletStatus.ACTIVE;

      const updatedWallet = { ...mockWallet, balance: 450 };

      walletRepository.findOne.mockResolvedValue(mockWallet);
      walletRepository.updateBalance.mockResolvedValue(updatedWallet);

      const result = await service.withdraw(withdrawDto);

      expect(walletRepository.findOne).toHaveBeenCalledWith(withdrawDto.walletId);
      expect(walletRepository.updateBalance).toHaveBeenCalledWith(
        withdrawDto.walletId,
        450,
      );
      expect(result.status).toBe(true);
      expect(result.message).toBe('Withdrawal successful');
      expect(result.data).toEqual(updatedWallet);
    });

    it('should throw BadRequestException if insufficient funds', async () => {
      const withdrawDto: WithdrawDto = {
        walletId: 'wallet123',
        amount: 600,
        description: 'Test withdrawal',
      };

      const mockWallet = new Wallet();
      mockWallet.id = withdrawDto.walletId;
      mockWallet.balance = 500;
      mockWallet.status = WalletStatus.ACTIVE;

      walletRepository.findOne.mockResolvedValue(mockWallet);

      await expect(service.withdraw(withdrawDto)).rejects.toThrow(
        new BadRequestException('Insufficient funds'),
      );

      expect(walletRepository.findOne).toHaveBeenCalledWith(withdrawDto.walletId);
      expect(walletRepository.updateBalance).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if wallet is not active', async () => {
      const withdrawDto: WithdrawDto = {
        walletId: 'wallet123',
        amount: 50,
        description: 'Test withdrawal',
      };

      const mockWallet = new Wallet();
      mockWallet.id = withdrawDto.walletId;
      mockWallet.status = WalletStatus.SUSPENDED;

      walletRepository.findOne.mockResolvedValue(mockWallet);

      await expect(service.withdraw(withdrawDto)).rejects.toThrow(
        new BadRequestException('Wallet is not active'),
      );

      expect(walletRepository.findOne).toHaveBeenCalledWith(withdrawDto.walletId);
      expect(walletRepository.updateBalance).not.toHaveBeenCalled();
    });
  });

  describe('updateWalletStatus', () => {
    it('should update wallet status successfully', async () => {
      const walletId = 'wallet123';
      const newStatus = WalletStatus.SUSPENDED;

      const mockWallet = new Wallet();
      mockWallet.id = walletId;
      mockWallet.status = WalletStatus.ACTIVE;

      const updatedWallet = { ...mockWallet, status: newStatus };

      walletRepository.findOne.mockResolvedValue(mockWallet);
      walletRepository.updateStatus.mockResolvedValue(updatedWallet);

      const result = await service.updateWalletStatus(walletId, newStatus);

      expect(walletRepository.findOne).toHaveBeenCalledWith(walletId);
      expect(walletRepository.updateStatus).toHaveBeenCalledWith(walletId, newStatus);
      expect(result.status).toBe(true);
      expect(result.message).toBe('Wallet status updated successfully');
      expect(result.data).toEqual(updatedWallet);
    });

    it('should throw NotFoundException if wallet not found', async () => {
      const walletId = 'nonexistent';
      const newStatus = WalletStatus.SUSPENDED;

      walletRepository.findOne.mockResolvedValue(null);

      await expect(service.updateWalletStatus(walletId, newStatus)).rejects.toThrow(
        new NotFoundException('Wallet not found'),
      );

      expect(walletRepository.findOne).toHaveBeenCalledWith(walletId);
      expect(walletRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('getWalletStats', () => {
    it('should return wallet statistics successfully', async () => {
      const mockStats = {
        totalWallets: 100,
        activeWallets: 85,
        suspendedWallets: 10,
        closedWallets: 5,
        totalBalance: 50000,
        averageBalance: 500,
      };

      walletRepository.getStats.mockResolvedValue(mockStats);

      const result = await service.getWalletStats();

      expect(walletRepository.getStats).toHaveBeenCalled();
      expect(result.status).toBe(true);
      expect(result.message).toBe('Wallet statistics retrieved successfully');
      expect(result.data).toEqual(mockStats);
    });
  });
}); 