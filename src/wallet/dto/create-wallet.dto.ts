import { IsString, IsOptional, IsNumber, Min, IsEnum } from 'class-validator';
import { WalletStatus } from '../entities/wallet.entity';

export class CreateWalletDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  initialBalance?: number;

  @IsOptional()
  @IsEnum(WalletStatus)
  status?: WalletStatus;

  @IsOptional()
  @IsString()
  currency?: string;
} 