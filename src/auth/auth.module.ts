import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { User } from "./entities/user.entity";
import { Wallet } from "../wallet/entities/wallet.entity";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { WalletAccessService } from "./wallet-access.service";
import { resolveJwtSecret } from "./auth.constants";

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Wallet]),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(
          config.get<string>("JWT_SECRET"),
          config.get("NODE_ENV", "development")
        ),
        signOptions: {
          expiresIn: config.get("JWT_EXPIRES_IN", "24h") as `${number}h`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, WalletAccessService],
  exports: [AuthService, WalletAccessService, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
