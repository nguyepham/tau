import { isCompactLinePrefixEnabled } from '../../utils/file.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'

function getPreReadInstruction(): string {
  return `\n- ALWAYS read file with \`${FILE_READ_TOOL_NAME}\` before editing — read first, every time. \`old_string\` must match file's exact current contents character-for-character; edit without reading usually fails (or stale). Never edit file not just read. Read quietly; do not send "let me read" narration.`
}

export function getEditToolDescription(): string {
  return getDefaultEditDescription()
}

function getDefaultEditDescription(): string {
  const prefixFormat = isCompactLinePrefixEnabled()
    ? 'line number + tab'
    : 'spaces + line number + arrow'
  const minimalUniquenessHint =
    process.env.USER_TYPE === 'ant'
      ? `\n- Use smallest old_string that's clearly unique — 2-4 adjacent lines usually sufficient. Avoid 10+ lines of context when less uniquely identifies target.`
      : ''
  return `Performs exact string replacements in files.

Usage:${getPreReadInstruction()}
- When editing from Read tool output, preserve exact indentation (tabs/spaces) as it appears AFTER line number prefix. Line number prefix format: ${prefixFormat}. Everything after that is actual file content to match. Never include line number prefix in old_string or new_string.
- ALWAYS prefer editing existing files. NEVER write new files unless explicitly required.
- Only use emojis if user explicitly requests.
- Edit FAILS if \`old_string\` not unique. Provide larger string with more context or use \`replace_all\` to change every instance.${minimalUniquenessHint}
- Use \`replace_all\` for replacing/renaming strings across file. Useful for variable renames.
- Every edit CHANGES file: old_string from earlier read goes stale when edit touches that region. Success result shows updated region — treat those lines as ONLY source of truth for follow-up old_string. Re-read when uncertain.
- If edit fails with "String to replace not found", do NOT retry guessed variants. Error shows file's current content or closest-matching region — copy old_string exactly from there (or Read again). If already applied, move on; do not re-issue.`
}
