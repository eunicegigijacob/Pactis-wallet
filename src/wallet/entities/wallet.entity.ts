import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  OneToMany,
  Index,
} from "typeorm";
import { Transaction } from "../../transaction/entities/transaction.entity";

export enum WalletStatus {
  ACTIVE = "active",
  SUSPENDED = "suspended",
  CLOSED = "closed",
}

@Entity("wallets")
@Index(["userId"], { unique: true })
export class Wallet {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 255 })
  userId: string;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  balance: number;

  @Column({
    type: "enum",
    enum: WalletStatus,
    default: WalletStatus.ACTIVE,
  })
  status: WalletStatus;

  @Column({ type: "varchar", length: 255, nullable: true })
  currency: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @VersionColumn()
  version: number;

  // Relations
  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions: Transaction[];

  // Methods
  canWithdraw(amount: number): boolean {
    return this.status === WalletStatus.ACTIVE && this.balance >= amount;
  }

  canDeposit(amount: number): boolean {
    return this.status === WalletStatus.ACTIVE && amount > 0;
  }

  addBalance(amount: number): void {
    this.balance += amount;
  }

  subtractBalance(amount: number): void {
    this.balance -= amount;
  }
}
