import { HttpException } from "@nestjs/common";

export function isClientHttpError(error: unknown): boolean {
  return error instanceof HttpException && error.getStatus() < 500;
}

export function errorMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === "string") {
      return response;
    }
    if (typeof response === "object" && response && "message" in response) {
      const message = (response as { message: string | string[] }).message;
      return Array.isArray(message) ? message.join(", ") : String(message);
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}
