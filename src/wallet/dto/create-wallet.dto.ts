import { IsString, IsOptional, IsNumber, Min, IsEnum } from "class-validator";
import { Transform } from "class-transformer";
import { WalletStatus } from "../entities/wallet.entity";

export class CreateWalletDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => {
    // Ensure proper decimal handling
    const num = parseFloat(value);
    return Math.round(num * 100) / 100; // Round to 2 decimal places
  })
  initialBalance?: number;

  @IsOptional()
  @IsEnum(WalletStatus)
  status?: WalletStatus;

  @IsOptional()
  @IsString()
  currency?: string;
}
