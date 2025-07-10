import {
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
  IsUUID,
  IsString,
} from "class-validator";
import {
  TransactionType,
  TransactionStatus,
} from "../entities/transaction.entity";

export class TransactionHistoryDto {
  @IsUUID()
  walletId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  startDate?: string;

  @IsOptional()
  endDate?: string;
}

export class TransactionsByUserIdDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}

export class TransactionsByDateRangeDto {
  @IsString()
  startDate: string;

  @IsString()
  endDate: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}
