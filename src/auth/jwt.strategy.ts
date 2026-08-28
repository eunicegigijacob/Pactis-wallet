import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { resolveJwtSecret } from "./auth.constants";
import { AuthService } from "./auth.service";
import {
  AuthenticatedUser,
  JwtPayload,
} from "./interfaces/authenticated-user.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(
        configService.get<string>("JWT_SECRET"),
        configService.get("NODE_ENV", "development")
      ),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.authService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("Invalid token");
    }

    return { userId: user.id, email: user.email };
  }
}
