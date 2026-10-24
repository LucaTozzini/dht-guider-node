// Hand-written typings for the parts of bencode (v4) we use.
declare module "bencode" {
  /** Byte strings decode to Uint8Array unless an encoding is given. */
  export type BencodeValue =
    | number
    | string
    | Uint8Array
    | BencodeValue[]
    | { [key: string]: BencodeValue };

  function encode(data: unknown): Uint8Array;
  function decode(
    data: Uint8Array | string,
    start?: number,
    end?: number,
    encoding?: string,
  ): BencodeValue;

  const bencode: { encode: typeof encode; decode: typeof decode };
  export default bencode;
}
