import { join } from "node:path";
import type { FetchQueueOptions } from "./metadata/queue.js";
import type { SamplerOptions } from "./dht/sampler.js";

export interface Config {
  port: number;
  dataDir: string;
  dbFile: string;
  stateFile: string;
  logDir: string;
  logLevel: string;
  /** Human-readable logs on the terminal (default: when it's a TTY). */
  logPretty: boolean;
  keepAliveMs: number;
  dhtConcurrency: number;
  statsIntervalMs: number;
  /** Torrents whose name contains any of these words aren't saved. */
  catalogueBlocklist: string[];
  fetch: Required<
    Pick<
      FetchQueueOptions,
      | "concurrency"
      | "maxQueued"
      | "peersPerHash"
      | "fetchTimeoutMs"
      | "lookupTimeoutMs"
    >
  >;
  sampler: Required<Pick<SamplerOptions, "queriesPerSecond">>;
}

/**
 * Read settings from GN_* environment variables (optionally loaded from
 * .env by `node --env-file-if-exists`), falling back to defaults.
 * Throws on invalid values so a typo fails at startup, not mid-crawl.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = env.GN_DATA_DIR || "data";
  return {
    port: int(env, "GN_PORT", 6881, 1, 65535),
    dataDir,
    dbFile: join(dataDir, "catalogue.db"),
    stateFile: join(dataDir, "dht-state.json"),
    logDir: env.GN_LOG_DIR || "logs",
    logLevel: oneOf(env, "GN_LOG_LEVEL", "info", [
      "fatal",
      "error",
      "warn",
      "info",
      "debug",
      "trace",
    ]),
    logPretty: bool(env, "GN_LOG_PRETTY", process.stdout.isTTY ?? false),
    keepAliveMs: int(env, "GN_KEEPALIVE_MS", 30_000, 0),
    dhtConcurrency: int(env, "GN_DHT_CONCURRENCY", 128, 1),
    statsIntervalMs: int(env, "GN_STATS_INTERVAL_MS", 60_000, 1000),
    catalogueBlocklist: list(env, "GN_CATALOGUE_BLOCKLIST"),
    fetch: {
      concurrency: int(env, "GN_FETCH_CONCURRENCY", 30, 1),
      maxQueued: int(env, "GN_FETCH_MAX_QUEUED", 2000, 1),
      peersPerHash: int(env, "GN_PEERS_PER_HASH", 4, 1),
      fetchTimeoutMs: int(env, "GN_FETCH_TIMEOUT_MS", 10_000, 100),
      lookupTimeoutMs: int(env, "GN_LOOKUP_TIMEOUT_MS", 10_000, 100),
    },
    sampler: {
      queriesPerSecond: int(env, "GN_SAMPLER_QPS", 10, 1),
    },
  };
}

function int(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `${key} must be an integer in [${min}, ${max}], got "${raw}"`,
    );
  }
  return value;
}

/** Comma-separated values; blanks are dropped. */
function list(env: NodeJS.ProcessEnv, key: string): string[] {
  return (env[key] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function bool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key]?.toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${key} must be true or false, got "${env[key]}"`);
}

function oneOf<T extends string>(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: T,
  allowed: readonly T[],
): T {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  if (!allowed.includes(raw as T)) {
    throw new Error(
      `${key} must be one of ${allowed.join(", ")}, got "${raw}"`,
    );
  }
  return raw as T;
}
