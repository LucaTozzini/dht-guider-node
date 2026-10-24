// Hand-written typings for the parts of bittorrent-protocol (v5) we use.
// Source of truth: node_modules/bittorrent-protocol/index.js.
declare module "bittorrent-protocol" {
  import { Duplex } from "node:stream";

  export interface WireExtensions {
    extended?: boolean;
    dht?: boolean;
    fast?: boolean;
  }

  /** A BEP 10 extension class, e.g. the one ut_metadata() returns. */
  export interface ExtensionClass {
    new (wire: Wire): unknown;
    prototype: { name: string };
  }

  export default class Wire extends Duplex {
    /** type: e.g. "tcpOutgoing"; peEnabled: 0 = plaintext only. */
    constructor(type?: string, peEnabled?: number);
    peerId: string | null;
    peerExtensions: WireExtensions;
    peerExtendedHandshake: Record<string, unknown>;
    /** Install a BEP 10 extension; it becomes `wire[name]`. */
    use(extension: ExtensionClass): void;
    handshake(
      infoHash: Uint8Array | string,
      peerId: Uint8Array | string,
      extensions?: WireExtensions,
    ): void;
    setTimeout(ms: number, unref?: boolean): void;
    destroy(): this;

    on(
      event: "handshake",
      listener: (
        infoHash: string,
        peerId: string,
        extensions: WireExtensions,
      ) => void,
    ): this;
    on(
      event: "timeout" | "close" | "end" | "finish",
      listener: () => void,
    ): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
}
