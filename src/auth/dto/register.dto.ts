import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength, MaxLength } from "class-validator";
import { Transform } from "class-transformer";

export class RegisterDto {
  @ApiProperty({ example: "ada@example.com" })
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value
  )
  email: string;

  @ApiProperty({ example: "correct-horse-battery", minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
