import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * Local persistence for Vouch402. Uses Node's built-in `node:sqlite`
 * (stable in current Node LTS) instead of `better-sqlite3` — no native
 * build step required. See DECISION_LOG.md. Deliberately a single local
 * file, not a hosted database service — sufficient at this stage per the
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
  // Phase 1 — payment replay protection and issued-quote tracking.
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
      served_at       INTEGER NOT NULL
    );
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

export function insertQuote(q: Omit<Quote, "consumedAt">) {
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
}) {
  getDb()
    .prepare(
      `INSERT INTO requests_served (resource_id, address, payer, tx_hash, score, served_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(params.resourceId, params.address, params.payer, params.txHash, params.score, Date.now());
}
