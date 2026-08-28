import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Param,
  Query,
  BadRequestException,
  ForbiddenException,
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

import { TransactionService } from "./transaction.service";
import { WalletAccessService } from "../auth/wallet-access.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { TransferDto } from "./dto/transfer.dto";
import { TransactionHistoryDto } from "./dto/transaction-history.dto";
import { Transaction } from "./entities/transaction.entity";
import { ApiResponse as ApiResponseInterface } from "../common/interfaces/api-response.interface";

@ApiTags("Transactions")
@ApiBearerAuth("access-token")
@Controller("transactions")
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly walletAccess: WalletAccessService
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post("transfer")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Transfer funds from a wallet you own" })
  @ApiResponse({ status: 200, description: "Transfer successful" })
  @ApiResponse({ status: 400, description: "Invalid transfer request" })
  @ApiResponse({ status: 401, description: "Missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Source wallet belongs to another user" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  @ApiResponse({ status: 429, description: "Rate limit exceeded" })
  async transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TransferDto
  ): Promise<
    ApiResponseInterface<{
      transaction: Transaction;
      fromWallet: { id: string };
      toWallet: { id: string; balance: number };
    }>
  > {
    await this.walletAccess.assertOwned(dto.fromWalletId, user.userId);
    const result = await this.transactionService.transfer(dto);
    return {
      status: result.status,
      message: result.message,
      data: {
        transaction: result.data.transaction,
        fromWallet: {
          id: result.data.fromWallet.id,
        },
        toWallet: {
          id: result.data.toWallet.id,
          balance: result.data.toWallet.balance,
        },
      },
    };
  }

  @HttpCode(HttpStatus.ACCEPTED)
  @Post("transfer-async")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Queue an asynchronous transfer from a wallet you own" })
  @ApiResponse({ status: 202, description: "Transfer queued for processing" })
  @ApiResponse({ status: 403, description: "Source wallet belongs to another user" })
  @ApiResponse({ status: 429, description: "Rate limit exceeded" })
  async transferAsync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TransferDto
  ): Promise<ApiResponseInterface<{ message: string; transactionId: string }>> {
    await this.walletAccess.assertOwned(dto.fromWalletId, user.userId);
    return await this.transactionService.processTransferAsync(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-transaction-history")
  @ApiOperation({ summary: "Get transaction history for a wallet you own" })
  @ApiQuery({ name: "walletId", description: "Wallet ID", required: true })
  @ApiQuery({ name: "page", description: "Page number", required: false })
  @ApiQuery({ name: "limit", description: "Items per page", required: false })
  @ApiQuery({
    name: "type",
    description: "Transaction type filter",
    required: false,
  })
  @ApiQuery({
    name: "status",
    description: "Transaction status filter",
    required: false,
  })
  @ApiQuery({
    name: "startDate",
    description: "Start date filter",
    required: false,
  })
  @ApiQuery({
    name: "endDate",
    description: "End date filter",
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: "Transaction history retrieved successfully",
  })
  @ApiResponse({ status: 403, description: "Wallet belongs to another user" })
  async getTransactionHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query("walletId") walletId: string,
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("type") type?: TransactionHistoryDto["type"],
    @Query("status") status?: TransactionHistoryDto["status"],
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ): Promise<
    ApiResponseInterface<{
      transactions: Transaction[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>
  > {
    if (!walletId) {
      throw new BadRequestException("Please provide wallet ID");
    }

    await this.walletAccess.assertOwned(walletId, user.userId);

    const query: TransactionHistoryDto = {
      walletId,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      type,
      status,
      startDate,
      endDate,
    };

    return await this.transactionService.getTransactionHistory(query);
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-transaction/:transactionId")
  @ApiOperation({ summary: "Get a transaction you participated in" })
  @ApiParam({ name: "transactionId", description: "Idempotency / transaction ID" })
  @ApiResponse({ status: 200, description: "Transaction found" })
  @ApiResponse({ status: 403, description: "Transaction belongs to another user" })
  @ApiResponse({ status: 404, description: "Transaction not found" })
  async getTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param("transactionId") transactionId: string
  ): Promise<ApiResponseInterface<Transaction>> {
    const result = await this.transactionService.getTransaction(transactionId);
    await this.walletAccess.assertTransactionVisible(result.data, user.userId);
    return result;
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-transaction-stats/:walletId")
  @ApiOperation({ summary: "Get transaction statistics for a wallet you own" })
  @ApiParam({ name: "walletId", description: "Wallet ID" })
  @ApiResponse({
    status: 200,
    description: "Statistics retrieved successfully",
  })
  @ApiResponse({ status: 403, description: "Wallet belongs to another user" })
  async getTransactionStats(
    @CurrentUser() user: AuthenticatedUser,
    @Param("walletId") walletId: string
  ): Promise<
    ApiResponseInterface<{
      totalDeposits: number;
      totalWithdrawals: number;
      totalTransfers: number;
      totalFees: number;
    }>
  > {
    await this.walletAccess.assertOwned(walletId, user.userId);
    return await this.transactionService.getTransactionStats(walletId);
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-failed-transactions")
  @ApiOperation({ summary: "Get failed transactions for wallets you own" })
  @ApiQuery({ name: "page", description: "Page number", required: false })
  @ApiQuery({ name: "limit", description: "Items per page", required: false })
  @ApiResponse({
    status: 200,
    description: "Failed transactions retrieved successfully",
  })
  async getFailedTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query("page") page = "1",
    @Query("limit") limit = "20"
  ): Promise<ApiResponseInterface<any>> {
    return await this.transactionService.getFailedTransactions(
      parseInt(page, 10),
      parseInt(limit, 10),
      user.userId
    );
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-pending-transactions")
  @ApiOperation({ summary: "Get pending transactions for wallets you own" })
  @ApiQuery({ name: "page", description: "Page number", required: false })
  @ApiQuery({ name: "limit", description: "Items per page", required: false })
  @ApiResponse({
    status: 200,
    description: "Pending transactions retrieved successfully",
  })
  async getPendingTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query("page") page = "1",
    @Query("limit") limit = "20"
  ): Promise<ApiResponseInterface<any>> {
    return await this.transactionService.getPendingTransactions(
      parseInt(page, 10),
      parseInt(limit, 10),
      user.userId
    );
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-transactions-by-date-range")
  @ApiOperation({
    summary: "Get the authenticated user's transactions in a date range",
  })
  @ApiQuery({
    name: "startDate",
    description: "Start date (ISO format)",
    required: true,
  })
  @ApiQuery({
    name: "endDate",
    description: "End date (ISO format)",
    required: true,
  })
  @ApiQuery({ name: "page", description: "Page number", required: false })
  @ApiQuery({ name: "limit", description: "Items per page", required: false })
  @ApiResponse({
    status: 200,
    description: "Transactions retrieved successfully",
  })
  async getTransactionsByDateRange(
    @CurrentUser() user: AuthenticatedUser,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("page") page = "1",
    @Query("limit") limit = "20"
  ): Promise<ApiResponseInterface<any>> {
    if (!startDate || !endDate) {
      throw new BadRequestException("Please provide start date and end date");
    }

    return await this.transactionService.getTransactionsByDateRange(
      startDate,
      endDate,
      parseInt(page, 10),
      parseInt(limit, 10),
      user.userId
    );
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-transactions-by-user/:userId")
  @ApiOperation({ summary: "Get the authenticated user's transactions" })
  @ApiParam({ name: "userId", description: "Must match the authenticated user" })
  @ApiQuery({ name: "page", description: "Page number", required: false })
  @ApiQuery({ name: "limit", description: "Items per page", required: false })
  @ApiResponse({
    status: 200,
    description: "Transactions retrieved successfully",
  })
  @ApiResponse({ status: 403, description: "Cannot look up another user's transactions" })
  async getTransactionsByUserId(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId") userId: string,
    @Query("page") page = "1",
    @Query("limit") limit = "20"
  ): Promise<ApiResponseInterface<any>> {
    this.walletAccess.assertSameUser(userId, user.userId);

    return await this.transactionService.getTransactionsByUserId(
      userId,
      parseInt(page, 10),
      parseInt(limit, 10)
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post("create-test-transactions")
  @ApiOperation({
    summary: "Create test transactions (disabled when NODE_ENV=production)",
  })
  @ApiResponse({
    status: 200,
    description: "Test transactions created successfully",
  })
  @ApiResponse({ status: 403, description: "Disabled in production" })
  async createTestTransactions(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ApiResponseInterface<any>> {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException("Test endpoints are disabled in production");
    }

    const testTransactions =
      await this.transactionService.createTestTransactions(user.userId, 5);

    return {
      status: true,
      message: "Test transactions created successfully",
      data: { transactions: testTransactions },
    };
  }
}
