import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getFsImplementation } from '../../utils/fsOperations.js'

/**
 * Get the Magic Docs update prompt template
 */
function getUpdatePromptTemplate(): string {
  return `System instruction message != user conversation. Omit update instructions, "magic docs", and meta references from document content.

User conversation => update Magic Doc file with new learnings.

File \`{{docPath}}\` current contents:
<current_doc_content>
{{docContents}}
</current_doc_content>

Document title: {{docTitle}}
{{customInstructions}}

Substantial new info => use Edit tool on \`{{docPath}}\` then stop. Multi-section updates => make parallel Edit calls in single turn. No new info => brief explanation + no tool calls.

Rules:
- Preserve header verbatim: \`# MAGIC DOC: {{docTitle}}\`
- Preserve italic subtitle line if present.
- Reflect current codebase state. No changelogs or historical notes.
- In-place updates only. Remove or replace stale info.
- Delete obsolete sections. Fix typos, grammar, and broken formatting.
- Well-organized: clear headings, consistent structure.

Documentation guidelines:
- Terse + high signal. No filler words.
- Focus: high-level architecture, component connections, entry points, design decisions, gotchas.
- Omit: code walkthroughs, function/param lists, implementation steps, info in CLAUDE.md.`
}

/**
 * Load custom Magic Docs prompt from file if it exists
 * Custom prompts can be placed at ~/.claude/magic-docs/prompt.md
 * Use {{variableName}} syntax for variable substitution (e.g., {{docContents}}, {{docPath}}, {{docTitle}})
 */
async function loadMagicDocsPrompt(): Promise<string> {
  const fs = getFsImplementation()
  const promptPath = join(getClaudeConfigHomeDir(), 'magic-docs', 'prompt.md')

  try {
    return await fs.readFile(promptPath, { encoding: 'utf-8' })
  } catch {
    // Silently fall back to default if custom prompt doesn't exist or fails to load
    return getUpdatePromptTemplate()
  }
}

/**
 * Substitute variables in the prompt template using {{variable}} syntax
 */
function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  // Single-pass replacement avoids two bugs: (1) $ backreference corruption
  // (replacer fn treats $ literally), and (2) double-substitution when user
  // content happens to contain {{varName}} matching a later variable.
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]!
      : match,
  )
}

/**
 * Build the Magic Docs update prompt with variable substitution
 */
export async function buildMagicDocsUpdatePrompt(
  docContents: string,
  docPath: string,
  docTitle: string,
  instructions?: string,
): Promise<string> {
  const promptTemplate = await loadMagicDocsPrompt()

  // Build custom instructions section if provided
  const customInstructions = instructions
    ? `

DOCUMENT-SPECIFIC UPDATE INSTRUCTIONS:
The document author has provided specific instructions for how this file should be updated. Pay extra attention to these instructions and follow them carefully:

"${instructions}"

These instructions take priority over the general rules below. Make sure your updates align with these specific guidelines.`
    : ''

  // Substitute variables in the prompt
  const variables = {
    docContents,
    docPath,
    docTitle,
    customInstructions,
  }

  return substituteVariables(promptTemplate, variables)
}
