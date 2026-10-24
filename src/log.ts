import { join } from "node:path";
import pino, { type Logger } from "pino";
import type { Config } from "./config.js";

export type { Logger };

/**
 * JSON lines to logs/crawl-<start date>.jsonl, plus readable output on the
 * terminal when `logPretty` is set. A run that crosses midnight keeps
 * writing to the file it started with.
 */
export function createLogger(
  config: Pick<Config, "logDir" | "logLevel" | "logPretty">,
): Logger {
  const day = new Date().toISOString().slice(0, 10);
  const file = join(config.logDir, `crawl-${day}.jsonl`);

  const targets: pino.TransportTargetOptions[] = [
    {
      target: "pino/file",
      level: config.logLevel,
      options: { destination: file, mkdir: true },
    },
    config.logPretty
      ? {
          target: "pino-pretty",
          level: config.logLevel,
          options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        }
      : {
          target: "pino/file",
          level: config.logLevel,
          options: { destination: 1 },
        },
  ];

  return pino({ level: config.logLevel }, pino.transport({ targets }));
}

/** Wait for buffered log lines to reach their destinations. */
export function flushLogger(log: Logger): Promise<void> {
  return new Promise((resolve) => log.flush(() => resolve()));
}
