import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";
import { Transform } from "class-transformer";

export class LoginDto {
  @ApiProperty({ example: "ada@example.com" })
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value
  )
  email: string;

  @ApiProperty({ example: "correct-horse-battery" })
  @IsString()
  @MinLength(1)
  password: string;
}
