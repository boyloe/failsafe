import winston from "winston";

const { combine, timestamp, json, colorize, simple } = winston.format;

const isDev = process.env.NODE_ENV === "development";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  format: combine(
    timestamp(),
    isDev
      ? combine(colorize(), simple())
      : json()
  ),
  defaultMeta: { service: "failsafe-dashboard" },
  transports: [
    new winston.transports.Console(),
  ],
});

// Convenience child loggers per subsystem
export const dbLogger = logger.child({ subsystem: "db" });
export const authLogger = logger.child({ subsystem: "auth" });
export const stripeLogger = logger.child({ subsystem: "stripe" });
export const runnerLogger = logger.child({ subsystem: "runner" });
