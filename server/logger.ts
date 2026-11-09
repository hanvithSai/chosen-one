import { pino, type Logger } from "pino";
import type { AppConfig } from "./config.js";

export function createLogger(config: Pick<AppConfig, "NODE_ENV" | "LOG_LEVEL">): Logger {
  const pretty = config.NODE_ENV === "development";
  return pino({
    level: config.NODE_ENV === "test" ? "silent" : config.LOG_LEVEL,
    redact: {
      paths: ["req.headers.authorization", "*.client_secret", "*.access_token", "*.password"],
      censor: "[redacted]",
    },
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
  });
}
