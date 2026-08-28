import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const env = this.configService.get("NODE_ENV", "development");
    const isDev = env === "development";
    const isTest = env === "test";

    return {
      type: "mysql",
      host: this.configService.get("DB_HOST", "localhost"),
      port: this.configService.get("DB_PORT", 3306),
      username: this.configService.get("DB_USERNAME", "root"),
      password: this.configService.get("DB_PASSWORD", "password"),
      database: this.configService.get("DB_DATABASE", "wallet_system"),
      entities: [__dirname + "/../**/*.entity{.ts,.js}"],
      synchronize: isDev || isTest,
      logging: isDev,
      extra: {
        connectionLimit: 10,
        charset: "utf8mb4_unicode_ci",
      },
    };
  }
} 