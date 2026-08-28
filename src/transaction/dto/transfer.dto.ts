import {
  IsString,
  IsNumber,
  Min,
  IsOptional,
  IsUUID,
  IsPositive,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";

export class TransferDto {
  @ApiProperty({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" })
  @IsUUID()
  fromWalletId: string;

  @ApiProperty({ example: "7c9e6679-7425-40de-944b-e07fc1f90ae7" })
  @IsUUID()
  toWalletId: string;

  @ApiProperty({ example: 100.0, minimum: 0.01 })
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return Math.round(num * 100) / 100;
  })
  amount: number;

  @ApiPropertyOptional({ example: "Payment for services" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: "USD" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description:
      "Idempotency key. Assigned before enqueue for async transfers and used as the Bull job ID.",
    example: "transfer-2026-08-28-001",
  })
  @IsOptional()
  @IsString()
  transactionId?: string;
}
