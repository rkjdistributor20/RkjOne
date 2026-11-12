# RKJ One Fiuu DuitNow QR POS Setup

Last updated: 2026-11-04

## Authoritative VT registered-device operating runbook

Use [FIUU_BR001_UAT_RUNBOOK.md](./FIUU_BR001_UAT_RUNBOOK.md) for the historical BR001 go/no-go gates, preflight, controlled UAT evidence and rollback baseline. It remains credential-free. The fleet design extends that validated operating pattern without copying device identity between branches.

Use [FIUU_BRANCH_STAFF_QUICK_GUIDE.md](./FIUU_BRANCH_STAFF_QUICK_GUIDE.md)
for the short cashier/supervisor procedure. It clearly separates automatic VT
on an exact registered official tablet from the static/manual fallback used by
every tablet that is not yet registered.

Use [FIUU_VT_36_BRANCH_ROLLOUT.md](./FIUU_VT_36_BRANCH_ROLLOUT.md) for the
practical per-cawangan registration, first-transaction and go/no-go checklist.

The three Fiuu integration paths are separate:

- **Fiuu VT App-to-App** uses package `com.rms.mobile.razervt` and unsigned `razervt://` deep-link responses. The official application is now available on the BR001 Samsung and is the executable device-UAT path once Fiuu supplies activation material mapped to `masterkayajunus01`.
- **OPA Dynamic DuitNow QR** is the preferred signed server-to-server path for wider rollout. It has its own Application Code, Store ID, Terminal ID and Secret Key, which have not been provisioned for this UAT.
- **Fiuu VT+ + cloudECR** uses package `com.fiuu.cloudecrvt` and the signed cloudECR REST contract. It is retained as a prepared fallback.

Never reuse credentials, identifiers, activation/binding material or readiness evidence between these paths.

## Current registered-device decision (2026-11-04)

The earlier controlled RM2.50 BR001 static DuitNow QR sale passed and established
the manual fallback baseline. It has since been superseded as the primary BR001
test by controlled Fiuu VT App-to-App transactions.

The official **Fiuu Virtual Terminal App-to-App** path has completed controlled BR001 operational UAT: matching `SALE` followed by fresh `STATUS=00` produced exactly one sale, receipt, stock update and shift aggregate, and the receipt printed successfully. The Fiuu v1.2 callback remains unsigned, so this is operational confirmation from the enrolled official tablet rather than cryptographic provider proof.

The approved expansion is a registered-device rollout for canonical `BR001`-`BR036`, not bulk tablet activation. Server configuration may explicitly list all 36 codes, but a branch receives automatic VT only when its branch is active and the exact official tablet has a verified asset record, valid serial/IMEI, successful one-time registration and matching current enrollment generation. Every other tablet remains on the branch-specific static/manual QR workflow. The owner will perform physical registration of each remaining tablet; RKJ One must not synthesize registrations or copy a cookie, secret or device identity between branches.

### Device and Play evidence updated on 2026-10-27

- Windows Phone Link reports the connected BR001 tablet as Samsung model `SM-X406B` running Android `16`.
- Google Play account `rkjdistributor20@gmail.com` has registered two relevant devices: Samsung `SM-X406B` and HONOR `ELN2-L29`, identified by Google Play as **HONOR Pad X9a**. The HONOR device is not model `NDL2-L09` and is not an HONOR Pad X8b.
- The standard **Fiuu Virtual Terminal** package `com.rms.mobile.razervt` is now available, installed on the physical BR001 Samsung and opens to the four-part VT Activation Code / QR activation screen. Earlier Play incompatibility evidence is superseded.
- Installation is not activation. The activation code/QR must be provider-issued for `masterkayajunus01` and the intended BR001 terminal; Merchant ID, portal password, Verify Key, Secret Key, OPA Application Code and VT+ binding data are not substitutes.
- The current **Fiuu VT+** listing is available to all devices registered under the same Google Play account. Availability establishes only Play eligibility; it does not establish an activated VT+ terminal, cloudECR entitlement, binding or payment readiness.
- The official Fiuu VT+ package was installed from Play on the physical BR001 Samsung, but remained at its blue splash screen after a clean launch. The same tablet reached `https://cloudecr.fiuu.com` over HTTPS and received the expected API-style response, so DNS/TLS/network access is working and the remaining blocker is inside the provider application/runtime or its provisioning.
- An earlier support diagnosis referred to Android 10 and an X8b device. That diagnosis appears to have used a different or assumed device profile and does not match the device metadata now observed directly in Phone Link and Google Play. Future provider troubleshooting must use the verified `SM-X406B`/Android 16 and `ELN2-L29`/HONOR Pad X9a inventory so all parties diagnose the same hardware.

The existing Samsung tablet does not need replacement. Standard Fiuu VT is now
installed, activated and operationally proven on BR001. The separate cloudECR/VT+
fallback remains disabled and is not part of this rollout.

Do not configure VT+ or cloudECR credentials as a shortcut for the VT rollout.
If that fallback is reconsidered later, it requires its own provider account,
terminal mapping, binding, UAT and settlement approval.

Do not bulk-update tablet rows or reuse a registration. The all-branch allowlist is safe only together with the registered-device database and application guards: registration is the branch activation event. Keep static/manual fallback available at all times, and treat signed OPA as a separate future integration requiring its own provider credentials and approval.

## Historical provider status (through 2026-10-20)

- Fiuu confirmed on 2026-10-06 that the 36 add-on stores were ready. Their branch-specific static DuitNow QR registrations have been received, validated and bundled into RKJ One.
- Fiuu confirmed on 2026-10-08 that VT App-to-App was activated for the merchant. On 2026-10-27 the official package became installable and reached its activation screen on the BR001 Samsung. Device availability is therefore resolved, but submerchant/terminal activation and settlement mapping for `masterkayajunus01` still require confirmation.
- On 2026-10-15 RKJ asked Pn Aida/Fiuu for an authenticated server status API or signed callback so a payment can be finalized without staff judgement. Pn Aida said the technical team would check. A reminder was sent on 2026-10-19; no technical answer had arrived in either registered merchant mailbox or WhatsApp by 2026-10-20.
- An older email draft requesting OPA credentials and 36-store mapping remains unsent. Do not send it as written because it predates Fiuu's VT App-to-App direction.
- Fiuu notified both merchant accounts on 2026-10-09 that **card payment channel services** were temporarily suspended until further notice. This notice does not state that DuitNow QR or VT is suspended, but card/debit must not be offered through Fiuu until written reinstatement is received.
- The 2026-10-16 FPX compliance notice requires action by 2026-12-31 only for merchants that render or manage the issuer-bank list themselves. RKJ's Fiuu Agent Payment adapter posts to Fiuu Hosted Payment Page, so Fiuu owns that list. Reassess only if a direct/seamless FPX checkout is introduced.
- The 36-branch release keeps VT free of provider secrets: activation remains in
  the official Fiuu application, while RKJ One only allowlists canonical branch
  codes and binds each transaction to the exact registered tablet.

## Release verification (2026-11-04)

- Staging migration `20261104130000_expand_fiuu_vt_registered_branches.sql`
  applied successfully and the Fiuu database verifier returned zero errors.
- Production is configured with the explicit canonical `BR001`-`BR036` VT
  allowlist. Migration `20261104190000_activate_br012_and_prepare_tablet.sql`
  closes the final branch-record gap by activating the exact `BR012` record and
  creating only its `PENDING` tablet slot. It does not enroll or activate a
  physical tablet.
- Full application verification passed: 35 test files / 289 tests, TypeScript,
  ESLint and the optimized Next.js production build.
- Production remains safe for gradual physical rollout because every unregistered
  branch falls back to static/manual QR. Registering the exact tablet is the
  per-branch activation event; no bulk database activation is permitted.
- Post-migration Production evidence shows 36/36 canonical branch records
  `ACTIVE`, 36/36 current tablet slots, no missing or duplicate slot, seven
  already-registered tablets (`BR001`, `BR014`, `BR017`, `BR018`, `BR021`,
  `BR023`, `BR035`) and 29 slots still `PENDING` physical registration.

## Production branch and tablet readiness audit (superseded 2026-11-04)

The owner authorized activation for all outlets, but that authorization is a rollout approval and does not replace physical tablet enrolment or payment UAT. A read-only Production audit found:

- 35 active Roti Kaya Junus branch records: `BR001`-`BR011` and `BR013`-`BR036`; `BR012` is missing or inactive and must be resolved before claiming a 36-outlet rollout;
- 6 official tablet records are `ACTIVE` (`BR001`, `BR017`, `BR018`, `BR021`, `BR023`, `BR035`) and 29 are still `PENDING`;
- all 6 active tablet records have verified asset details, but only `BR001` was seen in the last seven days;
- 4 of the 6 active tablets report the native app (`BR001`, `BR018`, `BR021`, `BR035`);
- 0 tablets report Android Device Owner, kiosk permission or active kiosk enforcement.

Do not bulk-update tablet records to `ACTIVE`. The registered-device release may explicitly allowlist `BR001`-`BR036`, but the runtime and database continue to reject VT until each exact physical tablet passes asset verification and one-time enrollment. Static QR/manual confirmation remains the fallback for every active branch with a matching branch record. Migration `20261104190000_activate_br012_and_prepare_tablet.sql` closes the final BR012 branch-record gap and creates only a `PENDING` slot, so all 36 branches can now be registered one physical tablet at a time.

Register tablets one cawangan at a time. After each registration, run a controlled first transaction and reconcile the Fiuu result, RKJ One sale, one receipt, stock movement, shift aggregate and Finance settlement before normal use. Retain static QR/manual fallback and immediate rollback throughout.

## Fiuu VT App-to-App registered-device rollout

Fiuu supplied the official VT App-to-App v1.2 specification and confirmed on 2026-10-08 that the function was activated. RKJ One now has a separate `fiuu_vt` transport for a strictly allowlisted managed Android tablet. It requires Fiuu VT to be installed through Managed Google Play, launches package `com.rms.mobile.razervt` explicitly, requests merchant-presented DuitNow QR through channel `RPP_DuitNowQR-Offline`, and performs a second `STATUS` operation after the SALE result.

The VT deep-link response does **not** contain HMAC, a digital signature, nonce or server-verifiable proof. For that reason:

- SALE never creates a sale, receipt or stock movement;
- STATUS must match the random order ID, Transaction ID, amount, `MYR` and exact DuitNow channel;
- `22`, `33` and `45` remain pending; `11`, `44` and `55` enter a three-second final-status settlement hold before the attempt is released;
- a matching concurrent STATUS `00` wins that short hold, while creation of a second payable attempt is blocked; after the hold a confirmed `55` preserves the cart and lets staff start a fresh payment immediately;
- STATUS is rejected unless the matching SALE result and immutable Transaction ID were recorded first;
- STATUS `00` is recorded durably as `REPORTED`, cannot be expired into a second payable attempt and immediately directs the RKJ One client to automatic fulfillment;
- the automatic request still requires the same authenticated user, official device, branch and active shift, plus a fresh exact STATUS match;
- the service-role-only, row-locked RPC then creates at most one sale, one receipt and one stock deduction;
- shift closure locks the shift before calculating totals and remains blocked while a `REPORTED` payment awaits confirmation;
- all POS mixed payments require an exact cash-plus-QR split with no cash change, preventing drawer totals from being overstated across dynamic and static/manual fallback;
- the server allowlist accepts only explicit canonical `BR001`-`BR036` values and rejects malformed, duplicate or wildcard configuration;
- each payment is bound to the exact device UUID, device code and enrollment generation, while database guards block device mutation or reenrollment during an unresolved payment;
- a listed cawangan without its own active, verified and registered official tablet continues using its static QR/manual workflow.

This is automatic operational confirmation, not cryptographic provider verification. A forged deep link would still need the private pending order context and exact transaction details on the enrolled device, but the Fiuu v1.2 response itself is unsigned. Signed OPA or cloudECR remains the preferred server-verifiable path for future server-side verification. Configure the registered-device fleet with every code written explicitly:

```dotenv
POS_QR_PAYMENT_MODE=fiuu_vt
POS_FIUU_VT_BRANCHES=BR001,BR002,BR003,BR004,BR005,BR006,BR007,BR008,BR009,BR010,BR011,BR012,BR013,BR014,BR015,BR016,BR017,BR018,BR019,BR020,BR021,BR022,BR023,BR024,BR025,BR026,BR027,BR028,BR029,BR030,BR031,BR032,BR033,BR034,BR035,BR036
POS_FIUU_VT_VALIDITY_SECONDS=900
```

Allowlisting is not enrollment and does not make an outlet payment-ready. The native RKJ One Android build and official Fiuu VT app are required; the web/PWA alone cannot launch and validate the Fiuu VT app. Never copy a registered tablet session to another device or cawangan.

## Static QR operational fallback (2026-10-06)

Fiuu static DuitNow QR registrations for `BR001` through `BR036` are now bundled into RKJ One as versioned public payment assets. The POS resolves the selected branch through an authenticated, organization- and branch-scoped endpoint before displaying its assigned QR. In `manual` mode the cashier must verify the successful customer payment, matching amount and recipient name `ROTI KAYA JUNUS`, then tick the confirmation before RKJ One records the sale for Finance reconciliation.

All 36 generated assets were decoded and compared byte-for-byte with the Fiuu EMV payload manifest. This fallback is immediately usable without exposing any Fiuu secret. It does not convert a static QR into an automatically confirmed transaction: signed OPA callback UAT and provider-issued branch credentials remain required before `POS_QR_PAYMENT_MODE=fiuu` may be enabled in Production.

## Verified design

- Merchant: Roti Kaya Junus (`rotikayajunus` in the merchant portal).
- Product: Fiuu Offline Payment API, Pre-Create Transaction QR.
- Channel: DuitNow QR Offline, channel ID `24`, currency `MYR`.
- Merchant portal status verified on 2026-08-05: `DuitNow QR Offline` is already `Activated` at `0.80%` for this merchant account.
- Earlier portal checks showed other merchant channels as activated, but the 2026-10-09 suspension notice overrides that evidence for card payments until Fiuu confirms reinstatement in writing.
- The generic merchant Return URL, Notification URL and Callback URL are currently empty.
- Application ID `121582` is the Roti Kaya Junus POS merchant application. Its registered merchant email is `isaeee94@gmail.com`.
- Application ID `121583` is the RKJ Distributor Agent Payment merchant application. Its registered merchant email is `rkjdistributor20@gmail.com`.
- Applications `121582` and `121583` are separate merchant accounts and their credentials, callbacks, transactions and settlement evidence must never be mixed.
- The dedicated sandbox account for Roti Kaya Junus is accessible. Its Merchant ID, Verify Key and Secret Key are available in the sandbox portal. Values remain secret and are not recorded in the repository.
- Fiuu Ticket `2971942` confirms that merchant `rotikayajunus` has the offline e-Wallet channel required for OPA. Fiuu will create a separate sandbox Application Code after RKJ confirms that its sandbox account already exists; the Merchant ID must not be assumed to be that Application Code.
- Fiuu's 2026-08-21 reply said Application `121582` had no store information at that time. Fiuu subsequently confirmed on 2026-10-06 that the 36 add-on stores were ready, and the 36 static QR payloads were received. The signed cloudECR contract is documented and implemented locally. Provider-side VT+ provisioning, exact sub-account/terminal mapping, refund procedure and settlement mapping remain **To be confirmed**.
- The public Fiuu Offline Payment API v2.1.18 specification confirms the configured sandbox and Production pre-create URLs, `applicationCode` as a provider-issued OPA identifier, `storeId` and `terminalId` as merchant identifiers, `channelId=24` for DuitNow QR, form-encoded POST requests and HMAC-SHA256 support. It does not establish that the sandbox Merchant ID is an OPA `applicationCode` for this account.
- RKJ One supports verified branch static QR/manual confirmation for all 36 branches and registered-device Fiuu VT App-to-App for an exact enrolled official tablet. Signed OPA and signed cloudECR + Fiuu VT+ remain separate prepared server-verifiable paths.
- An unregistered or mismatched `BR001`-`BR036` tablet remains in static/manual mode even when the fleet transport is `fiuu_vt`. OPA and cloudECR remain disabled unless separately provisioned, tested and approved.
- The POS client now preserves an unresolved dynamic-QR intent across a page reload for the same branch and shift. It does not offer a second QR while the original intent can still receive a signed late callback.
- A database uniqueness guard also permits only one pending Fiuu intent per organization, branch, shift and cashier, covering concurrent tabs or requests beyond the client-side recovery guard.
- OPA status polling remains read-only. In BR001 cloudECR mode, status polling may acquire a database lease and call `getLast`; concurrent tabs can cause at most one provider reconciliation attempt every 180 seconds. The lease is longer than the server request window so a second query cannot replace the first query reference while it is still running.
- The BR001 target is an 80-second cloudECR transaction timeout, with the hosting route budget set higher by a safe margin. A deployment is **NO-GO** if configuration or code rejects `80000`, if the platform ends the request earlier, or if pending/`getLast` recovery is not proven. A timeout must retain the durable intent and must never trigger a second SALE automatically.
- Every cloudECR SALE uses a unique 20-character reference stored as transaction metadata. Every `getLast` uses a different unique query reference; a successful recovery is accepted only when the signed response returns the original SALE reference in metadata and matches the configured POS ID, Device ID, Terminal SN, amount, currency and DuitNow channel.
- A signed `00/00` response is persisted first as `REPORTED` with its Fiuu Transaction ID and exact verified response payload. Receipt, stock and shift fulfilment is then idempotently retried from that durable state without sending another SALE. A failed or ambiguous `getLast` never converts the original payment to `FAILED`.
- Only one unresolved cloudECR SALE may exist for the configured POS ID, Device ID and Terminal SN across all RKJ tablets. A server-side price snapshot plus deterministic product-row locks prevents a concurrent catalogue change from producing a receipt with a different amount. Stock is revalidated during fulfilment; any mismatch stays `REPORTED` for Finance/manual resolution.
- After the visible QR expires, RKJ One keeps the intent locked during the database-enforced 20-minute reconciliation grace period; only after that period can the attempt become safely retryable.
- Production OPA QR creation requires an explicit branch entry with the exact RKJ One `organizationId` and `branchId`, provider-issued Application Code, Secret Key, Store ID and Terminal ID, plus a non-secret `credentialVersion` generation label. Global credentials or an invented identifier cannot activate a Production branch.
- Callback verification remains available after creation mode is rolled back to `manual`, allowing an already-issued QR to complete safely.

Merchant portal credentials shown on the portal home page must not be assumed to be OPA Application Code/Secret Key. Obtain the OPA credentials and notification setup from Fiuu for the intended store/branch arrangement.

## Immediate BR001 OPA actions

1. Retrieve the BR001 sandbox OPA Application Code and Secret Key from the authenticated Fiuu portal or an approved secure channel. Do not substitute the portal Merchant ID, Verify Key or cloudECR Secret Key.
2. Record the RKJ One `organizationId` and BR001 `branchId` UUIDs together with the provider-approved BR001 Store ID and Terminal ID, then assign a non-secret `credentialVersion` for that exact credential generation. OPA remains fail-closed unless all seven fields belong to the same tenant, branch and environment.
3. Enter a `BR001`-only mapping directly into the Vercel Preview environment; never paste the real values into Git or chat.
4. Add a separate server-only `FIUU_RECONCILIATION_SECRET` of at least 32 random characters to Preview. It authenticates the inquiry-recovery endpoint and must not be reused as an OPA or portal secret.
5. Configure the Preview notification URL:
   `https://<vercel-preview-host>/api/pos/qr-payments/webhook`
6. Complete a signed sandbox transaction using channel `24` and a validity of 60–180 seconds. Verify the callback, exact-once receipt, stock movement, shift update, late/duplicate handling and settlement.
7. Exercise the authenticated BR001 recovery endpoint after QR expiry. Confirm exactly six inquiry attempts at ten-second intervals, signed identity matching, no seventh inquiry and no automatic reversal.
8. Keep every other branch on static QR/manual until BR001 passes, and request fresh confirmation immediately before any Production action.

## cloudECR/VT+ fallback actions

Do not spend the pilot window on cloudECR until the official VT+ app opens beyond its splash screen. When it does, use the prepared BR001-only adapter and run the separate terminal/POS binding, 80-second SALE, signed response, `getLast` recovery and settlement gates in the runbook.

Do not submit another DuitNow QR Offline channel request while the existing channel remains activated.

The merchant and sandbox credentials were exposed during earlier support correspondence. The Roti Kaya Junus sandbox password was reset on 2026-08-08. Production portal credentials must also be rotated before activation, and replacement credentials must never be placed in chat, screenshots or repository files.

On 2026-08-08, a detailed technical request was sent to Fiuu under Ticket `2924959` asking for the official OPA endpoints, identifier mapping, request/notification signature rules, callback acknowledgement and retries, branch/store arrangement, Extended VCode requirement and refund/reversal procedure. Keep Production in manual mode until Fiuu answers and signed sandbox UAT passes.

On 2026-08-08, the branch-scoped Vercel Preview completed official-device enrolment, STAFF login, open-shift membership and opening-stock SOP for synthetic branch `BR001`. A controlled RM2.50 sandbox pre-create request reached Fiuu but returned HTTP `404`. The Fiuu specification defines `404` as Application Code or transaction not found. RKJ One returned a safe gateway failure, created no sale, deducted no stock and left Production unchanged. This is evidence that a provider-issued OPA Application Code or OPA enablement is still required; the Merchant ID must not be substituted or guessed.

On 2026-08-17, both monitored merchant email accounts were checked and no provider response had been received after the 2026-08-08 technical request. A further escalation was sent under Ticket `2924959`, requesting confirmation of OPA enablement, the provider-issued Application Code, Store/Terminal ID arrangement, callback registration and channel/signature settings. Preview remains configured for sandbox validation only; Production remains in manual mode.

On 2026-08-21, the authenticated Production merchant portal was re-verified as `ROTI KAYA JUNUS`, portal user `ROTIKAYAJUNUS`, Merchant ID `rotikayajunus`. Verify Key and Secret Key values were not read or copied. A second controlled RM2.50 staging pre-create attempt again returned HTTP `404`; RKJ One created no sale, receipt or stock movement. Database checks confirmed authenticated users retain read-only access to online-payment rows, service-role-only fulfilment remains enforced, and the organization-scoped idempotency constraint is present. An escalation was then sent from the registered POS merchant email `isaeee94@gmail.com` to Fiuu Support and Merchant Operations for Application `121582`, requesting OPA enablement, the provider-issued sandbox Application Code, Store/Terminal mapping, signed callback contract and settlement/refund procedure. Production remains in `manual` mode pending a successful signed callback and Finance reconciliation.

Later on 2026-08-21, Fiuu replied under Ticket `2971942`. Fiuu confirmed that `rotikayajunus` has offline e-Wallet enabled and may integrate OPA, but that OPA requires a separately created Application Code and Secret Key. Fiuu requested confirmation that the sandbox account already exists before creating the Application Code for retrieval from the sandbox merchant portal. Fiuu also confirmed that Application `121582` has no submitted store information and that multiple branches require new add-on store applications. Endpoint registration is performed in Merchant Portal **Transaction Settings → Endpoints**. Fiuu describes Notification URL as the real-time server callback and Callback URL as the deferred/asynchronous callback used for QR payments; when the required acknowledgement is absent, Fiuu retries a callback up to three times at 15-minute intervals. Duplicate notifications must be handled idempotently. The exact OPA v2.1.18 Pre-Create Transaction QR HMAC canonicalisation, ACK content, refund/reversal procedure and settlement fee/reference mapping still require a focused written answer.

RKJ replied under the same ticket confirming that the dedicated Roti Kaya Junus sandbox merchant account already exists and requesting creation of the provider-issued sandbox Application Code for Application `121582`. The reply limited the first UAT to one `BR001` pilot store/device, requested the add-on store procedure, clarified that the HMAC question concerns OPA v2.1.18 Pre-Create Transaction QR channel `24`, and requested the exact ACK, refund and settlement reconciliation contract. No secret or callback protection token was transmitted by email.

## Server environment

Use Vercel server-only environment variables. `POS_FIUU_APPLICATIONS_JSON` is
required for branch and tenant isolation; global OPA fallback variables are
unsupported:

```dotenv
POS_QR_PAYMENT_MODE=fiuu
POS_FIUU_OPA_BRANCHES=BR001
POS_FIUU_ENVIRONMENT=sandbox
FIUU_RECONCILIATION_ENABLED=true
FIUU_RECONCILIATION_SECRET=<server-only-random-value-at-least-32-characters>
```

`FIUU_RECONCILIATION_ENABLED` is a dedicated default-off gate and must not be
enabled in Production before fresh approval. `FIUU_RECONCILIATION_SECRET` is
not a Fiuu credential. It protects the internal
`POST /api/internal/pos/fiuu-opa/reconcile` worker. No Production schedule is
configured by this implementation. Setting the flag and secret is not proof
that a scheduler is operating. Before UAT, capture an observed scheduler call,
authenticated worker response, bounded retry result and alert/monitor evidence
for the intended Preview environment. In Preview, call it once after
`expires_at + 10 seconds`; it processes one BR001 payment and runs a maximum of
six signed provider inquiries at ten-second intervals. Status `00` enters the
same durable exact-once fulfilment flow as a callback, `01/11` remains pending,
`99` becomes failed, and six unresolved attempts become `AWAITING_REVERSAL`.
Automatic reversal is deliberately disabled until Fiuu's
`paymentReferenceId` semantics are confirmed.

The payment-mode selector is not sufficient by itself. OPA creation is also
protected by `POS_FIUU_OPA_BRANCHES`, a complete seven-field per-branch mapping
and a positive `is_pos_fiuu_opa_branch_active` database RPC result for the same
organization, branch and full rollout configuration fingerprint. The
fingerprint covers `environment`, `applicationCode`, `storeId`, `terminalId`
and `credentialVersion`; `secretKey` is never hashed or stored in the rollout
registry. The RPC must return `true` before the API inserts a payment row,
contacts Fiuu or advertises dynamic OPA through `/api/pos/qr-config`. A missing
RPC, RPC error, `false` result or non-`ACTIVE` rollout fails closed. The package
recognizes only canonical
`BR001`-`BR036` codes, but the current authorized go-live scope remains exactly
`BR001`. Wildcards, malformed, partially mapped, cross-tenant, inactive and
unauthorized branches fail closed. `BR002`-`BR036` must not be activated until
the BR001 gates pass and a later rollout is separately approved.

The rollout lifecycle is `DRAFT -> VERIFIED -> ACTIVE -> DRAINING -> REVOKED`.
Only `ACTIVE` accepts new payment intents. `DRAINING` blocks new intents while
allowing signed callbacks, status inquiries and exact-once fulfilment for
already-issued intents. Transition `DRAINING -> REVOKED` only after the
unresolved-intent queue is empty and Finance has reconciled the related
settlements.

```json
{
  "BRANCH_CODE": {
    "organizationId": "organization-uuid",
    "branchId": "branch-uuid",
    "applicationCode": "provider-issued-code",
    "secretKey": "provider-issued-secret",
    "storeId": "provider-approved-store-id",
    "terminalId": "provider-approved-terminal-id",
    "credentialVersion": "v1"
  }
}
```

`credentialVersion` is a required non-secret label using 1–32 characters from
`A-Z`, `a-z`, `0-9`, `.`, `_` or `-`. Increment it whenever the provider
credential generation changes, without recording the secret value itself.

Do not commit the real JSON. Do not configure the deprecated global fallbacks
`POS_FIUU_APPLICATION_CODE`, `POS_FIUU_SECRET_KEY`, `POS_FIUU_STORE_ID` or
`POS_FIUU_TERMINAL_ID`; they are not a substitute for the tenant-bound mapping.
Keep `POS_QR_PAYMENT_MODE=manual` until UAT passes. Staging must use
`POS_FIUU_ENVIRONMENT=sandbox`; Production must use `production` only after
fresh action-time approval and pilot sign-off. A `POS_FIUU_PRECREATE_URL`
override must use the approved host for the selected environment; localhost is
accepted only during non-production development.

A valid signed `STATUS=00` notification is handled in two committed phases: first persist sanitized provider evidence and mark the payment `REPORTED`, then perform receipt, stock, shift and sale fulfilment idempotently. The callback and both database RPCs independently enforce the BR001 pilot identity. If the second phase fails, the durable `REPORTED` row remains and either a duplicate valid Fiuu notification or authenticated payment-status polling can retry fulfilment without issuing another charge. Fulfilment locks the referenced products and refuses a receipt if the active catalogue no longer matches the server-side pricing snapshot.

## UAT acceptance

- QR amount exactly matches the server-calculated QR portion.
- QR expires and can be regenerated without creating a sale.
- Invalid signature, amount, currency, channel, application or provider transaction ID is rejected.
- A valid callback creates exactly one sale, one receipt and the expected stock movements.
- A duplicated valid callback returns the existing receipt and creates no duplicate transaction.
- Retrying one QR creation attempt with the same idempotency key returns the same payment; changing its branch, shift, creator, amount or sale payload is rejected.
- Cross-branch users cannot view the payment or QR image.
- No sale is completed when Fiuu generation or callback fulfilment fails.
- Cash, mixed payment, discount, change, shift totals and Malaysia business date reconcile.
- Reloading or reopening the payment dialog restores the same unresolved payment and does not create a second payable QR.
- A signed callback received during the bounded expiry grace creates at most one sale; after the grace ends, a new attempt can be created without accepting the old intent.
- Missing callbacks are recovered only through the authenticated BR001 worker; unsigned, mismatched or malformed inquiry responses create no sale and release no second QR.
- Six unresolved inquiry attempts produce `AWAITING_REVERSAL`, keep the shift locked and require Finance review; there is no seventh inquiry and no automatic reversal.

## Rollout and rollback

The detailed decision table and evidence checklist are in [FIUU_BR001_UAT_RUNBOOK.md](./FIUU_BR001_UAT_RUNBOOK.md).

1. Apply the migration to staging and confirm
   `is_pos_fiuu_opa_rollout_control_ready()` returns `true`.
2. Enable Fiuu only in the Preview environment.
3. Verify the real scheduler invokes the authenticated reconciliation worker;
   environment flags alone do not close this gate.
4. Pilot one branch/device with low-value controlled payments and Finance present.
5. Reconcile Fiuu settlement, RKJ One payment, POS receipt, shift summary and inventory movement.
6. For rollback, move the branch from `ACTIVE` to `DRAINING`, set
   `POS_QR_PAYMENT_MODE=manual`, and keep recovery available. Do not delete
   payment rows, gateway references or receipts. Move to `REVOKED` only after
   every unresolved intent clears.
7. These steps govern the separate signed OPA rollout. The 2026-11-04 owner approval covers registered-device VT App-to-App only; it does not activate OPA, cloudECR, refunds or provider credential changes.

Staging migration status on 2026-08-08: all `169` repository migrations are applied and the linked schema lint reports no error. Vercel Preview contains a branch-scoped sensitive `POS_FIUU_APPLICATIONS_JSON` mapping for pilot branch `BR001` only. No Fiuu credential was added to Production.

Validation on 2026-08-26: all `171` repository migrations, including the new callback/concurrency hardening, are applied to the isolated local Supabase database and the separate `rkj-one-staging-my` Supabase project. The local index and security-definer function state were verified, and local schema lint completed with unrelated pre-existing warnings only. Staging migration history is synchronized at `171/171`; a subsequent linked schema-lint attempt was blocked by the CLI database credential and did not change the staging database. Repository tests (`31/31`), TypeScript, ESLint and the Next.js Production build pass locally. The migration has not been applied to Production. Provider-issued OPA credentials, the approved branch Store/Terminal mapping, signed sandbox callback UAT and Finance settlement reconciliation remain mandatory before enabling Production.

Validation on 2026-10-26: the BR001 OPA allowlist and durable two-phase notification implementation pass all repository tests (`116/116`), TypeScript, error-only ESLint and the Next.js Production build (`162` pages). Migrations `20261024120000_add_fiuu_cloudecr_br001_pilot.sql` and `20261026120000_durable_fiuu_opa_notification.sql` are applied to the isolated `rkj-one-staging-my` Supabase project, and linked migration history is synchronized through `20261026120000`. Linked schema lint completes with unrelated pre-existing warnings only and reports no issue in the new Fiuu functions. A fresh local replay could not be run because the Docker engine was unavailable. Neither migration has been applied to Production, and no Production environment, credential, provider or outlet setting was changed.

Validation on 2026-10-27: the standard VT BR001 server/database hard lock passes all repository tests (`168/168`), TypeScript, ESLint and the Next.js Production build (`163` pages). Migration `20261027120000_harden_fiuu_vt_br001_pilot.sql` is applied only to the isolated `rkj-one-staging-my` project; linked migration history is synchronized and error-level schema lint is clean. Production remains unchanged. The physical VT application is installed but deliberately remains unactivated until Fiuu supplies or confirms activation material mapped to `masterkayajunus01`, the intended BR001 terminal and BR001 settlement.

Validation on 2026-10-28: the official VT app is available on the BR001 Samsung and has entered the provider payment flow. The first physical attempt exposed a documented error-only callback shape (`errorCode` and `errorMsg`) that was not a transaction result and therefore did not create a sale, receipt or stock movement. The BR001 bridge and client now handle that callback separately, preserve the durable pending attempt, reconcile through the authenticated RKJ status endpoint and present a bounded-expiry warning without treating the error as payment success. All repository tests (`184/184`), TypeScript, targeted ESLint, the Next.js Production build (`163` pages) and Android Java compilation pass locally. This is Preview-only code validation; the updated APK still requires physical BR001 installation and UAT. Production, Production credentials and BR002-BR036 remain unchanged.

Validation on 2026-11-04: one controlled physical BR001 Fiuu VT App-to-App payment for RM3.50 completed successfully in the isolated Preview/staging environment. RKJ One recorded the payment as `PAID` and its transaction as `COMPLETED`, created exactly one receipt, produced four expected stock-deduction records and four stock-movement records, updated the active-shift QR aggregate once, and left no unresolved `PENDING` or `REPORTED` attempt. A matching Fiuu payment-success email was observed and the physical receipt printed successfully. Identifiers, gateway references, QR payloads and credentials are deliberately omitted. This proves the BR001 VT App-to-App operational flow only; it is not evidence of a signed OPA notification or provider settlement. Finance must still match this RM3.50 transaction to a new Fiuu settlement report and corresponding bank credit. Production remains in `POS_QR_PAYMENT_MODE=manual`, and BR002-BR036 remain inactive.

## Play Store

The Android application is a Capacitor shell that loads `https://rkj.one`. This server-side integration does not by itself require a new Play Store bundle. A new AAB is required only if native code, permissions, package metadata, signing, target SDK or Capacitor configuration changes.
