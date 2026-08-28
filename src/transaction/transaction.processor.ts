import { Process, Processor, OnQueueFailed, InjectQueue } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job, Queue } from "bull";

import { TransactionService } from "./transaction.service";
import { TransferDto } from "./dto/transfer.dto";
import {
  TRANSACTION_QUEUE,
  TRANSACTION_DLQ,
  TRANSFER_JOB,
  FAILED_TRANSFER_JOB,
} from "../queue/queue.constants";

@Processor(TRANSACTION_QUEUE)
export class TransactionProcessor {
  private readonly logger = new Logger(TransactionProcessor.name);

  constructor(
    private readonly transactionService: TransactionService,
    @InjectQueue(TRANSACTION_DLQ) private readonly deadLetterQueue: Queue
  ) {}

  @Process(TRANSFER_JOB)
  async handleTransfer(job: Job<TransferDto>) {
    this.logger.log(`Processing transfer job ${job.id}`);

    try {
      const result = await this.transactionService.transfer(job.data);

      this.logger.log(
        `Transfer completed successfully: ${result.data.transaction.id}`
      );
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown transfer error";
      this.logger.error(`Transfer failed: ${message}`);
      throw error;
    }
  }

  @OnQueueFailed()
  async handleFailed(job: Job<TransferDto>, error: Error) {
    const maxAttempts = job.opts.attempts ?? 1;

    if (job.attemptsMade < maxAttempts) {
      this.logger.warn(
        `Transfer job ${job.id} failed attempt ${job.attemptsMade}/${maxAttempts}: ${error.message}`
      );
      return;
    }

    this.logger.error(
      `Transfer job ${job.id} exhausted retries; moving to DLQ`
    );

    await this.deadLetterQueue.add(
      FAILED_TRANSFER_JOB,
      {
        originalJob: job.data,
        error: error.message,
        jobId: job.id,
        failedAt: new Date().toISOString(),
      },
      {
        jobId: `dlq-${job.id}`,
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    if (job.data.transactionId) {
      await this.transactionService.markTransactionFailed(
        job.data.transactionId,
        error.message
      );
    }
  }
}
