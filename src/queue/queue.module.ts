import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";

import { QueueService } from "./queue.service";
import { TRANSACTION_QUEUE, TRANSACTION_DLQ } from "./queue.constants";

@Module({
  imports: [
    BullModule.registerQueue(
      { name: TRANSACTION_QUEUE },
      { name: TRANSACTION_DLQ }
    ),
  ],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
