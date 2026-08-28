import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { WalletStatus } from "../entities/wallet.entity";

export class UpdateWalletStatusDto {
  @ApiProperty({ enum: WalletStatus, example: WalletStatus.SUSPENDED })
  @IsEnum(WalletStatus)
  status: WalletStatus;
}
