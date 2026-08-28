export const JWT_DEV_FALLBACK_SECRET = "dev-insecure-jwt-secret";

export function resolveJwtSecret(
  secret: string | undefined,
  nodeEnv: string
): string {
  if (nodeEnv === "production") {
    if (!secret || secret === "your-secret-key" || secret.length < 16) {
      throw new Error(
        "JWT_SECRET must be set to a strong value (16+ characters) in production"
      );
    }
    return secret;
  }

  return secret || JWT_DEV_FALLBACK_SECRET;
}
