import { Attribution } from "ox/erc8021";
import { BUILDER_CODE } from "../constants/builderCode";

/**
 * ERC-8021 data suffix for every outgoing transaction Vouch402's own
 * wallet sends (schema registration, attestations). Computed once —
 * `toDataSuffix` is pure given the same codes.
 */
export const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

/** Appends the attribution suffix to an existing calldata hex string. */
export function withAttribution(data: string): string {
  const base = data && data !== "0x" ? data : "0x";
  return base + DATA_SUFFIX.slice(2);
}
