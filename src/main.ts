import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  app.setGlobalPrefix("api/v1");

  const config = new DocumentBuilder()
    .setTitle("Pactis Wallet API")
    .setDescription(
      "Production-oriented wallet API: JWT auth, optimistic/pessimistic locking, idempotent transfers, Bull retries and DLQ."
    )
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Paste the access token from POST /api/v1/auth/login",
      },
      "access-token"
    )
    .addTag("Auth", "Registration and login")
    .addTag("Wallets", "Wallet operations (JWT required)")
    .addTag("Transactions", "Transfers and ledger queries (JWT required)")
    .addTag("Health", "Liveness and diagnostics")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/v1", app, document);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, "0.0.0.0");

  console.log(`Pactis Wallet API listening on http://localhost:${port}`);
  console.log(`Swagger UI: http://localhost:${port}/api/v1`);
}

bootstrap();
