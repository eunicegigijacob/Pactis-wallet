import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Wallet } from "../wallet/entities/wallet.entity";
import { Transaction } from "../transaction/entities/transaction.entity";

@Injectable()
export class WalletAccessService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>
  ) {}

  async assertOwned(walletId: string, userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    if (wallet.userId !== userId) {
      throw new ForbiddenException("You do not have access to this wallet");
    }

    return wallet;
  }

  assertSameUser(requestedUserId: string, actorUserId: string): void {
    if (requestedUserId !== actorUserId) {
      throw new ForbiddenException("You do not have access to this resource");
    }
  }

  async assertTransactionVisible(
    transaction: Transaction,
    userId: string
  ): Promise<void> {
    const source = await this.walletRepository.findOne({
      where: { id: transaction.walletId },
    });
    const target = transaction.targetWalletId
      ? await this.walletRepository.findOne({
          where: { id: transaction.targetWalletId },
        })
      : null;

    const ownsSource = source?.userId === userId;
    const ownsTarget = target?.userId === userId;

    if (!ownsSource && !ownsTarget) {
      throw new ForbiddenException(
        "You do not have access to this transaction"
      );
    }
  }
}
