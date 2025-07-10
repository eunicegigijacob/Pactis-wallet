import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";

import { TransactionController } from "./transaction.controller";
import { TransactionService } from "./transaction.service";
import { Transaction } from "./entities/transaction.entity";
import { Wallet } from "../wallet/entities/wallet.entity";
import { TransactionProcessor } from "./transaction.processor";
import { TransactionRepository } from "./repositories/transaction.repository";

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Wallet]),
    BullModule.registerQueue({
      name: "transactions",
    }),
  ],
  controllers: [TransactionController],
  providers: [TransactionService, TransactionProcessor, TransactionRepository],
  exports: [TransactionService],
})
export class TransactionModule {}
