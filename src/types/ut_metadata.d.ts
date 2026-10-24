// Hand-written typings for ut_metadata (v5), the BEP 9 extension.
// Source of truth: node_modules/ut_metadata/index.js.
declare module "ut_metadata" {
  import type { EventEmitter } from "node:events";
  import type { ExtensionClass } from "bittorrent-protocol";

  /** The instance installed on a wire as `wire.ut_metadata`. */
  export interface UtMetadata extends EventEmitter {
    /**
     * Raw bencoded info dictionary, once complete. Note ut_metadata only
     * checks it against the info hash the *peer* sent in its handshake.
     */
    metadata?: Uint8Array;
    /** Start requesting metadata pieces from the peer. */
    fetch(): void;
    cancel(): void;
    /** Fires with a bencoded `{ info }` dict once metadata is complete. */
    on(event: "metadata", listener: (torrent: Uint8Array) => void): this;
    /** Non-fatal problems, e.g. peer lacks ut_metadata or rejected us. */
    on(event: "warning", listener: (err: Error) => void): this;
  }

  /** Returns the extension class to pass to `wire.use()`. */
  export default function utMetadata(metadata?: Uint8Array): ExtensionClass;
}
