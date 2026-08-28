import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";

import { WalletModule } from "./wallet/wallet.module";
import { TransactionModule } from "./transaction/transaction.module";
import { QueueModule } from "./queue/queue.module";
import { CustomCacheModule } from "./cache/cache.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";

import { DatabaseConfig } from "./config/database.config";
import { RedisConfig } from "./config/redis.config";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),

    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
    }),

    BullModule.forRootAsync({
      useClass: RedisConfig,
    }),

    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60000,
        limit: 30,
      },
    ]),

    AuthModule,
    WalletModule,
    TransactionModule,
    QueueModule,
    CustomCacheModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
