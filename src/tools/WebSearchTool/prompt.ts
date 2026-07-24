import { getLocalMonthYear } from 'src/constants/common.js'

export const WEB_SEARCH_TOOL_NAME = 'WebSearch'

export const WEB_SEARCH_AUTO_USE_GUIDANCE =
  'Use WebSearch automatically, without waiting for "websearch", when request depends on current/live/recent/changing public web info. Includes weather today/now, news, events, prices, exchange rates, sports scores, schedules, availability, laws/regulations, product details, recent releases, latest docs, status pages, facts likely changed after knowledge cutoff. Search with best reasonable interpretation + state assumption rather than asking user to search manually.'

export const WEB_SEARCH_NATIVE_DESCRIPTION =
  'Search web for current/live/recent/changing public info, return answerable results with source URLs. Use automatically for weather today/now, news, prices, exchange rates, sports, schedules, availability, laws/regulations, product details, recent releases, latest docs, facts likely changed after knowledge cutoff. Do not tell user to search manually when this tool can answer.'

export function getWebSearchPrompt(): string {
  const currentMonthYear = getLocalMonthYear()
  return `
- Search web, use results to inform responses
- Up-to-date info for current events + recent data
- Returns search results with markdown hyperlinks
- Access info beyond model knowledge cutoff
- Searches performed automatically in single API call

Automatic use policy:
  - ${WEB_SEARCH_AUTO_USE_GUIDANCE}
  - Do not answer "I cannot access live information" or give manual search instructions when WebSearch available. Call WebSearch first, answer from results.
  - Do not use for stable general knowledge, local codebase/file questions, private account data, or questions user explicitly says not to search.

CRITICAL REQUIREMENT:
  - MUST include "Sources:" section at end of response
  - List relevant URLs as markdown hyperlinks: [Title](URL)
  - MANDATORY — never skip sources
  - Example:

    [Answer]

    Sources:
    - [Source Title 1](https://example.com/1)
    - [Source Title 2](https://example.com/2)

Usage notes:
  - Provider-neutral. Always call with documented input schema; do not pass provider-specific or Firecrawl fields.
  - Search results may include page excerpts. Answer directly from excerpts + cite URLs; do not return only links.
  - Domain filtering supported to include or block specific websites
  - Domain filters must be plain hostnames only, e.g. "example.com" or "docs.example.com", not URLs/paths/wildcards
  - Web search only available in US

IMPORTANT - Use correct year in search queries:
  - Current month: ${currentMonthYear}. MUST use this year for recent info, docs, or current events.
  - Example: "latest React docs" → search "React documentation" with current year, NOT last year
`
}
