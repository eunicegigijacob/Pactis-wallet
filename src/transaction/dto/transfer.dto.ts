import {
  IsString,
  IsNumber,
  Min,
  IsOptional,
  IsUUID,
  IsPositive,
} from "class-validator";
import { Transform } from "class-transformer";

export class TransferDto {
  @IsUUID()
  fromWalletId: string;

  @IsUUID()
  toWalletId: string;

  @IsNumber()
  @IsPositive()
  @Min(0.01)
  @Transform(({ value }) => {
    // Ensure proper decimal handling
    const num = parseFloat(value);
    return Math.round(num * 100) / 100; // Round to 2 decimal places
  })
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  transactionId?: string; // For idempotency
}
