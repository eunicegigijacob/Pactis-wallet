import { IsString, IsNumber, Min, IsOptional } from 'class-validator';

export class WithdrawDto {
  @IsString()
  walletId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  currency?: string;
} 