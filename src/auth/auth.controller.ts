import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService, LoginResult, PublicUser } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { Public } from "./decorators/public.decorator";
import { ApiResponse as ApiResponseInterface } from "../common/interfaces/api-response.interface";

@ApiTags("Auth")
@Public()
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Register a new user" })
  @ApiResponse({ status: 201, description: "User registered" })
  @ApiResponse({ status: 409, description: "Email already registered" })
  @ApiResponse({ status: 400, description: "Validation failed" })
  async register(
    @Body() dto: RegisterDto
  ): Promise<ApiResponseInterface<PublicUser>> {
    const user = await this.authService.register(dto);
    return {
      status: true,
      message: "User registered successfully",
      data: user,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Login and receive a JWT access token" })
  @ApiResponse({ status: 200, description: "Login successful" })
  @ApiResponse({ status: 401, description: "Invalid email or password" })
  @ApiResponse({ status: 429, description: "Too many login attempts" })
  async login(
    @Body() dto: LoginDto
  ): Promise<ApiResponseInterface<LoginResult>> {
    const result = await this.authService.login(dto);
    return {
      status: true,
      message: "Login successful",
      data: result,
    };
  }
}
