import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DataSource, EntitySubscriberInterface, UpdateEvent } from "typeorm";

import { AppModule } from "../src/app.module";
import { WalletService } from "../src/wallet/wallet.service";
import { TransactionService } from "../src/transaction/transaction.service";
import { Wallet } from "../src/wallet/entities/wallet.entity";
import { Transaction } from "../src/transaction/entities/transaction.entity";
import { mysqlAndRedisAvailable, uniqueId } from "./infra";

describe("Concurrency (e2e)", () => {
  let app: INestApplication;
  let walletService: WalletService;
  let transactionService: TransactionService;
  let dataSource: DataSource;

  beforeAll(async () => {
    const infrastructureReady = await mysqlAndRedisAvailable();
    if (!infrastructureReady) {
      throw new Error(
        "E2E requires MySQL and Redis. Run: docker compose up -d mysql redis"
      );
    }

    process.env.NODE_ENV = "test";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    walletService = app.get(WalletService);
    transactionService = app.get(TransactionService);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("should handle concurrent transfers", async () => {
    const source = await walletService.createWallet(uniqueId("src"), {
      initialBalance: 100,
      currency: "USD",
    });
    const target = await walletService.createWallet(uniqueId("dst"), {
      initialBalance: 0,
      currency: "USD",
    });

    const results = await Promise.allSettled([
      transactionService.transfer({
        fromWalletId: source.data.id,
        toWalletId: target.data.id,
        amount: 80,
        description: "concurrent-a",
      }),
      transactionService.transfer({
        fromWalletId: source.data.id,
        toWalletId: target.data.id,
        amount: 80,
        description: "concurrent-b",
      }),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const sourceBalance = await walletService.getBalance(source.data.id);
    const targetBalance = await walletService.getBalance(target.data.id);

    expect(sourceBalance.data.balance).toBe(20);
    expect(targetBalance.data.balance).toBe(80);
  });

  it("should not deadlock on opposite-direction concurrent transfers", async () => {
    const walletA = await walletService.createWallet(uniqueId("a"), {
      initialBalance: 100,
      currency: "USD",
    });
    const walletB = await walletService.createWallet(uniqueId("b"), {
      initialBalance: 100,
      currency: "USD",
    });

    const results = await Promise.all([
      transactionService.transfer({
        fromWalletId: walletA.data.id,
        toWalletId: walletB.data.id,
        amount: 40,
        description: "a-to-b",
      }),
      transactionService.transfer({
        fromWalletId: walletB.data.id,
        toWalletId: walletA.data.id,
        amount: 25,
        description: "b-to-a",
      }),
    ]);

    expect(results.every((r) => r.status === true)).toBe(true);

    const balanceA = await walletService.getBalance(walletA.data.id);
    const balanceB = await walletService.getBalance(walletB.data.id);

    expect(balanceA.data.balance).toBe(85);
    expect(balanceB.data.balance).toBe(115);
  });

  it("should rollback a failed transfer so balances are unchanged", async () => {
    const subscriber: EntitySubscriberInterface<Transaction> = {
      listenTo: () => Transaction,
      beforeUpdate(event: UpdateEvent<Transaction>) {
        if (event.entity?.description === "__test_rollback__") {
          throw new Error("forced rollback");
        }
      },
    };
    dataSource.subscribers.push(subscriber);

    const source = await walletService.createWallet(uniqueId("rb-src"), {
      initialBalance: 100,
      currency: "USD",
    });
    const target = await walletService.createWallet(uniqueId("rb-dst"), {
      initialBalance: 0,
      currency: "USD",
    });

    try {
      await expect(
        transactionService.transfer({
          fromWalletId: source.data.id,
          toWalletId: target.data.id,
          amount: 40,
          description: "__test_rollback__",
        })
      ).rejects.toThrow("forced rollback");

      const fromRow = await dataSource
        .getRepository(Wallet)
        .findOneBy({ id: source.data.id });
      const toRow = await dataSource
        .getRepository(Wallet)
        .findOneBy({ id: target.data.id });

      expect(fromRow?.balance).toBe(100);
      expect(toRow?.balance).toBe(0);
    } finally {
      const index = dataSource.subscribers.indexOf(subscriber);
      if (index >= 0) {
        dataSource.subscribers.splice(index, 1);
      }
    }
  });

  it("should allow only one concurrent withdrawal to succeed", async () => {
    const created = await walletService.createWallet(uniqueId("wd"), {
      initialBalance: 100,
      currency: "USD",
    });

    const results = await Promise.allSettled([
      walletService.withdraw({
        walletId: created.data.id,
        amount: 80,
        description: "concurrent-wd-a",
      }),
      walletService.withdraw({
        walletId: created.data.id,
        amount: 80,
        description: "concurrent-wd-b",
      }),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const balance = await walletService.getBalance(created.data.id);
    expect(balance.data.balance).toBe(20);
  });
});
