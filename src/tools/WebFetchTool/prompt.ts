export const WEB_FETCH_TOOL_NAME = 'WebFetch'

export const DESCRIPTION = `
- Fetches content from a URL and processes it via an AI model
- Takes a URL and a prompt as input
- Fetches URL content, converts HTML to markdown
- Processes content with the prompt using a small, fast model
- Returns the model's response about the content
- Use this tool to retrieve and analyze web content

Usage notes:
  - IMPORTANT: If an MCP-provided web fetch tool is available, prefer that tool — it may have fewer restrictions.
  - URL must be fully-formed valid URL
  - HTTP URLs auto-upgrade to HTTPS
  - Prompt should describe what info to extract from the page
  - Read-only, does not modify files
  - Results may be summarized if content is very large
  - Includes a self-cleaning 15-min cache for repeated same-URL access
  - URL redirects to a different host => tool informs you + provides redirect URL. Make a new WebFetch request with the redirect URL.
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
