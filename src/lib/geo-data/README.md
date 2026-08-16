# Tier 1 country IP blocks

IPv4 CIDR ranges for the Tier 1 (prohibited, no exception) jurisdictions,
one `.zone` file per ISO 3166-1 alpha-2 country code: `cu` (Cuba), `ir`
(Iran), `kp` (North Korea), `sy` (Syria), `cn` (mainland China). See
`docs/TECHNICAL_SPEC.md` / `web/content/legal-*.md` ("Restricted
Jurisdictions") for the legal basis behind each entry — this directory
is only the IP data that makes the technical layer work.

**Source**: [ipdeny.com](https://www.ipdeny.com/ipblocks/) country IP
block lists, aggregated from regional internet registry (RIR)
allocation data. Free to redistribute and use commercially per their
published terms (no attribution strictly required; linkback
appreciated, hence this note). IPv4 only — this project does not
currently geo-block IPv6 traffic; see the caveat in `src/lib/geoBlock.ts`.

**Fetched**: 2026-08-16, via `https://www.ipdeny.com/ipblocks/data/countries/<cc>.zone`, then
converted from the newline-delimited `.zone` format to a plain JSON array of
CIDR strings (`<cc>.json`) so it can be `import`ed directly like
`src/scoring/flagged-addresses.json` already is — `tsc` copies referenced
`.json` files into `dist/` on build the same way, no extra runtime file-path
handling needed between `ts-node`/dev and the compiled build.

**Known limitation, stated plainly**: this is country-level data. The
Russian-occupied Crimea/Donetsk/Luhansk regions of Ukraine (part of the
Tier 1 legal basis — see the OFAC comprehensive-sanctions entry) cannot
be technically geo-blocked this way, since standard IP geolocation
resolves to Ukraine as a whole, not to those specific occupied
sub-regions. That gap is real and is called out explicitly in the legal
document and `DECISION_LOG.md`, not hidden.

**Regenerating**: re-run the fetch above for each country code, then
replace the corresponding `<cc>.json` with a JSON array of the `.zone`
file's lines. No build step depends on doing this automatically; it's a
manual, occasional refresh (IP allocations change slowly enough that
this doesn't need to be continuous).
