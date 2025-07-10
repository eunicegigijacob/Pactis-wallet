import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors();

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Global prefix
  app.setGlobalPrefix("api/v1");

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle("Wallet System API")
    .setDescription("A comprehensive wallet management system API")
    .setVersion("1.0")
    .addTag("wallets", "Wallet management operations")
    .addTag("transactions", "Transaction management operations")
    .addTag("health", "Health check endpoints")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/v1", app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Wallet System API is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/v1`);
}

bootstrap();
