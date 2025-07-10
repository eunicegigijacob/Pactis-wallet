import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CacheModuleOptions, CacheOptionsFactory } from "@nestjs/cache-manager";
import {
  BullModuleOptions,
  BullOptionsFactory,
  SharedBullConfigurationFactory,
} from "@nestjs/bull";
import * as redisStore from "cache-manager-redis-store";

@Injectable()
export class RedisConfig
  implements
    CacheOptionsFactory,
    BullOptionsFactory,
    SharedBullConfigurationFactory
{
  constructor(private configService: ConfigService) {}

  createCacheOptions(): CacheModuleOptions {
    return {
      store: redisStore as any,
      host: this.configService.get("REDIS_HOST", "localhost"),
      port: this.configService.get("REDIS_PORT", 6379),
      password: this.configService.get("REDIS_PASSWORD"),
      db: this.configService.get("REDIS_DB", 0),
      ttl: 60 * 60 * 24, // 24 hours default TTL
      max: 100, // maximum number of items in cache
    };
  }

  createBullOptions(): BullModuleOptions {
    return {
      redis: {
        host: this.configService.get("REDIS_HOST", "localhost"),
        port: this.configService.get("REDIS_PORT", 6379),
        password: this.configService.get("REDIS_PASSWORD"),
        db: this.configService.get("REDIS_DB", 0),
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    };
  }

  createSharedConfiguration(): BullModuleOptions {
    return this.createBullOptions();
  }
}
