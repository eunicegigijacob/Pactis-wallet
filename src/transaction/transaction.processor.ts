import { Process, Processor } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";

import { TransactionService } from "./transaction.service";
import { TransferDto } from "./dto/transfer.dto";

@Processor("transactions")
export class TransactionProcessor {
  private readonly logger = new Logger(TransactionProcessor.name);

  constructor(private readonly transactionService: TransactionService) {}

  @Process("transfer")
  async handleTransfer(job: Job<TransferDto>) {
    this.logger.log(`Processing transfer job ${job.id}`);

    try {
      const transferDto = job.data;
      const result = await this.transactionService.transfer(transferDto);

      this.logger.log(
        `Transfer completed successfully: ${result.data.transaction.id}`
      );
      return result;
    } catch (error) {
      this.logger.error(`Transfer failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
