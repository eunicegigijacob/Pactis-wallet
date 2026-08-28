import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { AppModule } from "../src/app.module";
import { WalletService } from "../src/wallet/wallet.service";
import { TransactionService } from "../src/transaction/transaction.service";
import { mysqlAndRedisAvailable, uniqueId } from "./infra";

describe("Concurrency (e2e)", () => {
  let app: INestApplication;
  let walletService: WalletService;
  let transactionService: TransactionService;
  let infrastructureReady = false;

  beforeAll(async () => {
    infrastructureReady = await mysqlAndRedisAvailable();
    if (!infrastructureReady) {
      return;
    }

    process.env.NODE_ENV = "test";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    walletService = app.get(WalletService);
    transactionService = app.get(TransactionService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const requireInfra = () => {
    if (!infrastructureReady) {
      console.warn(
        "Skipping e2e: MySQL/Redis not reachable. Run `docker compose up -d mysql redis`."
      );
    }
    return infrastructureReady;
  };

  it("should handle concurrent transfers", async () => {
    if (!requireInfra()) {
      return;
    }

    const source = await walletService.createWallet({
      userId: uniqueId("src"),
      initialBalance: 100,
      currency: "USD",
    });
    const target = await walletService.createWallet({
      userId: uniqueId("dst"),
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
    if (!requireInfra()) {
      return;
    }

    const walletA = await walletService.createWallet({
      userId: uniqueId("a"),
      initialBalance: 100,
      currency: "USD",
    });
    const walletB = await walletService.createWallet({
      userId: uniqueId("b"),
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
});
