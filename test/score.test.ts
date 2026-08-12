import { describe, it, expect } from "vitest";
import { scoreFromSignals, type RiskSignals } from "../src/scoring/score";

/**
 * Pure unit tests for the scoring formula — no RPC, no BaseScan, no
 * network at all. Deliberately immune to the public Base Sepolia RPC's
 * observed flakiness (see DECISION_LOG.md) that affects every other test
 * file in this repo.
 */
describe("scoreFromSignals", () => {
  const fresh: RiskSignals = { walletAgeDays: 0, txCount: 0, uniqueContractInteractions: 0, flagged: false };

  it("scores a brand-new, inactive wallet at maximum risk", () => {
    expect(scoreFromSignals(fresh)).toBe(100);
  });

  it("scores an old, active, diverse wallet at minimum risk", () => {
    const established: RiskSignals = {
      walletAgeDays: 365,
      txCount: 500,
      uniqueContractInteractions: 50,
      flagged: false,
    };
    expect(scoreFromSignals(established)).toBe(0);
  });

  it("forces risk to >= 95 when flagged, regardless of other signals", () => {
    const establishedButFlagged: RiskSignals = {
      walletAgeDays: 365,
      txCount: 500,
      uniqueContractInteractions: 50,
      flagged: true,
    };
    expect(scoreFromSignals(establishedButFlagged)).toBeGreaterThanOrEqual(95);
  });

  it("never returns a score outside [0, 100]", () => {
    const extreme: RiskSignals = {
      walletAgeDays: 1_000_000,
      txCount: 1_000_000,
      uniqueContractInteractions: 1_000_000,
      flagged: false,
    };
    const score = scoreFromSignals(extreme);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("no single signal alone can reach minimum risk (each is capped)", () => {
    // Only wallet age, nothing else — age alone caps at 40 trust points,
    // so risk can't drop below 60 from age alone.
    const ageOnly: RiskSignals = { walletAgeDays: 10_000, txCount: 0, uniqueContractInteractions: 0, flagged: false };
    expect(scoreFromSignals(ageOnly)).toBeGreaterThanOrEqual(60);

    // Only tx count — caps at 30 trust points, risk can't drop below 70.
    const activityOnly: RiskSignals = { walletAgeDays: 0, txCount: 10_000, uniqueContractInteractions: 0, flagged: false };
    expect(scoreFromSignals(activityOnly)).toBeGreaterThanOrEqual(70);

    // Only contract diversity — caps at 30 trust points, risk can't drop below 70.
    const diversityOnly: RiskSignals = { walletAgeDays: 0, txCount: 0, uniqueContractInteractions: 10_000, flagged: false };
    expect(scoreFromSignals(diversityOnly)).toBeGreaterThanOrEqual(70);
  });

  it("is monotonically non-increasing in each signal (more trust signal never raises risk)", () => {
    const low = scoreFromSignals({ walletAgeDays: 10, txCount: 5, uniqueContractInteractions: 2, flagged: false });
    const higherAge = scoreFromSignals({ walletAgeDays: 50, txCount: 5, uniqueContractInteractions: 2, flagged: false });
    const higherTxCount = scoreFromSignals({ walletAgeDays: 10, txCount: 20, uniqueContractInteractions: 2, flagged: false });
    const higherDiversity = scoreFromSignals({ walletAgeDays: 10, txCount: 5, uniqueContractInteractions: 8, flagged: false });

    expect(higherAge).toBeLessThanOrEqual(low);
    expect(higherTxCount).toBeLessThanOrEqual(low);
    expect(higherDiversity).toBeLessThanOrEqual(low);
  });
});
