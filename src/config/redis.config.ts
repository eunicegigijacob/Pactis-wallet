import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  BullModuleOptions,
  BullOptionsFactory,
  SharedBullConfigurationFactory,
} from "@nestjs/bull";

@Injectable()
export class RedisConfig
  implements BullOptionsFactory, SharedBullConfigurationFactory
{
  constructor(private configService: ConfigService) {}

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
