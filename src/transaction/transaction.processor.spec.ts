import { Test, TestingModule } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bull";
import { Job } from "bull";

import { TransactionProcessor } from "./transaction.processor";
import { TransactionService } from "./transaction.service";
import { TransferDto } from "./dto/transfer.dto";
import { TRANSACTION_DLQ, FAILED_TRANSFER_JOB } from "../queue/queue.constants";

describe("TransactionProcessor", () => {
  let processor: TransactionProcessor;
  let transactionService: {
    transfer: jest.Mock;
    markTransactionFailed: jest.Mock;
  };
  let deadLetterQueue: { add: jest.Mock };

  const dto: TransferDto = {
    fromWalletId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    toWalletId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    amount: 25,
    transactionId: "job-tx-1",
  };

  beforeEach(async () => {
    transactionService = {
      transfer: jest.fn(),
      markTransactionFailed: jest.fn(),
    };
    deadLetterQueue = { add: jest.fn().mockResolvedValue({ id: "dlq-1" }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionProcessor,
        { provide: TransactionService, useValue: transactionService },
        { provide: getQueueToken(TRANSACTION_DLQ), useValue: deadLetterQueue },
      ],
    }).compile();

    processor = module.get(TransactionProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should retry failed background job", async () => {
    transactionService.transfer
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce({
        data: { transaction: { id: "tx-ok" } },
      });

    const job = { id: "job-1", data: dto } as Job<TransferDto>;

    await expect(processor.handleTransfer(job)).rejects.toThrow(
      "temporary outage"
    );
    await expect(processor.handleTransfer(job)).rejects.toThrow(
      "temporary outage"
    );

    const result = await processor.handleTransfer(job);
    expect(result.data.transaction.id).toBe("tx-ok");
    expect(transactionService.transfer).toHaveBeenCalledTimes(3);
  });

  it("should move permanently failed job to DLQ", async () => {
    const job = {
      id: "job-permanent",
      data: dto,
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as Job<TransferDto>;

    await processor.handleFailed(job, new Error("permanent failure"));

    expect(deadLetterQueue.add).toHaveBeenCalledWith(
      FAILED_TRANSFER_JOB,
      expect.objectContaining({
        originalJob: dto,
        error: "permanent failure",
        jobId: "job-permanent",
      }),
      expect.objectContaining({ jobId: "dlq-job-permanent" })
    );
    expect(transactionService.markTransactionFailed).toHaveBeenCalledWith(
      "job-tx-1",
      "permanent failure"
    );
  });

  it("should not move a job to the DLQ before retries are exhausted", async () => {
    const job = {
      id: "job-retrying",
      data: dto,
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as Job<TransferDto>;

    await processor.handleFailed(job, new Error("blip"));

    expect(deadLetterQueue.add).not.toHaveBeenCalled();
    expect(transactionService.markTransactionFailed).not.toHaveBeenCalled();
  });
});
