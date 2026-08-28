import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { User } from "./entities/user.entity";

describe("AuthService", () => {
  let service: AuthService;
  let userRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let queryBuilder: {
    addSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };

  beforeEach(async () => {
    queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    userRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue("signed.jwt.token"),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue("24h") },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it("should register a user with a hashed password", async () => {
    userRepository.findOne.mockResolvedValue(null);
    userRepository.create.mockImplementation((data) => data);
    userRepository.save.mockImplementation(async (user) => ({
      id: "user-1",
      email: user.email,
      passwordHash: user.passwordHash,
      createdAt: new Date("2026-01-01"),
    }));

    const result = await service.register({
      email: "Ada@Example.com",
      password: "correct-horse",
    });

    expect(result.email).toBe("ada@example.com");
    expect(result).not.toHaveProperty("passwordHash");
    const saved = userRepository.save.mock.calls[0][0];
    expect(saved.passwordHash).not.toBe("correct-horse");
    expect(await bcrypt.compare("correct-horse", saved.passwordHash)).toBe(
      true
    );
  });

  it("should reject a duplicate email", async () => {
    userRepository.findOne.mockResolvedValue({ id: "existing" });

    await expect(
      service.register({ email: "ada@example.com", password: "correct-horse" })
    ).rejects.toThrow(ConflictException);
  });

  it("should login and return a JWT", async () => {
    const passwordHash = await bcrypt.hash("correct-horse", 4);
    queryBuilder.getOne.mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      passwordHash,
      createdAt: new Date("2026-01-01"),
    });

    const result = await service.login({
      email: "ada@example.com",
      password: "correct-horse",
    });

    expect(result.accessToken).toBe("signed.jwt.token");
    expect(result.tokenType).toBe("Bearer");
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: "user-1",
      email: "ada@example.com",
    });
  });

  it("should reject an invalid password", async () => {
    const passwordHash = await bcrypt.hash("correct-horse", 4);
    queryBuilder.getOne.mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      passwordHash,
    });

    await expect(
      service.login({ email: "ada@example.com", password: "wrong-password" })
    ).rejects.toThrow(UnauthorizedException);
  });
});
