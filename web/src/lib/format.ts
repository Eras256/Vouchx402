/** Truncates a long hex string (address, tx hash, attestation UID) to a
 * scannable "0x1234…abcd" form. Shared by every place on the site that
 * displays one of these. */
export function truncateHex(hex: string, lead = 10, tail = 8): string {
  return hex.length > lead + tail + 3 ? `${hex.slice(0, lead)}…${hex.slice(-tail)}` : hex;
}

const RELATIVE_TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

/** "3 minutes ago" / "hace 3 minutos": Intl.RelativeTimeFormat handles
 * pluralization and unit selection correctly per locale on its own, so
 * there's no hand-rolled "X ago" string to keep in sync across
 * messages/en.json and messages/es.json. Client-only by nature (the data
 * it formats only exists after a client-side fetch resolves), so there's
 * no SSR/CSR mismatch to worry about. */
export function formatRelativeTime(timestampMs: number, locale: string): string {
  const diffSeconds = Math.round((timestampMs - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  for (const [unit, secondsInUnit] of RELATIVE_TIME_UNITS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return rtf.format(diffSeconds, "second");
}
