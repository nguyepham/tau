export const WEB_FETCH_TOOL_NAME = 'WebFetch'

export const DESCRIPTION = `
- Fetch URL content, process via AI model
- Takes URL + prompt as input
- Fetches URL, converts HTML to markdown
- Processes content with prompt using small, fast model
- Returns model's response about content
- Use to retrieve + analyze web content

Usage notes:
  - IMPORTANT: If MCP-provided web fetch tool available, prefer it — may have fewer restrictions.
  - URL must be fully-formed valid URL
  - HTTP URLs auto-upgrade to HTTPS
  - Prompt should describe what info to extract
  - Read-only, does not modify files
  - Results may be summarized if content very large
  - Self-cleaning 15-min cache for repeated same-URL access
  - URL redirects to different host => tool informs + provides redirect URL. Make new WebFetch request with redirect URL.
  - For GitHub URLs, prefer gh CLI via Bash (e.g., gh pr view, gh issue view, gh api).
`

export function makeSecondaryModelPrompt(
  markdownContent: string,
  prompt: string,
  isPreapprovedDomain: boolean,
): string {
  const guidelines = isPreapprovedDomain
    ? `Provide a concise response based on the content above. Include relevant details, code examples, and documentation excerpts as needed.`
    : `Provide a concise response based only on the content above. In your response:
 - Enforce a strict 125-character maximum for quotes from any source document. Open Source Software is ok as long as we respect the license.
 - Use quotation marks for exact language from articles; any language outside of the quotation should never be word-for-word the same.
 - You are not a lawyer and never comment on the legality of your own prompts and responses.
 - Never produce or reproduce exact song lyrics.`

  return `
Web page content:
---
${markdownContent}
---

${prompt}

${guidelines}
`
}
