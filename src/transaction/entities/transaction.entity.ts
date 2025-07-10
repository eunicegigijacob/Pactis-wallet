import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Wallet } from "../../wallet/entities/wallet.entity";

export enum TransactionType {
  DEPOSIT = "deposit",
  WITHDRAWAL = "withdrawal",
  TRANSFER = "transfer",
}

export enum TransactionStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

@Entity("transactions")
@Index(["transactionId"], { unique: true })
@Index(["walletId", "createdAt"])
@Index(["type", "status"])
export class Transaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 255 })
  transactionId: string;

  @Column({ type: "uuid" })
  walletId: string;

  @Column({ type: "uuid", nullable: true })
  targetWalletId: string;

  @Column({
    type: "enum",
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: "enum",
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  amount: number;

  @Column({ type: "decimal", precision: 15, scale: 2, nullable: true })
  fee: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  currency: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "json", nullable: true })
  metadata: Record<string, any>;

  @Column({ type: "text", nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  @JoinColumn({ name: "walletId" })
  wallet: Wallet;

  @ManyToOne(() => Wallet, { nullable: true })
  @JoinColumn({ name: "targetWalletId" })
  targetWallet: Wallet;

  // Methods
  isCompleted(): boolean {
    return this.status === TransactionStatus.COMPLETED;
  }

  isFailed(): boolean {
    return this.status === TransactionStatus.FAILED;
  }

  isPending(): boolean {
    return this.status === TransactionStatus.PENDING;
  }

  markAsCompleted(): void {
    this.status = TransactionStatus.COMPLETED;
  }

  markAsFailed(errorMessage?: string): void {
    this.status = TransactionStatus.FAILED;
    if (errorMessage) {
      this.errorMessage = errorMessage;
    }
  }

  markAsCancelled(): void {
    this.status = TransactionStatus.CANCELLED;
  }
}
