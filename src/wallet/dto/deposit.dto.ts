import {
  IsString,
  IsNumber,
  Min,
  IsOptional,
  IsPositive,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";

export class DepositDto {
  @ApiProperty({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" })
  @IsString()
  walletId: string;

  @ApiProperty({ example: 50.0, minimum: 0.01 })
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return Math.round(num * 100) / 100;
  })
  amount: number;

  @ApiPropertyOptional({ example: "Salary deposit" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: "USD" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description:
      "Idempotency key. Replays with the same payload return the original result.",
    example: "deposit-2026-08-28-001",
  })
  @IsOptional()
  @IsString()
  transactionId?: string;
}
