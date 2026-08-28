import { IsOptional, IsNumber, Min, IsEnum, IsString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { WalletStatus } from "../entities/wallet.entity";

export class CreateWalletDto {
  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return Math.round(num * 100) / 100;
  })
  initialBalance?: number;

  @ApiPropertyOptional({ enum: WalletStatus })
  @IsOptional()
  @IsEnum(WalletStatus)
  status?: WalletStatus;

  @ApiPropertyOptional({ example: "USD" })
  @IsOptional()
  @IsString()
  currency?: string;
}
