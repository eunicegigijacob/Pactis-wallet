import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === "string"
          ? payload
          : (payload as { message?: string | string[] }).message ||
            exception.message;

      response.status(status).json({
        status: false,
        statusCode: status,
        message,
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception)
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      status: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
    });
  }
}
