import type { SyncLogger } from "./types";

function write(
  level: "INFO" | "WARN" | "ERROR",
  prefix: string[],
  message: string,
  data?: Record<string, unknown>,
) {
  const timestamp = new Date().toISOString();
  const header = [timestamp, "TAX-SYNC", level, ...prefix]
    .map((part) => `[${part}]`)
    .join("");

  if (data && Object.keys(data).length > 0) {
    console.log(`${header} ${message}`, JSON.stringify(data));
    return;
  }

  console.log(`${header} ${message}`);
}

export function createLogger(...prefix: string[]): SyncLogger {
  return {
    info(message, data) {
      write("INFO", prefix, message, data);
    },
    warn(message, data) {
      write("WARN", prefix, message, data);
    },
    error(message, data) {
      write("ERROR", prefix, message, data);
    },
    child(scope: string) {
      return createLogger(...prefix, scope);
    },
  };
}
