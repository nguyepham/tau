import { TICK_TAG } from '../../constants/xml.js'

export const SLEEP_TOOL_NAME = 'Sleep'

export const DESCRIPTION = 'Wait for a specified duration'

export const SLEEP_TOOL_PROMPT = `Wait for specified duration. User can interrupt at any time.

Use when user tells you to sleep/rest, when nothing to do, or waiting for something.

May receive <${TICK_TAG}> prompts — periodic check-ins. Do useful work before sleeping.

Can call concurrently with other tools — won't interfere.

Prefer over \`Bash(sleep ...)\` — doesn't hold shell process.

Each wake-up costs API call, but prompt cache expires after 5 min inactivity — balance accordingly.`
