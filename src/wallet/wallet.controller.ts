import {
  Body,
  Request,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Param,
  Query,
  UseGuards,
  BadGatewayException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';

import { WalletService } from './wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { Wallet, WalletStatus } from './entities/wallet.entity';
import { ApiResponse as ApiResponseInterface } from '../common/interfaces/api-response.interface';

@ApiTags('Wallets')
@Controller('wallets')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
  ) {}

  @Post('create-wallet')
  @ApiOperation({ summary: 'Create a new wallet' })
  @ApiResponse({ status: 201, description: 'Wallet created successfully' })
  @ApiResponse({ status: 409, description: 'Wallet already exists for this user' })
  async createWallet(@Body() dto: CreateWalletDto): Promise<ApiResponseInterface<Wallet>> {
    return await this.walletService.createWallet(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Get('get-wallet/:id')
  @ApiOperation({ summary: 'Get wallet by ID' })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  @ApiResponse({ status: 200, description: 'Wallet found' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWallet(@Request() req: any): Promise<ApiResponseInterface<Wallet>> {
    return await this.walletService.getWallet(req.params.id);
  }

  @HttpCode(HttpStatus.OK)
  @Get('get-wallet-by-user/:userId')
  @ApiOperation({ summary: 'Get wallet by user ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Wallet found' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWalletByUserId(@Request() req: any): Promise<ApiResponseInterface<Wallet>> {
    return await this.walletService.getWalletByUserId(req.params.userId);
  }

  @HttpCode(HttpStatus.OK)
  @Get('get-wallet-balance/:id')
  @ApiOperation({ summary: 'Get wallet balance' })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  @ApiResponse({ status: 200, description: 'Balance retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getBalance(@Request() req: any): Promise<ApiResponseInterface<{ balance: number }>> {
    return await this.walletService.getBalance(req.params.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('deposit')
  @ApiOperation({ summary: 'Deposit funds into wallet' })
  @ApiResponse({ status: 200, description: 'Deposit successful' })
  @ApiResponse({ status: 400, description: 'Invalid deposit amount or wallet status' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async deposit(@Body() dto: DepositDto): Promise<ApiResponseInterface<Wallet>> {
    return await this.walletService.deposit(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw funds from wallet' })
  @ApiResponse({ status: 200, description: 'Withdrawal successful' })
  @ApiResponse({ status: 400, description: 'Insufficient funds or invalid wallet status' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async withdraw(@Body() dto: WithdrawDto): Promise<ApiResponseInterface<Wallet>> {
    return await this.walletService.withdraw(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Put('update-wallet-status/:id')
  @ApiOperation({ summary: 'Update wallet status' })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async updateStatus(@Request() req: any): Promise<ApiResponseInterface<Wallet>> {
    const { status } = req.body;
    
    if (!status) {
      throw new BadGatewayException('Please provide wallet status');
    }

    return await this.walletService.updateWalletStatus(req.params.id, status);
  }

  @HttpCode(HttpStatus.OK)
  @Get('get-wallet-stats')
  @ApiOperation({ summary: 'Get wallet statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getWalletStats(): Promise<ApiResponseInterface<any>> {
    return await this.walletService.getWalletStats();
  }

  @HttpCode(HttpStatus.OK)
  @Get('get-wallets')
  @ApiOperation({ summary: 'Get all wallets with filters' })
  @ApiQuery({ name: 'page', description: 'Page number', required: false })
  @ApiQuery({ name: 'limit', description: 'Items per page', required: false })
  @ApiQuery({ name: 'status', description: 'Wallet status filter', required: false })
  @ApiQuery({ name: 'currency', description: 'Currency filter', required: false })
  @ApiResponse({ status: 200, description: 'Wallets retrieved successfully' })
  async getWallets(@Request() req: any): Promise<ApiResponseInterface<any>> {
    const { page = 1, limit = 20, status, currency } = req.query;
    
    // This would need to be implemented in the service
    // For now, returning a placeholder response
    return {
      status: true,
      message: 'Wallets retrieved successfully',
      data: {
        items: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      },
    };
  }

  @HttpCode(HttpStatus.OK)
  @Get('get-wallets-by-balance-range')
  @ApiOperation({ summary: 'Get wallets by balance range' })
  @ApiQuery({ name: 'minBalance', description: 'Minimum balance', required: true })
  @ApiQuery({ name: 'maxBalance', description: 'Maximum balance', required: true })
  @ApiQuery({ name: 'page', description: 'Page number', required: false })
  @ApiQuery({ name: 'limit', description: 'Items per page', required: false })
  @ApiResponse({ status: 200, description: 'Wallets retrieved successfully' })
  async getWalletsByBalanceRange(@Request() req: any): Promise<ApiResponseInterface<any>> {
    const { minBalance, maxBalance, page = 1, limit = 20 } = req.query;
    
    if (!minBalance || !maxBalance) {
      throw new BadGatewayException('Please provide minimum and maximum balance');
    }

    // This would need to be implemented in the service
    // For now, returning a placeholder response
    return {
      status: true,
      message: 'Wallets retrieved successfully',
      data: {
        items: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      },
    };
  }
} 