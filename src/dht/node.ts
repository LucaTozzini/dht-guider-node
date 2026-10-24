import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import DHT, { type PeerAddress } from "bittorrent-dht";

export interface NodeOptions {
  /** UDP port to listen on. */
  port: number;
  /** Where the node ID and known nodes are saved between runs. */
  stateFile: string;
  /**
   * Bootstrap nodes as "host:port". Omit to use the library's public
   * Mainline routers, or pass `false` to start a standalone node
   * (e.g. a simulation seed).
   */
  bootstrap?: string[] | false;
}

interface SavedState {
  nodeId: string;
  nodes: PeerAddress[];
}

/**
 * Create a DHT node, listen on `opts.port`, and resolve once it has
 * bootstrapped. Reuses the saved node ID and known nodes if present.
 */
export async function startNode(opts: NodeOptions): Promise<DHT> {
  const saved = await loadState(opts.stateFile);

  const dht = new DHT({
    nodeId: saved?.nodeId,
    bootstrap: opts.bootstrap,
  });

  // Must happen in this tick: bootstrapping starts on the next tick, and
  // the socket would otherwise bind to a random port.
  dht.listen(opts.port);

  // Saved nodes have no IDs, so addNode pings each one and keeps those
  // that answer. Passing them as `bootstrap` instead would replace the
  // library's default routers rather than add to them.
  for (const node of saved?.nodes ?? []) dht.addNode(node);

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      dht.destroy();
      reject(err);
    };
    dht.once("error", onError);
    dht.once("ready", () => {
      dht.off("error", onError);
      resolve();
    });
  });

  return dht;
}

/** Save the node's ID and routing table, then shut it down. */
export async function stopNode(dht: DHT, stateFile: string): Promise<void> {
  await saveState(dht, stateFile);
  await new Promise<void>((resolve) => dht.destroy(resolve));
}

export async function saveState(dht: DHT, stateFile: string): Promise<void> {
  const state: SavedState = {
    nodeId: dht.nodeId.toString("hex"),
    nodes: dht.toJSON().nodes,
  };
  await mkdir(dirname(stateFile), { recursive: true });
  // Write then rename, so a crash mid-write never leaves a corrupt file.
  const tmp = `${stateFile}.tmp`;
  await writeFile(tmp, JSON.stringify(state));
  await rename(tmp, stateFile);
}

async function loadState(stateFile: string): Promise<SavedState | null> {
  try {
    return JSON.parse(await readFile(stateFile, "utf8")) as SavedState;
  } catch {
    return null;
  }
}

export interface FindPeersOptions {
  /** Give up after this long (default 15s). */
  timeoutMs?: number;
  /** Stop early once this many distinct peers are found (default 20). */
  maxPeers?: number;
}

/** Look up peers for an info hash with a get_peers lookup. */
export function findPeers(
  dht: DHT,
  infoHash: Buffer,
  { timeoutMs = 15_000, maxPeers = 20 }: FindPeersOptions = {},
): Promise<PeerAddress[]> {
  return new Promise((resolve) => {
    const found = new Map<string, PeerAddress>();

    const onPeer = (peer: PeerAddress, hash: Buffer) => {
      if (!hash.equals(infoHash)) return;
      found.set(`${peer.host}:${peer.port}`, peer);
      if (found.size >= maxPeers) finish();
    };

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      abort();
      dht.off("peer", onPeer);
      resolve([...found.values()]);
    };

    dht.on("peer", onPeer);
    const timer = setTimeout(finish, timeoutMs);
    const abort = dht.lookup(infoHash, finish);
  });
}
