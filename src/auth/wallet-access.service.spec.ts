import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { WalletAccessService } from "./wallet-access.service";
import { Wallet } from "../wallet/entities/wallet.entity";
import { Transaction } from "../transaction/entities/transaction.entity";

describe("WalletAccessService", () => {
  let service: WalletAccessService;
  let walletRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    walletRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletAccessService,
        { provide: getRepositoryToken(Wallet), useValue: walletRepository },
      ],
    }).compile();

    service = module.get(WalletAccessService);
  });

  it("allows the owner to access their wallet", async () => {
    walletRepository.findOne.mockResolvedValue({
      id: "wallet-a",
      userId: "user-a",
    });

    const wallet = await service.assertOwned("wallet-a", "user-a");
    expect(wallet.id).toBe("wallet-a");
  });

  it("forbids access to another user's wallet", async () => {
    walletRepository.findOne.mockResolvedValue({
      id: "wallet-b",
      userId: "user-b",
    });

    await expect(service.assertOwned("wallet-b", "user-a")).rejects.toThrow(
      ForbiddenException
    );
  });

  it("throws NotFoundException when the wallet does not exist", async () => {
    walletRepository.findOne.mockResolvedValue(null);

    await expect(service.assertOwned("missing", "user-a")).rejects.toThrow(
      NotFoundException
    );
  });

  it("forbids transaction lookup when the user owns neither wallet", async () => {
    const tx = {
      walletId: "wallet-a",
      targetWalletId: "wallet-b",
    } as Transaction;

    walletRepository.findOne
      .mockResolvedValueOnce({ id: "wallet-a", userId: "user-a" })
      .mockResolvedValueOnce({ id: "wallet-b", userId: "user-b" });

    await expect(
      service.assertTransactionVisible(tx, "user-c")
    ).rejects.toThrow(ForbiddenException);
  });
});
