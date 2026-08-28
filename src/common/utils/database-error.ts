/**
 * Detects unique-constraint violations from MySQL (and common test doubles).
 * The unique index on transactionId / userId is the real race-safety mechanism.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as {
    code?: string | number;
    errno?: number;
    message?: string;
    driverError?: { code?: string; errno?: number; message?: string };
  };

  if (err.driverError?.errno === 1062 || err.errno === 1062) {
    return true;
  }

  if (
    err.driverError?.code === "ER_DUP_ENTRY" ||
    err.code === "ER_DUP_ENTRY"
  ) {
    return true;
  }

  const message = `${err.message ?? ""} ${err.driverError?.message ?? ""}`;
  return (
    message.includes("Duplicate entry") ||
    message.includes("UNIQUE constraint") ||
    message.includes("unique constraint")
  );
}
