import { isPDFSupported } from '../../utils/pdfUtils.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'

// Name lives in constants.ts (leaf); re-exported here so existing importers
// keep working without pulling this module's pdfUtils/runtime imports.
export { FILE_READ_TOOL_NAME } from './constants.js'

export const FILE_UNCHANGED_STUB =
  'File unchanged since last read. The content from the earlier Read tool_result in this conversation is still current — refer to that instead of re-reading.'

export const MAX_LINES_TO_READ = 2000

export const DESCRIPTION = 'Read a file from the local filesystem.'

export const LINE_FORMAT_INSTRUCTION =
  '- Results are returned using cat -n format, with line numbers starting at 1'

export const OFFSET_INSTRUCTION_DEFAULT =
  "- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters"

export const OFFSET_INSTRUCTION_TARGETED =
  '- When you already know which part of the file you need, only read that part. This can be important for larger files.'

/**
 * Renders the Read tool prompt template.  The caller (FileReadTool) supplies
 * the runtime-computed parts.
 */
export function renderPromptTemplate(
  lineFormat: string,
  maxSizeInstruction: string,
  offsetInstruction: string,
): string {
  return `Read a file from local filesystem. Access any file directly.
Assume tool can read all files on machine. If user provides path, assume valid. Reading non-existent file returns error.

Usage:
- file_path must be absolute path, not relative
- By default reads up to ${MAX_LINES_TO_READ} lines from beginning${maxSizeInstruction}
${offsetInstruction}
${lineFormat}
- Can read images (PNG, JPG, etc). Image contents presented visually.${
    isPDFSupported()
      ? '\n- Can read PDF files. For large PDFs (>10 pages), MUST provide pages parameter for specific ranges (e.g., pages: "1-5"). Max 20 pages per request.'
      : ''
  }
- LARGE code files auto-skeleton: whole-file Read (no offset/limit) of supported code file (ts/js/py/go/rs/java/rb/cs/c/cpp/php and variants) above ~16KB returns STRUCTURE — imports, signatures, class shapes with long function bodies elided. Each elision marker shows offset/limit Read to expand body. Line numbers are real file line numbers. Read specific ranges for bodies, pass skeleton: false for full content, skeleton: true to force skeleton. Unsupported files always return normal read. Editing requires full-content Read of relevant range first.
- Can read Jupyter notebooks (.ipynb) — returns all cells with outputs, combining code, text, visualizations.
- Can only read files, not directories. Use ls via ${BASH_TOOL_NAME} for directories.
- When user provides screenshot path, ALWAYS use this tool to view file.
- If file exists but empty, receives system reminder warning instead of contents.`
}
