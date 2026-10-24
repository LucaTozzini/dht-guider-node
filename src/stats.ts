import type DHT from "bittorrent-dht";
import type { CatalogueStore } from "./catalogue/store.js";
import type { Harvester } from "./dht/harvester.js";
import type { Sampler } from "./dht/sampler.js";
import type { Logger } from "./log.js";
import type { FetchQueue } from "./metadata/queue.js";

export interface StatsSources {
  dht: DHT;
  store: Pick<CatalogueStore, "count">;
  queue: FetchQueue;
  sampler: Sampler;
  harvester: Harvester;
}

/** Everything the report's measurements need, as running totals. */
export function snapshot(
  { dht, store, queue, sampler, harvester }: StatsSources,
  startedAt: number,
) {
  return {
    event: "stats",
    uptimeS: Math.round((Date.now() - startedAt) / 1000),
    catalogue: store.count(),
    routingTable: dht.nodes.count(),
    queue: {
      waiting: queue.waiting(),
      running: queue.running(),
      ...queue.counts,
    },
    sampler: { ...sampler.counts, frontier: sampler.frontierSize() },
    harvester: { ...harvester.counts },
  };
}

/** Log a stats line every `intervalMs`. */
export function startStats(
  log: Logger,
  sources: StatsSources,
  intervalMs: number,
) {
  const startedAt = Date.now();
  const logNow = () => log.info(snapshot(sources, startedAt));
  const timer = setInterval(logNow, intervalMs);
  timer.unref();
  return {
    /** Log one final line and stop. */
    stop() {
      clearInterval(timer);
      logNow();
    },
  };
}
