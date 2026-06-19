export const ANTIGRAVITY_API_VERSION = '2.0.0'
// Primary generation channel. The non-sandbox daily endpoint is what the
// Antigravity client actually ships against (and what CLIProxyAPI/9router
// route to first — CLIProxyAPI has the sandbox host commented out
// entirely). The sandbox channel accepts the same envelope but its
// implicit prompt cache measured flaky partial-prefix reads, so it is
// kept only as a last-resort 404 fallback.
export const ANTIGRAVITY_ENDPOINT_DAILY = 'https://daily-cloudcode-pa.googleapis.com'
export const ANTIGRAVITY_ENDPOINT_DAILY_SANDBOX = 'https://daily-cloudcode-pa.sandbox.googleapis.com'
export const ANTIGRAVITY_ENDPOINT_AUTOPUSH = 'https://autopush-cloudcode-pa.sandbox.googleapis.com'
export const ANTIGRAVITY_ENDPOINT_PROD = 'https://cloudcode-pa.googleapis.com'
