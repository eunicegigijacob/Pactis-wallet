import * as net from "net";

export function canConnect(
  host: string,
  port: number,
  timeoutMs = 1500
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    socket.on("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export async function mysqlAndRedisAvailable(): Promise<boolean> {
  const dbHost = process.env.DB_HOST || "localhost";
  const dbPort = Number(process.env.DB_PORT || 3306);
  const redisHost = process.env.REDIS_HOST || "localhost";
  const redisPort = Number(process.env.REDIS_PORT || 6379);

  const [mysql, redis] = await Promise.all([
    canConnect(dbHost, dbPort),
    canConnect(redisHost, redisPort),
  ]);

  return mysql && redis;
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
