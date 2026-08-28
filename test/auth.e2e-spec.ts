import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import * as request from "supertest";

import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { mysqlAndRedisAvailable, uniqueId } from "./infra";

describe("Auth and ownership (e2e)", () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication["getHttpServer"]>;

  const password = "correct-horse";

  beforeAll(async () => {
    const ready = await mysqlAndRedisAvailable();
    if (!ready) {
      throw new Error(
        "E2E requires MySQL and Redis. Run: docker compose up -d mysql redis"
      );
    }

    process.env.NODE_ENV = "test";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );
    app.setGlobalPrefix("api/v1");
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function registerAndLogin(email: string) {
    const register = await request(server)
      .post("/api/v1/auth/register")
      .send({ email, password })
      .expect(201);

    expect(register.body.data.passwordHash).toBeUndefined();
    expect(register.body.data.email).toBe(email);

    const login = await request(server)
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);

    expect(login.body.data.accessToken).toBeTruthy();
    return {
      token: login.body.data.accessToken as string,
      userId: register.body.data.id as string,
    };
  }

  it("registers, logs in, and rejects an invalid password", async () => {
    const email = `${uniqueId("auth")}@example.com`;
    await registerAndLogin(email);

    await request(server)
      .post("/api/v1/auth/login")
      .send({ email, password: "wrong-password" })
      .expect(401);
  });

  it("rejects unauthenticated wallet access", async () => {
    await request(server)
      .get("/api/v1/wallets/get-wallet/00000000-0000-0000-0000-000000000001")
      .expect(401);
  });

  it("allows a user to use their own wallet and forbids another user's wallet", async () => {
    const userA = await registerAndLogin(`${uniqueId("a")}@example.com`);
    const userB = await registerAndLogin(`${uniqueId("b")}@example.com`);

    const walletA = await request(server)
      .post("/api/v1/wallets/create-wallet")
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ initialBalance: 100, currency: "USD" })
      .expect(201);

    const walletB = await request(server)
      .post("/api/v1/wallets/create-wallet")
      .set("Authorization", `Bearer ${userB.token}`)
      .send({ initialBalance: 20, currency: "USD" })
      .expect(201);

    const aId = walletA.body.data.id;
    const bId = walletB.body.data.id;

    await request(server)
      .get(`/api/v1/wallets/get-wallet/${aId}`)
      .set("Authorization", `Bearer ${userA.token}`)
      .expect(200);

    await request(server)
      .get(`/api/v1/wallets/get-wallet/${bId}`)
      .set("Authorization", `Bearer ${userA.token}`)
      .expect(403);

    await request(server)
      .post("/api/v1/wallets/deposit")
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ walletId: bId, amount: 10 })
      .expect(403);

    await request(server)
      .post("/api/v1/transactions/transfer")
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ fromWalletId: bId, toWalletId: aId, amount: 5 })
      .expect(403);

    await request(server)
      .get("/api/v1/transactions/get-transaction-history")
      .query({ walletId: bId })
      .set("Authorization", `Bearer ${userA.token}`)
      .expect(403);
  });
});
