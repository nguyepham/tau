import { TICK_TAG } from '../../constants/xml.js'

export const SLEEP_TOOL_NAME = 'Sleep'

export const DESCRIPTION = 'Wait for a specified duration'

export const SLEEP_TOOL_PROMPT = `Wait for specified duration. User interruptible.

Use when user asks to sleep/rest, no pending tasks, or waiting.

Periodic check-ins via <${TICK_TAG}> tag => inspect for useful work before sleeping.

Concurrent execution supported. Prefer over \`Bash(sleep ...)\`.`
