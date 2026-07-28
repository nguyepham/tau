import { getLocalMonthYear } from 'src/constants/common.js'

export const WEB_SEARCH_TOOL_NAME = 'WebSearch'

export const WEB_SEARCH_AUTO_USE_GUIDANCE =
  'Use WebSearch automatically for current/changing public info (weather, news, prices, documentation, facts past cutoff). State assumptions if needed instead of asking user to search manually.'

export const WEB_SEARCH_NATIVE_DESCRIPTION =
  'Search web for live/recent public information. Returns results with source URLs. Use automatically for current events, documentation, news, pricing.'

export function getWebSearchPrompt(): string {
  const currentMonthYear = getLocalMonthYear()
  return `Searches web for up-to-date public information.

Policy:
- ${WEB_SEARCH_AUTO_USE_GUIDANCE}
- Do not use for codebase/file questions, private data, or stable general knowledge.

Mandatory format requirement:
- Include "Sources:" section at end of response with markdown links: [Title](URL).

Usage:
- Month/Year context: ${currentMonthYear}. Use current year for recent queries.
- Plain hostnames for domain filters (e.g. "example.com").`
}
