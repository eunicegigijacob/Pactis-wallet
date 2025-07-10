import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CacheModule } from "@nestjs/cache-manager";
import { BullModule } from "@nestjs/bull";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";

import { WalletModule } from "./wallet/wallet.module";
import { TransactionModule } from "./transaction/transaction.module";
import { QueueModule } from "./queue/queue.module";
import { CustomCacheModule } from "./cache/cache.module";
import { HealthModule } from "./health/health.module";

import { DatabaseConfig } from "./config/database.config";
import { RedisConfig } from "./config/redis.config";

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),

    // Database
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
    }),

    // Queue
    BullModule.forRootAsync({
      useClass: RedisConfig,
    }),

    // Event Emitter
    EventEmitterModule.forRoot(),

    // Schedule
    ScheduleModule.forRoot(),

    // Feature Modules
    WalletModule,
    TransactionModule,
    QueueModule,
    CustomCacheModule,
    HealthModule,
  ],
})
export class AppModule {}
