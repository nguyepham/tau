import { z } from 'zod/v4'

import {
  type FileDiff,
  listSnapshots,
  revertSnapshot,
  snapshotDiff,
  type SnapshotEntry,
  trackSnapshot,
} from '../../services/snapshot/snapshot.js'
import type { Tool } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { getCwd } from '../../utils/cwd.js'
import { lazySchema } from '../../utils/lazySchema.js'

import {
  DESCRIPTION,
  SNAPSHOT_TOOL_NAME,
  SNAPSHOT_TOOL_PROMPT,
} from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z
      .enum(['save', 'list', 'diff', 'restore'])
      .describe(
        '"save" creates a snapshot; "list" returns recent snapshots; "diff" returns per-file changes between the current working tree and a snapshot; "restore" rolls the working tree back to a snapshot.',
      ),
    hash: z
      .string()
      .optional()
      .describe(
        'Required for "diff" and "restore". Full or unambiguous prefix of a snapshot hash.',
      ),
    label: z
      .string()
      .optional()
      .describe('Optional short description for the snapshot (save only).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Max entries for "list" (default 20, max 500).'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const fileDiffSchema = lazySchema(() =>
  z.object({
    file: z.string(),
    status: z.enum(['added', 'deleted', 'modified']),
    binary: z.boolean(),
    additions: z.number(),
    deletions: z.number(),
    patch: z.string(),
    truncated: z.boolean().optional(),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['save', 'list', 'diff', 'restore']),
    ok: z.boolean(),
    summary: z.string(),
    hash: z.string().optional(),
    entries: z
      .array(
        z.object({
          hash: z.string(),
          date: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
    files: z.array(fileDiffSchema()).optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

function entriesToText(entries: SnapshotEntry[]): string {
  if (entries.length === 0) return 'No snapshots.'
  return entries
    .map(e => `${e.hash.slice(0, 12)}  ${e.date}  ${e.message}`)
    .join('\n')
}

function statusGlyph(status: FileDiff['status']): string {
  return status === 'added' ? 'A' : status === 'deleted' ? 'D' : 'M'
}

function filesToText(files: FileDiff[]): string {
  if (files.length === 0) {
    return 'No differences between the working tree and this snapshot.'
  }
  const lines: string[] = []
  lines.push(
    `${files.length} file${files.length === 1 ? '' : 's'} differ from the snapshot:`,
  )
  for (const f of files) {
    const stats = f.binary ? '(binary)' : `+${f.additions} -${f.deletions}`
    lines.push(`  ${statusGlyph(f.status)}  ${f.file}  ${stats}`)
  }
  lines.push('')
  for (const f of files) {
    lines.push(`--- ${f.file} (${f.status})`)
    if (f.binary) {
      lines.push('(binary file — no patch)')
    } else if (f.patch.trim() === '') {
      lines.push('(empty diff)')
    } else {
      lines.push(f.patch)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

export const SnapshotTool: Tool<InputSchema, Output> = buildTool({
  name: SNAPSHOT_TOOL_NAME,
  searchHint: 'save and restore working-tree snapshots',
  maxResultSizeChars: 500_000,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return SNAPSHOT_TOOL_PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName(input) {
    switch (input?.action) {
      case 'save':
        return 'Saving snapshot'
      case 'list':
        return 'Listing snapshots'
      case 'diff':
        return 'Showing snapshot diff'
      case 'restore':
        return 'Restoring snapshot'
      default:
        return 'Snapshot'
    }
  },
  isReadOnly(input) {
    return input?.action !== 'restore'
  },
  isConcurrencySafe(input) {
    return input?.action !== 'restore'
  },
  isDestructive(input) {
    return input?.action === 'restore'
  },
  toAutoClassifierInput(input) {
    if (input.action === 'restore' || input.action === 'diff') {
      return `${input.action} ${input.hash ?? ''}`.trim()
    }
    return input.action
  },
  async validateInput(input) {
    if (
      (input.action === 'diff' || input.action === 'restore') &&
      !input.hash?.trim()
    ) {
      return {
        result: false,
        message: `${input.action} requires "hash"`,
        errorCode: 1,
      }
    }
    return { result: true }
  },
  renderToolUseMessage,
  renderToolResultMessage,
  async call(input) {
    const cwd = getCwd()
    switch (input.action) {
      case 'save': {
        const r = await trackSnapshot(cwd, input.label)
        return {
          data: r.ok
            ? {
                action: 'save' as const,
                ok: true,
                summary: r.message,
                hash: r.hash,
              }
            : { action: 'save' as const, ok: false, summary: r.message },
        }
      }
      case 'list': {
        const entries = await listSnapshots(cwd, input.limit ?? 20)
        return {
          data: {
            action: 'list' as const,
            ok: true,
            summary: `${entries.length} snapshot${entries.length === 1 ? '' : 's'}`,
            entries,
          },
        }
      }
      case 'diff': {
        const files = await snapshotDiff(cwd, input.hash ?? '')
        const summary =
          files.length === 0
            ? `no changes vs ${(input.hash ?? '').slice(0, 8)}`
            : `${files.length} file${files.length === 1 ? '' : 's'} differ from ${(input.hash ?? '').slice(0, 8)}`
        return {
          data: {
            action: 'diff' as const,
            ok: true,
            summary,
            files,
          },
        }
      }
      case 'restore': {
        const r = await revertSnapshot(cwd, input.hash ?? '')
        return {
          data: r.ok
            ? {
                action: 'restore' as const,
                ok: true,
                summary: r.message,
                hash: r.hash,
              }
            : { action: 'restore' as const, ok: false, summary: r.message },
        }
      }
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    let content: string
    if (output.action === 'list') {
      content = entriesToText(output.entries ?? [])
    } else if (output.action === 'diff') {
      content = filesToText(output.files ?? [])
    } else {
      content = output.summary
      if (output.ok && output.hash) {
        content += `\nhash: ${output.hash}`
      }
    }
    return {
      type: 'tool_result',
      content,
      tool_use_id: toolUseID,
      is_error: !output.ok ? true : undefined,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
