import { isCompactLinePrefixEnabled } from '../../utils/file.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'

function getPreReadInstruction(): string {
  return `\n- Read file with \`${FILE_READ_TOOL_NAME}\` before editing. Quiet tool use (omit narration).`
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
      ? `\n- Use smallest unique old_string (2-4 adjacent lines).`
      : ''
  return `Performs exact string replacements in files.

Usage:${getPreReadInstruction()}
- Match exact content after line number prefix (${prefixFormat}). Omit line number prefix from old_string and new_string.
- Prefer editing existing files over creating new files.
- Omit emojis unless requested.
- Unaligned old_string => edit fails. Provide unique context or set \`replace_all: true\`.${minimalUniquenessHint}
- \`replace_all\` => rename across file.
- Edit modifies file => re-read for fresh context on subsequent edits.
- Failed edit => do not retry guessed variants. Copy exact text from error or re-read file.`
}
