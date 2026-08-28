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
import { isClientHttpError, errorMessage } from "../common/utils/http-error";

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
      const message = errorMessage(error);
      this.logger.error(`Transfer failed: ${message}`);

      if (isClientHttpError(error)) {
        await job.discard();
      }

      throw error;
    }
  }

  @OnQueueFailed()
  async handleFailed(job: Job<TransferDto>, error: Error) {
    const maxAttempts = job.opts.attempts ?? 1;
    const discarded = Boolean(
      (job as Job<TransferDto> & { discarded?: boolean }).discarded
    );

    if (!discarded && job.attemptsMade < maxAttempts) {
      this.logger.warn(
        `Transfer job ${job.id} failed attempt ${job.attemptsMade}/${maxAttempts}: ${error.message}`
      );
      return;
    }

    this.logger.error(
      `Transfer job ${job.id} exhausted retries; moving to DLQ`
    );

    try {
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
    } catch (dlqError) {
      const dlqMessage = errorMessage(dlqError);
      if (!dlqMessage.toLowerCase().includes("already exists")) {
        throw dlqError;
      }
    }

    if (job.data.transactionId) {
      await this.transactionService.markTransactionFailed(
        job.data.transactionId,
        error.message
      );
    }
  }
}
