import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";
import type { RiskSignals } from "../scoring/score";

/**
 * Local persistence for Vouch402. Uses Node's built-in `node:sqlite`
 * (stable in current Node LTS) instead of `better-sqlite3`: no native
 * build step required. See DECISION_LOG.md. Deliberately a single local
 * file, not a hosted database service, sufficient at this stage per the
 * technical spec's /v1/metrics requirements.
 */
let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;

  const dbPath = env.dbPath;
  const dir = path.dirname(dbPath);
  if (dir && dir !== "." && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

function migrate(database: DatabaseSync) {
  // Phase 1: payment replay protection and issued-quote tracking.
  database.exec(`
    CREATE TABLE IF NOT EXISTS quotes (
      resource_id     TEXT PRIMARY KEY,
      address         TEXT NOT NULL,
      network         TEXT NOT NULL,
      pay_to          TEXT NOT NULL,
      amount_atomic   TEXT NOT NULL,
      asset           TEXT NOT NULL,
      created_at      INTEGER NOT NULL,
      expires_at      INTEGER NOT NULL,
      consumed_at     INTEGER
    );

    CREATE TABLE IF NOT EXISTS processed_payments (
      tx_hash         TEXT PRIMARY KEY,
      resource_id     TEXT NOT NULL,
      payer           TEXT NOT NULL,
      pay_to          TEXT NOT NULL,
      amount_atomic   TEXT NOT NULL,
      network         TEXT NOT NULL,
      processed_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requests_served (
      resource_id     TEXT PRIMARY KEY,
      address         TEXT NOT NULL,
      payer           TEXT NOT NULL,
      tx_hash         TEXT NOT NULL,
      score           INTEGER NOT NULL,
      served_at       INTEGER NOT NULL,
      network         TEXT
    );

    -- Phase 4: every attestation and dispute this server has emitted,
    -- for /v1/metrics. Written from the single choke points that create
    -- them (attestFulfillment / submitDispute), so this stays accurate
    -- even for status=Error fulfillment attestations that never produce
    -- a requests_served row.
    CREATE TABLE IF NOT EXISTS attestations (
      uid             TEXT PRIMARY KEY,
      status          INTEGER NOT NULL,
      payer           TEXT NOT NULL,
      payee           TEXT NOT NULL,
      network         TEXT NOT NULL,
      created_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS disputes (
      uid             TEXT PRIMARY KEY,
      ref_uid         TEXT NOT NULL,
      disputant       TEXT NOT NULL,
      reason_code     INTEGER NOT NULL,
      network         TEXT NOT NULL,
      created_at      INTEGER NOT NULL
    );

    -- Full { address, score, signals } for a fulfillment, kept
    -- separate from attestations on purpose (see DECISION_LOG.md
    -- "dev wallet / opt-in public results"): a row only ever exists
    -- here for the dev wallet or a payer who explicitly opted in via
    -- makePublic, so there is structurally nothing to leak for anyone
    -- else, no display-time filter to get wrong.
    CREATE TABLE IF NOT EXISTS public_results (
      attestation_uid TEXT PRIMARY KEY,
      address         TEXT NOT NULL,
      score           INTEGER NOT NULL,
      signals         TEXT NOT NULL,
      network         TEXT NOT NULL,
      created_at      INTEGER NOT NULL
    );
  `);

  addRequestsServedNetworkColumn(database);
}

/**
 * `requests_served` predates network-aware metrics: an existing database
 * (the live production one included) has the table without a `network`
 * column, and `CREATE TABLE IF NOT EXISTS` doesn't retroactively add one.
 * Guarded ALTER TABLE + backfill from `processed_payments` (same
 * resource_id, already has network recorded) so existing rows aren't
 * left NULL. Runs on every startup; only does anything the first time.
 */
function addRequestsServedNetworkColumn(database: DatabaseSync) {
  const columns = database.prepare(`PRAGMA table_info(requests_served)`).all() as { name: string }[];
  const hasNetwork = columns.some((c) => c.name === "network");
  if (hasNetwork) return;

  database.exec(`ALTER TABLE requests_served ADD COLUMN network TEXT;`);
  database.exec(`
    UPDATE requests_served
    SET network = (
      SELECT network FROM processed_payments
      WHERE processed_payments.resource_id = requests_served.resource_id
    )
    WHERE network IS NULL;
  `);
}

// ---- Quotes (issued 402 challenges) ----

export interface Quote {
  resourceId: string;
  address: string;
  network: string;
  payTo: string;
  amountAtomic: string;
  asset: string;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
}

/**
 * `GET /v1/risk-score/:address` is public and unpaid on the first call:
 * every hit (including repeated/automated ones with no payment ever
 * following) inserts a quote row, with nothing else in the codebase ever
 * deleting one. Unbounded on a public endpoint: sustained hammering grows
 * the table indefinitely on a small (1GB) volume. Swept opportunistically
 * on every insert rather than a separate cron/scheduler: self-throttles
 * under any traffic pattern, no extra moving parts.
 */
function deleteExpiredUnconsumedQuotes() {
  getDb()
    .prepare(`DELETE FROM quotes WHERE consumed_at IS NULL AND expires_at < ?`)
    .run(Date.now());
}

export function insertQuote(q: Omit<Quote, "consumedAt">) {
  deleteExpiredUnconsumedQuotes();
  getDb()
    .prepare(
      `INSERT INTO quotes (resource_id, address, network, pay_to, amount_atomic, asset, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(q.resourceId, q.address, q.network, q.payTo, q.amountAtomic, q.asset, q.createdAt, q.expiresAt);
}

export function getQuote(resourceId: string): Quote | undefined {
  const row = getDb()
    .prepare(`SELECT * FROM quotes WHERE resource_id = ?`)
    .get(resourceId) as any;
  if (!row) return undefined;
  return {
    resourceId: row.resource_id,
    address: row.address,
    network: row.network,
    payTo: row.pay_to,
    amountAtomic: row.amount_atomic,
    asset: row.asset,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}

export function consumeQuote(resourceId: string) {
  getDb()
    .prepare(`UPDATE quotes SET consumed_at = ? WHERE resource_id = ?`)
    .run(Date.now(), resourceId);
}

// ---- Processed payments (replay protection) ----

export function isPaymentProcessed(txHash: string): boolean {
  const row = getDb()
    .prepare(`SELECT 1 FROM processed_payments WHERE tx_hash = ?`)
    .get(txHash);
  return !!row;
}

export function markPaymentProcessed(params: {
  txHash: string;
  resourceId: string;
  payer: string;
  payTo: string;
  amountAtomic: string;
  network: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO processed_payments (tx_hash, resource_id, payer, pay_to, amount_atomic, network, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(params.txHash, params.resourceId, params.payer, params.payTo, params.amountAtomic, params.network, Date.now());
}

// ---- Requests served (for /v1/metrics) ----

export function recordRequestServed(params: {
  resourceId: string;
  address: string;
  payer: string;
  txHash: string;
  score: number;
  network: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO requests_served (resource_id, address, payer, tx_hash, score, served_at, network)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(params.resourceId, params.address, params.payer, params.txHash, params.score, Date.now(), params.network);
}

// ---- Attestations & disputes (for /v1/metrics) ----

export function recordAttestation(params: { uid: string; status: number; payer: string; payee: string; network: string }) {
  getDb()
    .prepare(
      `INSERT INTO attestations (uid, status, payer, payee, network, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(params.uid, params.status, params.payer, params.payee, params.network, Date.now());
}

/**
 * Only ever called for the dev wallet or a payer who set `makePublic`
 * on their X-PAYMENT payload (see src/server/app.ts). `signals` is
 * stored as a JSON string since node:sqlite has no native JSON column;
 * parsed back out in getRecentActivity().
 */
export function recordPublicResult(params: {
  attestationUid: string;
  address: string;
  score: number;
  signals: RiskSignals;
  network: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO public_results (attestation_uid, address, score, signals, network, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(params.attestationUid, params.address, params.score, JSON.stringify(params.signals), params.network, Date.now());
}

export function recordDispute(params: {
  uid: string;
  refUid: string;
  disputant: string;
  reasonCode: number;
  network: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO disputes (uid, ref_uid, disputant, reason_code, network, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(params.uid, params.refUid, params.disputant, params.reasonCode, params.network, Date.now());
}

export interface Metrics {
  uniquePayers: number;
  totalRequestsServed: number;
  totalVolumeAtomic: string;
  attestationCount: number;
  disputeCount: number;
}

/**
 * Every field here is a real query over this server's own records; see
 * docs/TECHNICAL_SPEC.md ("real, not estimated"). `totalVolumeAtomic` is
 * summed in JS via BigInt (not SQL SUM) to avoid any ambiguity in how
 * node:sqlite's dynamic typing hands back large integers.
 *
 * `network`, when given, filters every field to that network only. Omit
 * it to get the original unfiltered (all-networks) behavior, kept for
 * backward compatibility with anything already calling this without a
 * network in mind. The frontend (Phase 7) always passes one explicitly:
 * the pre-mainnet-cutover Sepolia test data living in this same database
 * would otherwise silently mix into what's shown as live mainnet numbers.
 * Confirmed this actually happened, not a hypothetical (see
 * DECISION_LOG.md).
 */
export function getMetrics(network?: string): Metrics {
  const database = getDb();
  const where = network ? `WHERE network = ?` : "";
  const args = network ? [network] : [];

  const uniquePayers = (
    database.prepare(`SELECT COUNT(DISTINCT payer) as c FROM processed_payments ${where}`).get(...args) as {
      c: number;
    }
  ).c;

  const totalRequestsServed = (
    database.prepare(`SELECT COUNT(*) as c FROM requests_served ${where}`).get(...args) as { c: number }
  ).c;

  const amounts = database
    .prepare(`SELECT amount_atomic FROM processed_payments ${where}`)
    .all(...args) as { amount_atomic: string }[];
  const totalVolumeAtomic = amounts.reduce((sum, row) => sum + BigInt(row.amount_atomic), 0n).toString();

  const attestationCount = (
    database.prepare(`SELECT COUNT(*) as c FROM attestations ${where}`).get(...args) as { c: number }
  ).c;

  const disputeCount = (
    database.prepare(`SELECT COUNT(*) as c FROM disputes ${where}`).get(...args) as { c: number }
  ).c;

  return { uniquePayers, totalRequestsServed, totalVolumeAtomic, attestationCount, disputeCount };
}

// ---- Recent activity (for the Phase 7 activity feed) ----

export type ActivityItem =
  | {
      kind: "fulfillment";
      uid: string;
      status: number;
      payer: string;
      payee: string;
      network: string;
      createdAt: number;
      publicResult?: { address: string; score: number; signals: RiskSignals };
    }
  | {
      kind: "dispute";
      uid: string;
      refUid: string;
      disputant: string;
      reasonCode: number;
      network: string;
      createdAt: number;
    };

/**
 * Merges `attestations` and `disputes` into one reverse-chronological
 * feed. Both tables are small (one row per real on-chain event) so a
 * plain UNION + sort in SQL is fine at this scale: no need for a
 * denormalized activity table.
 */
export function getRecentActivity(network?: string, limit = 20): ActivityItem[] {
  const database = getDb();
  const fulfillmentsWhere = network ? `WHERE a.network = ?` : "";
  const disputesWhere = network ? `WHERE network = ?` : "";
  const args = network ? [network, limit] : [limit];

  const fulfillments = database
    .prepare(
      `SELECT a.uid, a.status, a.payer, a.payee, a.network, a.created_at,
              p.address as result_address, p.score as result_score, p.signals as result_signals
       FROM attestations a
       LEFT JOIN public_results p ON p.attestation_uid = a.uid
       ${fulfillmentsWhere}
       ORDER BY a.created_at DESC LIMIT ?`
    )
    .all(...args) as {
    uid: string;
    status: number;
    payer: string;
    payee: string;
    network: string;
    created_at: number;
    result_address: string | null;
    result_score: number | null;
    result_signals: string | null;
  }[];

  const disputes = database
    .prepare(
      `SELECT uid, ref_uid, disputant, reason_code, network, created_at FROM disputes ${disputesWhere}
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(...args) as {
    uid: string;
    ref_uid: string;
    disputant: string;
    reason_code: number;
    network: string;
    created_at: number;
  }[];

  const items: ActivityItem[] = [
    ...fulfillments.map((f) => ({
      kind: "fulfillment" as const,
      uid: f.uid,
      status: f.status,
      payer: f.payer,
      payee: f.payee,
      network: f.network,
      createdAt: f.created_at,
      publicResult:
        f.result_address !== null && f.result_score !== null && f.result_signals !== null
          ? { address: f.result_address, score: f.result_score, signals: JSON.parse(f.result_signals) as RiskSignals }
          : undefined,
    })),
    ...disputes.map((d) => ({
      kind: "dispute" as const,
      uid: d.uid,
      refUid: d.ref_uid,
      disputant: d.disputant,
      reasonCode: d.reason_code,
      network: d.network,
      createdAt: d.created_at,
    })),
  ];

  items.sort((a, b) => b.createdAt - a.createdAt);
  return items.slice(0, limit);
}
