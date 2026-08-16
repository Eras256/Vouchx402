import cuRanges from "./geo-data/cu.json";
import irRanges from "./geo-data/ir.json";
import kpRanges from "./geo-data/kp.json";
import syRanges from "./geo-data/sy.json";
import cnRanges from "./geo-data/cn.json";

/**
 * Jurisdiction blocking, two tiers with different legal bases (see
 * `docs/TECHNICAL_SPEC.md` / `web/content/legal-*.md`, "Restricted
 * Jurisdictions", and DECISION_LOG.md for the full reasoning and the
 * primary sources behind each entry):
 *
 * - Tier 1 (this module): comprehensive-sanctions jurisdictions (OFAC/
 *   EU/UN, broadest standard applied) plus mainland China (separate
 *   legal basis: PBoC et al.'s 银发〔2026〕42号, which explicitly reaches
 *   offshore providers serving mainland residents). Hard-blocked at the
 *   API layer — this is that block.
 * - Tier 2 (EU/EEA under MiCA, US under FinCEN + state money-transmission
 *   regimes): NOT technically blocked here. "Restricted, pending legal
 *   review" is not the same claim as "prohibited" — see the Términos.
 *   Covered by the contractual/attestation layer only, not this module.
 *
 * Deliberately a blocklist (open by default, closed only where there's
 * a specific documented reason), never an allowlist: an allowlist would
 * block real people with no actual finding against them just because
 * their country was never explicitly added, which doesn't scale and
 * isn't the shape this kind of restriction should take.
 *
 * Mexico does not appear here. The operator being based in Mexico is a
 * separate question (tracked in the pending LFPIORPI/Acuerdo 115/2026
 * review, see the 8 open questions in web/content/legal-es.md) from
 * who Vouch402 can serve, which is what this file controls. Conflating
 * the two would be a real mistake, not just an inconsistency.
 */

export interface Tier1Match {
  countryCode: string;
  countryName: string;
}

interface CidrRange {
  base: number;
  mask: number;
}

// Human-readable names, used only in the block response / logs.
const TIER1_COUNTRIES: Record<string, string> = {
  cu: "Cuba",
  ir: "Iran",
  kp: "North Korea",
  sy: "Syria",
  cn: "Mainland China",
};

const RAW_RANGES: Record<string, string[]> = {
  cu: cuRanges,
  ir: irRanges,
  kp: kpRanges,
  sy: syRanges,
  cn: cnRanges,
};

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    // Reject anything that isn't a plain 1-3 digit decimal octet (e.g.
    // "0x7f", "1e2", a leading "+"): Number() would otherwise silently
    // accept forms no real client sends but that could be used to
    // construct a misleading match.
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function parseRanges(cidrs: string[], countryCode: string): Array<CidrRange & { countryCode: string }> {
  return cidrs.map((line) => {
    const [base, prefixStr] = line.split("/");
    const prefix = Number(prefixStr);
    const baseInt = ipv4ToInt(base);
    if (baseInt === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      throw new Error(`geoBlock: malformed CIDR entry "${line}" for country "${countryCode}"`);
    }
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return { base: baseInt & mask, mask, countryCode };
  });
}

// Built once at module load, not per-request: this is static reference
// data (see geo-data/README.md for the refresh process), so there's no
// reason to re-parse it on every call.
const tier1Ranges: Array<CidrRange & { countryCode: string }> = Object.entries(RAW_RANGES).flatMap(
  ([cc, cidrs]) => parseRanges(cidrs, cc)
);

/**
 * Checks a single IP address (IPv4 only — see geo-data/README.md)
 * against the Tier 1 block list. Returns the matched country, or
 * `null` if the address isn't in a Tier 1 range (including malformed
 * input: fails open on unparseable addresses rather than blocking
 * them, since this list is only ever used to add a restriction, never
 * to establish trust — an unparseable IP should never itself become a
 * reason to deny service).
 */
export function checkTier1(ip: string): Tier1Match | null {
  // Strip a possible IPv6-mapped-IPv4 prefix ("::ffff:1.2.3.4"), the
  // form Node sometimes reports for an IPv4 client on a dual-stack
  // socket, so it still matches against the IPv4 ranges below.
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const ipInt = ipv4ToInt(normalized);
  if (ipInt === null) return null;

  for (const range of tier1Ranges) {
    if ((ipInt & range.mask) === range.base) {
      return { countryCode: range.countryCode, countryName: TIER1_COUNTRIES[range.countryCode] };
    }
  }
  return null;
}
