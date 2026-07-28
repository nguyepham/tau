import { FILE_READ_TOOL_NAME } from '../FileReadTool/constants.js'

// Name lives in constants.ts (leaf); re-exported here so existing importers
// keep working without pulling this module's FileReadTool/prompt chain.
export { FILE_WRITE_TOOL_NAME } from './constants.js'
export const DESCRIPTION = 'Write a file to the local filesystem.'

function getPreReadInstruction(): string {
  return `\n- Read existing file with ${FILE_READ_TOOL_NAME} before overwriting. Quiet tool use (omit narration).`
}

export function getWriteToolDescription(): string {
  return `Writes file to local filesystem.

Usage:
- Overwrites file at target path.${getPreReadInstruction()}
- Prefer Edit tool for partial modifications. Use Write for new files or full rewrites.
- Documentation/README files forbidden without explicit ask.
- Omit emojis unless requested.`
}
