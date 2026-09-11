# Antigravity `/report` Fails on a Separate Generation Request

The `/report` command reaches Antigravity successfully, but its dedicated generation request returns HTTP 429 across all eligible hosts. Other commands continue to work, and `/usage` may show available quota because it reports model-level availability rather than generation-host limits or model entitlement.

## Request and Failure Path

- `src/commands/report/report.ts:368` inherits the active `mainLoopModel`.
- `src/commands/report/report.ts:369` identifies the request with `querySource: 'report'`.
- `src/commands/report/report.ts:370` sends a tool-free generation request.
- `src/commands/report/report.ts:333` routes Antigravity models through a dedicated host-sweep path.
- `src/commands/report/antigravityReport.ts:129` rethrows the final HTTP 429 after every eligible host attempt fails.

The provider failure is handled as follows:

- `src/lanes/gemini/api.ts:591` receives HTTP 429 from the Antigravity generation endpoint.
- `src/lanes/gemini/api.ts:592` records the failing host as exhausted.
- `src/lanes/gemini/api.ts:1146` converts the response to `Gemini API error 429`.
- `src/services/api/withRetry.ts:438` applies the capped retry budget for third-party 429 responses.
- `src/services/api/errors.ts:964` surfaces the final result as `API Error: ...`.

## Error Presentation

The report command does not treat the API error as generated report content:

- `src/commands/report/presentation.ts:118` rejects API-error responses as report output.
- `src/commands/report/presentation.ts:140` classifies any HTTP 429 as an upstream quota refusal.

## Why `/usage` Can Still Show Available Quota

The `/usage` result does not cover every limit involved in Antigravity generation:

- `src/services/api/antigravityUsageParser.ts:124` reads account- or model-level `quotaInfo.remainingFraction`.
- `src/services/api/providerUsage.ts:697` does not include per-host generation limits.
- `src/services/api/providers/gemini_code_assist.ts:647` indicates that missing model entitlement can also appear as a quota-like HTTP 429.

Healthy `/usage` values therefore do not rule out host-specific rate limiting or lack of entitlement for the model used by `/report`.

## Conclusion and Remaining Evidence

The confirmed cause is that Antigravity rejects `/report`’s separate generation call and every eligible host attempt fails with HTTP 429. The precise upstream reason remains unconfirmed: it may be per-host rate limiting or report-model entitlement.

Determining which condition applies requires the raw 429 response JSON and the names of the contacted hosts.
