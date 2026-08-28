import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";

import { TransactionController } from "./transaction.controller";
import { TransactionService } from "./transaction.service";
import { Transaction } from "./entities/transaction.entity";
import { Wallet } from "../wallet/entities/wallet.entity";
import { TransactionProcessor } from "./transaction.processor";
import { TransactionRepository } from "./repositories/transaction.repository";
import {
  TRANSACTION_QUEUE,
  TRANSACTION_DLQ,
} from "../queue/queue.constants";

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Wallet]),
    BullModule.registerQueue(
      { name: TRANSACTION_QUEUE },
      { name: TRANSACTION_DLQ }
    ),
  ],
  controllers: [TransactionController],
  providers: [TransactionService, TransactionProcessor, TransactionRepository],
  exports: [TransactionService],
})
export class TransactionModule {}
