import { openCatalogue } from "./catalogue/db.js";
import { createStore } from "./catalogue/store.js";
import { type Config, loadConfig } from "./config.js";
import { startHarvester } from "./dht/harvester.js";
import { startNode, stopNode } from "./dht/node.js";
import { startSampler } from "./dht/sampler.js";
import { createLogger, flushLogger, type Logger } from "./log.js";
import { createNameFilter } from "./metadata/filter.js";
import { createFetchQueue } from "./metadata/queue.js";
import { startStats } from "./stats.js";

// Pause sampling once the fetch backlog is this full.
const SAMPLER_PAUSE_FRACTION = 0.75;
// Give up on a clean shutdown after this long.
const SHUTDOWN_TIMEOUT_MS = 10_000;

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`Invalid configuration: ${(err as Error).message}`);
  process.exit(1);
}
const log = createLogger(config);

/** Teardown steps, registered as each part starts; run in reverse. */
const cleanups: Array<() => void | Promise<void>> = [];
let shuttingDown = false;

async function shutdown(code: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ event: "shutdown_start", code });
  setTimeout(() => process.exit(code || 1), SHUTDOWN_TIMEOUT_MS).unref();

  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch (err) {
      log.error({ event: "shutdown_error", err: (err as Error).message });
    }
  }
  log.info({ event: "shutdown_done", code });
  await flushLogger(log);
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    // A second Ctrl+C skips the clean shutdown.
    if (shuttingDown) process.exit(130);
    void shutdown(0);
  });
}
// Unknown state means untrustworthy measurements: log it and stop.
process.on("uncaughtException", (err) => {
  log.fatal({ event: "uncaught_exception", err: err.stack ?? err.message });
  void shutdown(1);
});
process.on("unhandledRejection", (reason) => {
  log.fatal({ event: "unhandled_rejection", err: String(reason) });
  void shutdown(1);
});

async function main(log: Logger, config: Config): Promise<void> {
  log.info({ event: "start", config });

  const db = openCatalogue(config.dbFile);
  cleanups.push(() => {
    db.close();
  });
  const store = createStore(db);

  const dht = await startNode({
    port: config.port,
    stateFile: config.stateFile,
    keepAliveMs: config.keepAliveMs,
    concurrency: config.dhtConcurrency,
  });
  cleanups.push(() => stopNode(dht, config.stateFile));
  dht.on("warning", (err) =>
    log.debug({ event: "dht_warning", err: err.message }),
  );
  dht.on("error", (err) => log.error({ event: "dht_error", err: err.message }));
  log.info({
    event: "dht_ready",
    nodeId: dht.nodeId.toString("hex"),
    port: dht.address().port,
    routingTable: dht.nodes.count(),
    catalogue: store.count(),
  });

  // Failures are only counted, in the stats line, to keep logs small.
  const isBlocked = createNameFilter(config.catalogueBlocklist);
  const queue = createFetchQueue(
    dht,
    store,
    { ...config.fetch, isBlocked },
    (result) => {
      if (result.ok) {
        log.info({
          event: "metadata_ok",
          infoHash: result.infoHash,
          name: result.name,
          ms: result.ms,
        });
      } else if (result.reason === "filtered") {
        log.debug({
          event: "metadata_filtered",
          infoHash: result.infoHash,
          name: result.name,
        });
      }
    },
  );
  cleanups.push(() => queue.stop());

  const pauseAt = config.fetch.maxQueued * SAMPLER_PAUSE_FRACTION;
  const sampler = startSampler(dht, store, (s) => queue.add(s), {
    ...config.sampler,
    shouldPause: () => queue.waiting() >= pauseAt,
  });
  cleanups.push(() => sampler.stop());
  const harvester = startHarvester(dht, store, (s) => queue.add(s));
  cleanups.push(() => harvester.stop());

  const stats = startStats(
    log,
    { dht, store, queue, sampler, harvester },
    config.statsIntervalMs,
  );
  cleanups.push(() => stats.stop());
}

main(log, config).catch((err: Error) => {
  log.fatal({ event: "startup_failed", err: err.stack ?? err.message });
  void shutdown(1);
});
