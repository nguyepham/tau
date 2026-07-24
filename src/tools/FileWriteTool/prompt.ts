import { FILE_READ_TOOL_NAME } from '../FileReadTool/constants.js'

// Name lives in constants.ts (leaf); re-exported here so existing importers
// keep working without pulling this module's FileReadTool/prompt chain.
export { FILE_WRITE_TOOL_NAME } from './constants.js'
export const DESCRIPTION = 'Write a file to the local filesystem.'

function getPreReadInstruction(): string {
  return `\n- ALWAYS read existing file with ${FILE_READ_TOOL_NAME} before overwriting — read first, every time. \`Write\` replaces ENTIRE file; overwriting unread file risks destroying contents, tool refuses until read. Read quietly; do not send "let me read" narration. To change part of file, use Edit tool instead (reads + edits in place).`
}

export function getWriteToolDescription(): string {
  return `Write a file to local filesystem.

Usage:
- Overwrites existing file at provided path.${getPreReadInstruction()}
- Prefer Edit tool for modifying existing files — sends only diff. Use Write only for new files or complete rewrites.
- NEVER create *.md or README files unless explicitly requested.
- Only use emojis if user explicitly requests.`
}
