import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bull";
import { Queue } from "bull";

import { AppModule } from "../src/app.module";
import { TransactionService } from "../src/transaction/transaction.service";
import {
  TRANSACTION_QUEUE,
  TRANSACTION_DLQ,
  TRANSFER_JOB,
} from "../src/queue/queue.constants";
import { mysqlAndRedisAvailable, uniqueId } from "./infra";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Queue retry and DLQ (e2e)", () => {
  let app: INestApplication;
  let transactionsQueue: Queue;
  let deadLetterQueue: Queue;
  let transferMock: jest.Mock;

  beforeAll(async () => {
    const ready = await mysqlAndRedisAvailable();
    if (!ready) {
      throw new Error(
        "E2E requires MySQL and Redis. Run: docker compose up -d mysql redis"
      );
    }

    process.env.NODE_ENV = "test";

    transferMock = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TransactionService)
      .useValue({
        transfer: transferMock,
        markTransactionFailed: jest.fn().mockResolvedValue(undefined),
        createTransaction: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    transactionsQueue = app.get(getQueueToken(TRANSACTION_QUEUE));
    deadLetterQueue = app.get(getQueueToken(TRANSACTION_DLQ));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(() => {
    transferMock?.mockReset();
  });

  it("should retry failed background job", async () => {

    transferMock
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValue({
        data: { transaction: { id: "tx-recovered" } },
      });

    const job = await transactionsQueue.add(
      TRANSFER_JOB,
      {
        fromWalletId: uniqueId("from"),
        toWalletId: uniqueId("to"),
        amount: 10,
        transactionId: uniqueId("retry"),
      },
      {
        attempts: 3,
        backoff: { type: "fixed", delay: 50 },
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    const result = await job.finished();
    expect(result.data.transaction.id).toBe("tx-recovered");
    expect(transferMock).toHaveBeenCalledTimes(3);
  });

  it("should move permanently failed job to DLQ", async () => {
    transferMock.mockRejectedValue(new Error("permanent failure"));

    const transactionId = uniqueId("dlq");
    const job = await transactionsQueue.add(
      TRANSFER_JOB,
      {
        fromWalletId: uniqueId("from"),
        toWalletId: uniqueId("to"),
        amount: 10,
        transactionId,
      },
      {
        jobId: transactionId,
        attempts: 3,
        backoff: { type: "fixed", delay: 50 },
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    await expect(job.finished()).rejects.toThrow("permanent failure");

    let dlqJob = null;
    for (let i = 0; i < 20 && !dlqJob; i += 1) {
      dlqJob = await deadLetterQueue.getJob(`dlq-${transactionId}`);
      if (!dlqJob) {
        await wait(100);
      }
    }

    expect(dlqJob).toBeTruthy();
    expect(dlqJob.data.error).toBe("permanent failure");
    expect(dlqJob.data.originalJob.transactionId).toBe(transactionId);
  });
});
