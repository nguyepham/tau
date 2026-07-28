/**
 * OpenAI-Compatible Lane — System Prompt
 *
 * Shorter, cleaner prompt for models that don't have a native CLI
 * to match. Works well with DeepSeek, Groq, NIM, Ollama, OpenRouter,
 * Mistral, and the long tail of OpenAI-format models.
 *
 * Local models (Ollama, LM Studio) get an even shorter variant to
 * avoid overwhelming small context windows.
 */

import type { SystemPromptParts } from '../types.js'

export function assembleOpenAICompatPrompt(
  model: string,
  parts: SystemPromptParts,
  isLocal: boolean,
): { stable: string; volatile: string; full: string } {

  const stableSections: string[] = isLocal
    ? [
        // Shorter prompt for local models with limited context
        `Coding assistant. Help user with programming tasks. Use tools for files, code, search, shell. Be concise. Diagnose failures (exit code, error) before retrying. Check \`--help\` before guessing flags.`,
      ]
    : [
        `Expert software engineer. Use tools for file read/write, code search, shell, web search.`,

        `## Approach
1. Read code before editing.
2. Targeted minimal edits.
3. Verify changes.
4. No unsolicited features or refactoring.`,

        `## Rules
- Read file before editing.
- No comments/docstrings on unchanged code.
- No single-use abstractions.
- Unsure => ask user.
- Tool failure => diagnose (exit code, error output) before retrying. Max 1 focused retry attempt. Stop after 2 failures.
- Unfamiliar CLIs/APIs => check \`--help\` or docs once.`,
      ]

  if (parts.customInstructions) {
    stableSections.push(`## Instructions\n\n${parts.customInstructions}`)
  }
  if (parts.toolsAddendum) {
    stableSections.push(parts.toolsAddendum)
  }
  if (parts.mcpIntro) {
    stableSections.push(`## MCP Tools\n\n${parts.mcpIntro}`)
  }

  const stable = stableSections.join('\n\n')

  const volatileSections: string[] = []
  if (parts.memory) volatileSections.push(parts.memory)
  if (parts.environment) volatileSections.push(parts.environment)
  if (parts.gitStatus && !isLocal) volatileSections.push(`Git status:\n${parts.gitStatus}`)

  const volatile = volatileSections.join('\n\n')
  const full = volatile ? `${stable}\n\n${volatile}` : stable
  return { stable, volatile, full }
}
