# Privacy Notice, Terms and Conditions

**Last updated: August 16, 2026.**

> **This document is a draft of technical-regulatory research to support architecture and product decisions. It is not formal legal advice and has not been validated by a Mexican attorney with an active professional license (cédula profesional). It should not be treated as definitive, nor published as the site's final version, until a Mexican attorney reviews and approves it.** Section 4 of this document explicitly lists the questions left unresolved that require that professional judgment.

**This is an English translation of a Mexico-specific legal analysis, not separate coverage for another jurisdiction.** Every citation in this document (LFPIORPI, LFPDPPP, the Diario Oficial de la Federación, the authority that succeeded INAI, UMA thresholds) refers to Mexican federal law specifically. Reading this in English does not mean it covers the law of any other country. If you are visiting from outside Mexico, this document says nothing about your own jurisdiction's requirements; see section 2.7 and section 4, item 7.

---

## 0. What Vouch402 is, in plain terms

Before the formal sections, an honest description of what the product actually does, because everything else in this document depends on it:

Vouch402 is an API that sells, per request, a risk score (0 to 100) for an address on the Base network (a public, Ethereum-compatible blockchain), computed from public on-chain signals (wallet age, transaction count, diversity of contracts it has interacted with, and Vouch402's own bundled list of flagged addresses). Payment is made in USDC directly on the Base network. Every response is accompanied by a public, immutable attestation on EAS (Ethereum Attestation Service, also on Base) proving what the service actually delivered.

Vouch402 **is not a wallet, not an exchange, not a custody platform, and does not hold third-party funds**. Whoever pays transfers USDC directly, with their own wallet, to Vouch402's receiving address; Vouch402's server never signs or sends that transaction, it only verifies it by reading the public chain after it has already happened. This statement is verified against the project's real source code (not a marketing description), and is detailed in section 1.3.

---

## 1. Privacy Notice

### 1.1 Identity of the data controller (pending, see section 4)

Mexico's Federal Law on the Protection of Personal Data Held by Private Parties (LFPDPPP) requires that a privacy notice identify the data controller and its address (LFPDPPP Arts. 15 and 16, current text cited in 1.7 below). **Verified against the project's repository: there is currently no registered legal entity name, tax ID (RFC), or business address anywhere in the project's files** (the `LICENSE` file only says "Copyright (c) 2026 Vouch402," with no natural or legal person identified). This field remains **PENDING**: a legally complete privacy notice cannot be published without this information. See section 4, question 3.

Until an identified entity exists, the project's only real point of contact is its public GitHub repository: `https://github.com/Eras256/Vouchx402`.

### 1.2 Data collected (verified against the code, not a generic checklist)

Vouch402 **has no user accounts, does not ask for a name, email address, phone number, or identity documents, and performs no KYC process** in any of its components (API, website, CLI, SDK, MCP server). Verified by reviewing the full database schema (`src/lib/db.ts`) and every server endpoint (`src/server/app.ts`).

What actually gets processed:

| Data | Where it's stored | Who can see it |
|---|---|---|
| Paying wallet address (`payer`) | Local database (SQLite, the server's own, not a hosted third-party service like Supabase), and always, as a public, immutable attestation on EAS on Base | Public, permanent, on the blockchain |
| Queried wallet address (the "address" being scored) | Same as above | Public, permanent, on the blockchain, linked to the response hash |
| Payment transaction hash | Same as above | Public, permanent (it's already public blockchain data on its own) |
| Computed risk score and signals (`score`, `signals`) | Only the **hash** of the response content goes into the public attestation by default. The full content (score and signals in plain text) is only stored and publicly exposed via `GET /v1/activity` if the payer sets `makePublic: true`, or if it's the team's own wallet (public by default, see the project's DECISION_LOG.md) | Private by default; public and permanent if `makePublic` is set |
| Free-text dispute field (`details`, if `POST /v1/disputes` is used) | Written **directly into an on-chain attestation, public, immutable, non-revocable** | Public, permanent, forever, on the blockchain |
| Theme (light/dark) and network (testnet/mainnet) preference on the website | Only in the visitor's browser `localStorage`. **Never transmitted to Vouch402's server** | Only the visitor themselves, in their own browser |

**An important notice that's unusual for a typical privacy notice:** any data Vouch402 writes into an EAS attestation stays on the Base blockchain publicly, permanently, and immutably, by design of the protocol. This specifically includes the free-text dispute field. **If you include your own or a third party's personal data in that field, that data will remain public forever and cannot be deleted or corrected**, not by you and not by Vouch402. This feature is in direct tension with the cancellation and rectification rights described in 1.7, and is documented as an open question in section 4.

**About the address being queried (not necessarily the payer's own):** the service allows querying the risk of a third party's address, without that person's knowledge or consent. A blockchain address is not, by itself, necessarily linked to an identified or identifiable natural person; but if it is (for example, if that address is publicly attributable to someone), Vouch402 could be processing personal data belonging to someone who never interacted with the service. This point is documented as an open question in section 4.

### 1.3 Custody model (verified against the payment code)

Verified directly in `src/server/payment.ts` and `src/server/x402.ts`:

1. Vouch402 issues a quote (price and receiving address).
2. The payer sends, **with their own wallet and their own keys**, a standard USDC transfer on the Base network, with no involvement from Vouch402 in constructing, signing, or sending that transaction.
3. The payer gives Vouch402 the hash of that already-confirmed transaction.
4. Vouch402's server **reads** the public blockchain (via a Base RPC node) to confirm the transfer happened, matches what was quoted, and hasn't been used before. It never signs, sends, or has the technical ability to move those funds.

The only private key Vouch402's server does use is its own operational key (stored as an encrypted Foundry keystore, never in plain text), which only signs EAS attestation transactions (paying the gas for those transactions with Vouch402's own funds). That key has no relationship whatsoever to user funds.

The address where Vouch402 receives payment (`X402_PAY_TO_ADDRESS_MAINNET`) is, by design, a different address from the server's operational key (see the project's DECISION_LOG.md, entry "Split payTo (treasury) from the signer wallet"), and is simply Vouch402's own account receiving payment for its own service, the same as any merchant that accepts cryptocurrency.

### 1.4 Purposes of processing

- Providing the paid service (computing and delivering the risk score).
- Verifying that payment actually occurred on the blockchain before delivering the result.
- Issuing the public compliance record (EAS attestation) that lets anyone, including the payer, independently verify what was delivered.
- Computing public aggregate counters (`GET /v1/metrics`): number of unique payers, total requests, total volume, number of attestations and disputes. These counters are aggregated and do not individualize anyone beyond what is already public on the blockchain.

There are no secondary marketing, advertising, or commercial-profiling purposes. Data is not sold to third parties for purposes other than those described here.

### 1.5 Third parties that receive data as part of how the service works

Verified against the code's actual dependencies (`src/lib/chain.ts`, `src/scoring/score.ts`):

- **Base's public RPC nodes** (`mainnet.base.org` / `sepolia.base.org`, operated by Base/Coinbase): receive the queried address and the transaction hash to read the public blockchain.
- **Blockscout** (`base.blockscout.com`, an independent block explorer): receives the address being scored, to retrieve its public transaction history.
- **Ethereum Attestation Service / the Base network**: receive and permanently store the data described in 1.2 that gets written into each attestation.
- **Coinbase / Base Account SDK** (`@base-org/account`, used in the site's "Try It" demo): handles wallet connection and payment directly between the visitor's browser and Coinbase's infrastructure. Vouch402 never sees or handles the visitor's wallet private keys or credentials in that flow.
- **Vercel** (website hosting) and **Fly.io** (API hosting): like any infrastructure provider, they may log standard technical connection metadata (for example, IP address) as part of their normal operation. **This was not verified directly in the application's own code**, since it happens at the infrastructure level, not in Vouch402's own code; it's stated here transparently rather than omitted.

All of the blockchain-address and transaction data above is, by its nature, already public on-chain data; Vouch402 does not turn private data into public data by querying it, except for the dispute-field and `makePublic` exceptions already described in 1.2.

### 1.6 Cookies and tracking technologies

**Verified directly in the website's source code (`web/`): Vouch402 does not use cookies.** There are no session, analytics, or advertising cookies. There is no Google Analytics, Meta Pixel, or any other third-party tracker installed (every dependency in the site's `package.json` was reviewed). The only preferences saved (light/dark theme, testnet/mainnet network) use the browser's `localStorage`, a mechanism that is never transmitted to the server and that the visitor can clear at any time from their own browser's settings.

### 1.7 ARCO rights and the authority in charge

You have the right to Access, Rectify, Cancel, or Object (ARCO rights) to the processing of your personal data, under the terms of the LFPDPPP (Art. 2, section VII; the chapter on exercising ARCO rights, Arts. 27 onward of the current text).

**Important, verified against the official current text of the law** (Federal Law on the Protection of Personal Data Held by Private Parties, published in the Diario Oficial de la Federación on March 20, 2025, in effect since March 21, 2025, last reformed in the DOF on November 14, 2025; text consulted at `https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf`): Mexico's National Institute for Transparency, Access to Information and Personal Data Protection (INAI) was dissolved (constitutional decree, DOF, December 20, 2024), and the 2025 LFPDPPP itself defines, in its Article 2, section XV, that the authority ("Secretaría") is the **Secretaría Anticorrupción y Buen Gobierno** (Anti-Corruption and Good Government Ministry). **Any reference to INAI in this project's earlier materials is outdated and should be corrected to this authority.**

Since section 1.1 remains pending (no identified data controller or formal point of contact exists yet), **the actual mechanism for exercising these rights has not been defined yet**. See section 4.

### 1.8 Data retention

- **On-chain (EAS/Base):** indefinite by design of the protocol; there is no technical mechanism to delete an attestation once issued.
- **Off-chain (the server's local database):** the current code implements no retention period or automatic deletion. This is a pending product decision, not a fact verified as "already resolved"; it is documented as an open question in section 4.

### 1.9 Changes to this notice

Any change to this Privacy Notice will be published on this same page, updating the "Last updated" date at the top.

---

## 2. Terms and Conditions

### 2.1 Description of the service

Vouch402 offers, through the open x402 protocol over HTTP, a pay-per-request endpoint (`GET /v1/risk-score/:address`) that delivers a risk score (0 to 100) and the signals behind it, for a Base network address, in exchange for an on-chain-verified USDC payment. The score is computed with an explicitly non-exhaustive **v0 heuristic** (wallet age, transaction count, contract-interaction diversity, and a bundled list of flagged addresses), documented as such in the project's technical specification.

**What the endpoint actually does, and what it does not do.** This description is verified against the code and the API's real responses as of this document's date (an audit recorded in `DECISION_LOG.md`, "Standing rule, the 'Buró de Crédito' line"), not a description of design intent:

- It is a query (`GET`), never an action. Vouch402 has no endpoint today, and none as part of this document, that executes, connects, or intermediates an operation between two agents. The one endpoint that receives a `POST` (`/v1/disputes`) files a public record of disagreement about a past delivery; it does not move funds, does not reverse anything, and does not connect anyone to anyone.
- The response delivers a number and named signals (`score`, `walletAgeDays`, `txCount`, `uniqueContractInteractions`, `flagged`), never a verdict. No field in any current version of the API says "approved," "safe to transact with," or a recommendation to proceed or not. The decision about what to do with that number belongs entirely to whoever calls the API; any threshold logic ("if the score is above X, proceed") lives in the caller's own code, never on Vouch402's server.
- The API never receives, and has no way to receive, data about the operation the caller is about to carry out with the scored address (with whom, for how much, for what purpose). The only things that reach the API are the address being scored and the address paying for the query itself; nothing more.
- If Vouch402 stopped being available, no transaction between two agents that relied on this query would be blocked because of that: in the worst case, whoever was querying loses that extra informational signal and decides with less information, but the operation itself (the payment, the agreement, the transaction between those two agents) never technically depends on Vouch402 being up, because Vouch402 never takes part in constructing it, signing it, or transmitting it.

This description will be reviewed every time a new endpoint or response field is added to the API (see the standing rule in `DECISION_LOG.md`), so this section never describes a past or aspirational version of the service.

### 2.2 No custody (see the verified detail in 1.3)

Vouch402 never holds, custodies, or transmits third-party funds. It sells a data service in exchange for a fee paid directly to its own address. It is not an intermediary between two other parties' funds, nor does it offer custody, exchange, or transfer of virtual assets on behalf of its clients.

### 2.3 Not investment or financial advice

The risk score Vouch402 delivers is an informational signal derived from public on-chain data, computed with an explicitly incomplete v0 heuristic. **It does not constitute, and should not be interpreted as, investment advice, financial recommendation, or a definitive determination about the legitimacy, solvency, or behavior of any address or person.** Any decision a human or autonomous agent makes based on this score is the exclusive responsibility of whoever makes it.

### 2.4 Dispute mechanism (what it does and does not do)

The `POST /v1/disputes` endpoint lets whoever paid for a request leave a public, signed, on-chain-linked record disagreeing with what they received (for example: non-delivery, malformed response, stale data). It's important to be precise here: **filing a dispute does not automatically produce a refund.** It is a public record of disagreement, not a refund mechanism. Since payments settle irreversibly on the blockchain, there is currently no automatic refund mechanism; any resolution beyond the public dispute record would depend on a manual process not described in the current code. See section 4.

### 2.5 Risks the user accepts

- Network risk: Base's public RPC nodes can fail or respond with delay (documented in the project's DECISION_LOG.md as a real, observed problem, not a hypothetical one).
- Third-party risk: the score's computation depends on data served by Blockscout, an independent service Vouch402 does not operate.
- Early-stage product risk ("v0"): the risk heuristic is simple and explicitly non-exhaustive.
- Irreversibility risk: every blockchain payment is, by nature, irreversible once confirmed.

### 2.6 Usage restrictions and jurisdictions

Vouch402 is a public API, with no access control, no identity or age verification, and no geographic blocking. **This is a statement of fact, not a legal position**: whether the service should restrict use from certain jurisdictions has not been determined. See section 4.

### 2.7 Territorial scope of this document

This document was drafted with a focus on Mexican law, at explicit request. **The site and the API, however, are not limited to users in Mexico**: the site's default language is English, and expected traffic includes agents and developers from any country. This document **does not** cover or verify compliance with regimes such as the European Union's GDPR, United States state privacy laws, or any other framework outside Mexico. That is out of scope for this draft and must be addressed separately. See section 4.

### 2.8 Limitation of liability

The service is offered "as is," with no guarantee of continuous availability, score accuracy, or absence of errors. To the extent permitted by applicable law, Vouch402 will not be liable for indirect, incidental, or consequential damages arising from use of the service or decisions made based on its output.

### 2.9 Governing law and legal dispute resolution (off-platform)

**Not defined in this draft.** Requires an explicit decision on which law applies and before which forum (Mexican courts, arbitration, or another mechanism) disputes that cannot be resolved through the on-chain dispute mechanism described in 2.4 would be settled. See section 4.

### 2.10 Changes to these Terms

Any change will be published on this same page, updating the "Last updated" date.

---

## 3. Disclaimers and Limitations of Liability

### 3.1 Not investment advice

Restated from 2.3: nothing on this site, in the API, or in the delivered score constitutes investment, legal, tax, or financial advice.

### 3.2 Real audit status (verified, not inflated)

**Vouch402 has no smart contracts of its own.** Verified against the project's `docs/TECHNICAL_SPEC.md`: attestation schemas are registered using the EAS SDK against contracts already deployed by Ethereum Attestation Service, not custom contracts written and deployed by Vouch402. This means there is no proprietary contract code to "self-audit" or present as audited.

What Vouch402 does use, and does not control:

- **EAS (Ethereum Attestation Service):** per EAS's own official documentation, its contracts "have undergone a thorough audit by Spearbit, a reputable third-party firm" (`https://github.com/ethereum-attestation-service/eas-docs-site/blob/main/docs/quick--start/faqs.md`, consulted on August 16, 2026). That audit is of EAS, not of Vouch402.
- **USDC (Circle) on Base:** a widely used, publicly documented token; this document makes no claim of having independently verified the audit status of the USDC contract.
- **The Base network** and its RPC node infrastructure.

**Vouch402's own server (the Express/TypeScript code that runs the API) has not undergone an external security audit** as of this document's date. This is stated explicitly: nowhere on this site is it claimed that Vouch402 "has been audited" as if that were equivalent to an independent third party having audited its own application code.

### 3.3 Public, permanent nature of blockchain data

Restated from 1.2 because of how important it is: any data written into an EAS attestation (including addresses, hashes, and free-text dispute content) is public, permanent, and immutable. There is no technical way to delete it, not by the user and not by Vouch402.

### 3.4 v0 risk heuristic

The score is not, and does not claim to be, a complete risk model. It is documented as such in the project's own technical specification ("v0 heuristic... NOT a complete risk model").

---

## 4. Open questions for review by a licensed Mexican attorney

These questions are documented explicitly, left unresolved rather than decided unilaterally, because they require professional legal judgment:

1. **Does Vouch402's activity fall under section XVI of Article 17 of the LFPIORPI at all?** The literal text of section XVI (verified against the reform decree published in the DOF on July 16, 2025, evening edition, `https://www.diputados.gob.mx/LeyesBiblio/ref/lfpiorpi/LFPIORPI_ref03_16jul25.pdf`) describes as a Vulnerable Activity someone who **facilitates or carries out purchase or sale operations of virtual assets belonging to their clients**, or **provides means to custody, store, or transfer** third parties' virtual assets. Vouch402 does neither of those things: it never buys, sells, custodies, stores, or transfers virtual assets on a client's behalf; it only **receives** USDC as payment for its own data service, analogous to any merchant that accepts cryptocurrency as a form of payment. The question for the attorney is whether "accepting crypto payment for one's own service" falls, or does not fall, within section XVI's scope, or whether it's outside its reach for not involving a client's own assets.

2. **If the answer to question 1 were that it does apply (out of caution):** Acuerdo 115/2026 (the General Rules, SHCP, published in the DOF on August 7, 2026, code 5795797, signed July 24, 2026, verified directly against the text at `dof.gob.mx`) distinguishes two separate cases: Article 24 Bis 3 (custody, which requires control of the assets) and Article 24 Bis 4 (facilitation or intermediation, which **does not require control**, and which could apply even when the platform never holds the keys, if it connects, reconciles, or matches an operation on a client's behalf). Vouch402 never executes or constructs the payer's transaction (see 1.3), it only reads it independently after it has already happened. The question is whether this read-only verification alone, without constructing, routing, or connecting the operation to any counterparty, could nonetheless qualify as "facilitation or intermediation" under Article 24 Bis 4. **This question is deliberately left unresolved rather than decided unilaterally**, as requested.

3. **The "January 17, 2027" date cited as section XVI's effective date: a likely origin was found, the correct date was identified, but attorney confirmation is requested before treating it as definitive.** An expanded search, verified against three separate primary documents, not just the two already reviewed before:
   - The 2025 LFPIORPI reform decree (DOF, July 16, 2025) takes effect, per its first transitory article, "the day after its publication" (July 17, 2025), "except for the exceptions provided in the following articles"; the decree's second through sixth transitory articles were reviewed in full and none establishes a deferred effective date specifically for section XVI. This point was already confirmed.
   - Acuerdo 115/2026 takes effect generally on November 30, 2026, with eleven staggered dates for specific obligations between March 2027 and January 2028; none of them is January 17, 2027. This was also already confirmed.
   - **What's new:** the full, current, consolidated text of the LFPIORPI itself was downloaded and read (`https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPIORPI.pdf`), which includes, at the end, the transitory articles of **every** historical reform decree to the law, not just the 2025 one. There, the exact text appears: "The addition of section XVI of Article 17 of this Law shall take effect **eighteen months** after this Decree takes effect," but it belongs to a **different, much older decree**: the one that issued the Fintech Law (Ley para Regular las Instituciones de Tecnología Financiera), published in the DOF on **March 9, 2018**, whose Article Ten was what **originally added** section XVI to Article 17 (with different content at the time than the virtual-assets content it has today). That 2018 decree took effect on March 10, 2018, so its "eighteen months" expired around September 2019, unrelated to virtual assets or the 2025 reform.
   - **Most likely conclusion, not confirmed as the exact cause of the error:** it appears a secondary source found this real "eighteen months" clause (tied to section XVI, but from the 2018 decree), and miscalculated it against the 2025 reform's date instead of the 2018 decree's date it actually belongs to, producing the "January 17, 2027" figure circulating in compliance blogs. This is a well-supported hypothesis, backed by finding the real clause word for word, but **it is not confirmation that this is specifically what happened**; the attorney is asked to validate it before it's repeated as an established fact.
   - **For this document's practical purposes:** section XVI's effective date, **as it exists today, in its virtual-assets wording**, is July 17, 2025 (the 2025 decree's general date, with no exception found for that section), with Acuerdo 115/2026's operational obligations staggered between November 30, 2026, and January 2028 depending on the specific obligation. "January 17, 2027" should not be used in this project's public communications unless the attorney confirms it through a source other than the three already reviewed here.

4. **Data controller identity (LFPDPPP) and mechanism for exercising ARCO rights:** neither the project's repository nor its domain has an identified legal entity name, tax ID (RFC), or address. The Privacy Notice in section 1 cannot be considered complete or operative until that identification exists, along with a real point of contact (for example, a dedicated email address) for exercising ARCO rights.

5. **Does querying the risk of a third party's address** (someone who never interacted with Vouch402, never gave consent, and might not know they were queried) **create data-protection obligations**, particularly when `makePublic: true` makes that query and its result permanently public?

6. **Governing law and dispute-resolution forum** for controversies not resolved through the on-chain dispute mechanism (sections 2.4 and 2.9): not defined in this draft.

7. **Multi-jurisdictional scope:** this document does not cover the EU's GDPR, United States state privacy laws, or any framework outside Mexico, despite the product being publicly and globally accessible. A separate review, with local counsel in each relevant market, is required before claiming compliance outside Mexico.

8. **Off-chain data retention policy:** the current code defines no retention period or deletion mechanism for data stored in the server's own database (beyond what already remains permanently on the blockchain). This is a pending product decision.
