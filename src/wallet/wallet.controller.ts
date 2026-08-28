import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Param,
  Query,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { WalletService } from "./wallet.service";
import { WalletAccessService } from "../auth/wallet-access.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { CreateWalletDto } from "./dto/create-wallet.dto";
import { DepositDto } from "./dto/deposit.dto";
import { WithdrawDto } from "./dto/withdraw.dto";
import { UpdateWalletStatusDto } from "./dto/update-wallet-status.dto";
import { Wallet, WalletStatus } from "./entities/wallet.entity";
import { ApiResponse as ApiResponseInterface } from "../common/interfaces/api-response.interface";

@ApiTags("Wallets")
@ApiBearerAuth("access-token")
@Controller("wallets")
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly walletAccess: WalletAccessService
  ) {}

  @Post("create-wallet")
  @ApiOperation({ summary: "Create a wallet for the authenticated user" })
  @ApiResponse({ status: 201, description: "Wallet created successfully" })
  @ApiResponse({ status: 401, description: "Missing or invalid JWT" })
  @ApiResponse({
    status: 409,
    description: "Wallet already exists for this user",
  })
  async createWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWalletDto
  ): Promise<ApiResponseInterface<Wallet>> {
    return await this.walletService.createWallet(user.userId, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-wallet/:id")
  @ApiOperation({ summary: "Get a wallet you own" })
  @ApiParam({ name: "id", description: "Wallet ID" })
  @ApiResponse({ status: 200, description: "Wallet found" })
  @ApiResponse({ status: 401, description: "Missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Wallet belongs to another user" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  async getWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string
  ): Promise<ApiResponseInterface<Wallet>> {
    await this.walletAccess.assertOwned(id, user.userId);
    return await this.walletService.getWallet(id);
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-wallet-by-user/:userId")
  @ApiOperation({ summary: "Get the authenticated user's wallet" })
  @ApiParam({ name: "userId", description: "Must match the authenticated user" })
  @ApiResponse({ status: 200, description: "Wallet found" })
  @ApiResponse({ status: 403, description: "Cannot look up another user's wallet" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  async getWalletByUserId(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId") userId: string
  ): Promise<ApiResponseInterface<Wallet>> {
    this.walletAccess.assertSameUser(userId, user.userId);
    return await this.walletService.getWalletByUserId(userId);
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-wallet-balance/:id")
  @ApiOperation({ summary: "Get balance for a wallet you own" })
  @ApiParam({ name: "id", description: "Wallet ID" })
  @ApiResponse({ status: 200, description: "Balance retrieved successfully" })
  @ApiResponse({ status: 403, description: "Wallet belongs to another user" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  async getBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string
  ): Promise<ApiResponseInterface<{ balance: number }>> {
    await this.walletAccess.assertOwned(id, user.userId);
    return await this.walletService.getBalance(id);
  }

  @HttpCode(HttpStatus.OK)
  @Post("deposit")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Deposit funds into a wallet you own" })
  @ApiResponse({ status: 200, description: "Deposit successful" })
  @ApiResponse({
    status: 400,
    description: "Invalid deposit amount or wallet status",
  })
  @ApiResponse({ status: 403, description: "Wallet belongs to another user" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  @ApiResponse({ status: 429, description: "Rate limit exceeded" })
  async deposit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DepositDto
  ): Promise<ApiResponseInterface<Wallet>> {
    await this.walletAccess.assertOwned(dto.walletId, user.userId);
    return await this.walletService.deposit(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post("withdraw")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Withdraw funds from a wallet you own" })
  @ApiResponse({ status: 200, description: "Withdrawal successful" })
  @ApiResponse({
    status: 400,
    description: "Insufficient funds or invalid wallet status",
  })
  @ApiResponse({ status: 403, description: "Wallet belongs to another user" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  @ApiResponse({ status: 429, description: "Rate limit exceeded" })
  async withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WithdrawDto
  ): Promise<ApiResponseInterface<Wallet>> {
    await this.walletAccess.assertOwned(dto.walletId, user.userId);
    return await this.walletService.withdraw(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Put("update-wallet-status/:id")
  @ApiOperation({ summary: "Update status of a wallet you own" })
  @ApiParam({ name: "id", description: "Wallet ID" })
  @ApiResponse({ status: 200, description: "Status updated successfully" })
  @ApiResponse({ status: 403, description: "Wallet belongs to another user" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateWalletStatusDto
  ): Promise<ApiResponseInterface<Wallet>> {
    await this.walletAccess.assertOwned(id, user.userId);
    return await this.walletService.updateWalletStatus(id, dto.status);
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-wallets")
  @ApiOperation({ summary: "List wallets owned by the authenticated user" })
  @ApiQuery({ name: "page", description: "Page number", required: false })
  @ApiQuery({ name: "limit", description: "Items per page", required: false })
  @ApiQuery({
    name: "status",
    description: "Wallet status filter",
    required: false,
  })
  @ApiQuery({
    name: "currency",
    description: "Currency filter",
    required: false,
  })
  @ApiResponse({ status: 200, description: "Wallets retrieved successfully" })
  async getWallets(
    @CurrentUser() user: AuthenticatedUser,
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("status") status?: WalletStatus,
    @Query("currency") currency?: string
  ): Promise<ApiResponseInterface<any>> {
    return await this.walletService.getWalletsForUser(
      user.userId,
      parseInt(page, 10),
      parseInt(limit, 10),
      status,
      currency
    );
  }
}
