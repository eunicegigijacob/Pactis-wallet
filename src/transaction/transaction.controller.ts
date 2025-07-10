import {
  Body,
  Request,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  BadGatewayException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";

import { TransactionService } from "./transaction.service";
import { TransferDto } from "./dto/transfer.dto";
import { TransactionHistoryDto } from "./dto/transaction-history.dto";
import { Transaction } from "./entities/transaction.entity";
import { ApiResponse as ApiResponseInterface } from "../common/interfaces/api-response.interface";

@ApiTags("Transactions")
@Controller("transactions")
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @HttpCode(HttpStatus.OK)
  @Post("transfer")
  @ApiOperation({ summary: "Transfer funds between wallets" })
  @ApiResponse({ status: 200, description: "Transfer successful" })
  @ApiResponse({ status: 400, description: "Invalid transfer request" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  async transfer(@Body() dto: TransferDto): Promise<
    ApiResponseInterface<{
      transaction: Transaction;
      fromWallet: { id: string };
      toWallet: { id: string; balance: number };
    }>
  > {
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
  @ApiOperation({ summary: "Transfer funds asynchronously" })
  @ApiResponse({ status: 202, description: "Transfer queued for processing" })
  async transferAsync(
    @Body() dto: TransferDto
  ): Promise<ApiResponseInterface<{ message: string }>> {
    return await this.transactionService.processTransferAsync(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-transaction-history")
  @ApiOperation({ summary: "Get transaction history for a wallet" })
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
  async getTransactionHistory(@Request() req: any): Promise<
    ApiResponseInterface<{
      transactions: Transaction[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>
  > {
    const {
      walletId,
      page = 1,
      limit = 20,
      type,
      status,
      startDate,
      endDate,
    } = req.query;

    if (!walletId) {
      throw new BadGatewayException("Please provide wallet ID");
    }

    const query: TransactionHistoryDto = {
      walletId,
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      status,
      startDate,
      endDate,
    };

    return await this.transactionService.getTransactionHistory(query);
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-transaction/:transactionId")
  @ApiOperation({ summary: "Get transaction by ID" })
  @ApiParam({ name: "transactionId", description: "Transaction ID" })
  @ApiResponse({ status: 200, description: "Transaction found" })
  @ApiResponse({ status: 404, description: "Transaction not found" })
  async getTransaction(
    @Request() req: any
  ): Promise<ApiResponseInterface<Transaction>> {
    return await this.transactionService.getTransaction(
      req.params.transactionId
    );
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-transaction-stats/:walletId")
  @ApiOperation({ summary: "Get transaction statistics for a wallet" })
  @ApiParam({ name: "walletId", description: "Wallet ID" })
  @ApiResponse({
    status: 200,
    description: "Statistics retrieved successfully",
  })
  async getTransactionStats(@Request() req: any): Promise<
    ApiResponseInterface<{
      totalDeposits: number;
      totalWithdrawals: number;
      totalTransfers: number;
      totalFees: number;
    }>
  > {
    return await this.transactionService.getTransactionStats(
      req.params.walletId
    );
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-transactions-by-filter")
  @ApiOperation({ summary: "Get transactions by filter" })
  @ApiQuery({ name: "walletId", description: "Wallet ID", required: false })
  @ApiQuery({ name: "type", description: "Transaction type", required: false })
  @ApiQuery({
    name: "status",
    description: "Transaction status",
    required: false,
  })
  @ApiQuery({ name: "startDate", description: "Start date", required: false })
  @ApiQuery({ name: "endDate", description: "End date", required: false })
  @ApiQuery({
    name: "minAmount",
    description: "Minimum amount",
    required: false,
  })
  @ApiQuery({
    name: "maxAmount",
    description: "Maximum amount",
    required: false,
  })
  @ApiQuery({ name: "page", description: "Page number", required: false })
  @ApiQuery({ name: "limit", description: "Items per page", required: false })
  @ApiResponse({
    status: 200,
    description: "Transactions retrieved successfully",
  })
  async getTransactionsByFilter(
    @Request() req: any
  ): Promise<ApiResponseInterface<any>> {
    const {
      walletId,
      type,
      status,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      page = 1,
      limit = 20,
    } = req.query;

    // This would need to be implemented in the service
    // For now, returning a placeholder response
    return {
      status: true,
      message: "Transactions retrieved successfully",
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
  @Get("get-failed-transactions")
  @ApiOperation({ summary: "Get failed transactions" })
  @ApiQuery({ name: "page", description: "Page number", required: false })
  @ApiQuery({ name: "limit", description: "Items per page", required: false })
  @ApiResponse({
    status: 200,
    description: "Failed transactions retrieved successfully",
  })
  async getFailedTransactions(
    @Request() req: any
  ): Promise<ApiResponseInterface<any>> {
    const { page = 1, limit = 20 } = req.query;
    return await this.transactionService.getFailedTransactions(
      parseInt(page),
      parseInt(limit)
    );
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-pending-transactions")
  @ApiOperation({ summary: "Get pending transactions" })
  @ApiQuery({ name: "page", description: "Page number", required: false })
  @ApiQuery({ name: "limit", description: "Items per page", required: false })
  @ApiResponse({
    status: 200,
    description: "Pending transactions retrieved successfully",
  })
  async getPendingTransactions(
    @Request() req: any
  ): Promise<ApiResponseInterface<any>> {
    const { page = 1, limit = 20 } = req.query;
    return await this.transactionService.getPendingTransactions(
      parseInt(page),
      parseInt(limit)
    );
  }

  @HttpCode(HttpStatus.OK)
  @Get("get-transactions-by-date-range")
  @ApiOperation({ summary: "Get transactions by date range" })
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
    @Request() req: any
  ): Promise<ApiResponseInterface<any>> {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;

    if (!startDate || !endDate) {
      throw new BadGatewayException("Please provide start date and end date");
    }

    return await this.transactionService.getTransactionsByDateRange(
      startDate,
      endDate,
      parseInt(page),
      parseInt(limit)
    );
  }
}
