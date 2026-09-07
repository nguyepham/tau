# Antigravity Report Retry and Host-Failover Behavior

The Antigravity report path uses an outer host-sweep budget derived from the number of configured generation hosts. Gemini models allow up to six outer attempts by default, while Claude models allow up to nine; custom endpoints reduce both to three attempts. Nested retry layers add further retries for quota, transport, and selected service errors.

## Outer Sweep Budget

The report command delegates to `runAntigravityReportWithHostSweep` when `usesAntigravityReportPath` is true (`src/commands/report/report.ts:329`). The sweep behavior is defined in `src/commands/report/antigravityReport.ts`:

- `SWEEP_BACKOFF_MS = [0, 2_000, 6_000]` defines three sweep passes (`:62`).
- `antigravityReportAttemptBudget = hostCount * 3` calculates the total outer attempt budget (`:71`).
- `antigravityReportAttemptDelayMs` applies backoff between completed host sweeps (`:80`).
- `runAntigravityReportWithHostSweep` continues through the budget when quota failures return HTTP 429 (`:114`).

The resulting outer limits are:

- Gemini models with two hosts: six attempts, or five retries.
- Claude models with three hosts: nine attempts, or eight retries.
- Custom endpoints with one host: three attempts, or two retries.
- Gemini sandbox configuration with three hosts: nine attempts, or eight retries.

## Host Topology and Resolution

Host ordering and count are resolved in `src/services/api/providers/gemini_code_assist.ts`:

- Gemini Antigravity uses `prod` and `daily` by default (`:128`).
- Setting `TAU_ANTIGRAVITY_GEMINI_ENDPOINT=sandbox` adds the `sandbox` host, producing three candidates.
- A custom URL reduces the topology to one host.
- Claude Antigravity uses `daily`, `prod`, and `sandbox` by default (`:92`).
- `antigravityGenerationHostCount` resolves the effective count as two for Gemini models and three for Claude models (`:419`).

Within an individual Gemini request, the transport layer can visit alternate candidate hosts before returning an error (`src/lanes/gemini/api.ts:544`). A host that returns HTTP 429 receives a 60-second cooldown, causing the next outer attempt to deprioritize it (`:591`).

## Nested Retry Layers

Several retry mechanisms operate inside each outer sweep attempt.

### Quota and service retries

`withRetry` registers the `report` source for HTTP 529 retries (`src/services/api/withRetry.ts:71`). Third-party HTTP 429 quota errors are capped at two attempts, meaning one additional retry within each outer sweep attempt (`:438`).

For errors that are not handled by the quota-specific limit, the default non-429 retry ceiling is 10 attempts (`:880`).

### Gemini transport retries

The Gemini lane defines `ANTIGRAVITY_GEMINI_MAX_RETRY_ATTEMPTS = 2`, allowing one transport retry per attempt (`src/lanes/gemini/api.ts:189`). Endpoint hopping may occur during this process before the error reaches the outer sweep.

## Quota Failure Classification

The report presentation layer determines whether an error is a retryable provider quota failure. `isProviderQuotaFailure` uses regular-expression matching to validate these errors (`src/commands/report/presentation.ts:106`).

Only failures recognized as retryable quota errors drive the outer host-sweep loop. Other failures follow the applicable inner retry and error-handling paths.

## Remaining Calculation Constraint

A total theoretical retry count across the nested layers cannot be stated from the available bounds alone. Such a calculation would assume that every layer fully exhausts its retries before host failover, including endpoint hopping and repeated quota failures.
