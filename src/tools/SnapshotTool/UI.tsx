import * as React from 'react'

import { Box, Text } from '../../ink.js'
import type { Output } from './SnapshotTool.js'

const TUI_MAX_FILES = 50

export function renderToolUseMessage(input: {
  action?: string
  hash?: string
  label?: string
}): React.ReactNode {
  const parts: string[] = []
  if (input.action) parts.push(input.action)
  if (input.hash) parts.push(input.hash.slice(0, 8))
  if (input.label) parts.push(`"${input.label}"`)
  return parts.join(' ')
}

function statusGlyph(status: 'added' | 'deleted' | 'modified'): string {
  return status === 'added' ? '+' : status === 'deleted' ? '-' : 'M'
}

function statusColor(
  status: 'added' | 'deleted' | 'modified',
): 'success' | 'error' | 'warning' {
  return status === 'added'
    ? 'success'
    : status === 'deleted'
      ? 'error'
      : 'warning'
}

export function renderToolResultMessage(output: Output): React.ReactNode {
  if (output.action === 'list') {
    if (!output.entries || output.entries.length === 0) {
      return <Text color="inactive">No snapshots</Text>
    }
    return (
      <Box flexDirection="column">
        {output.entries.map(e => (
          <Text key={e.hash}>
            {e.hash.slice(0, 8)}  {e.date}  {e.message}
          </Text>
        ))}
      </Box>
    )
  }
  if (output.action === 'diff') {
    const files = output.files ?? []
    if (files.length === 0) {
      return (
        <Text color="inactive">No differences vs the snapshot</Text>
      )
    }
    const shown = files.slice(0, TUI_MAX_FILES)
    const hidden = files.length - shown.length
    return (
      <Box flexDirection="column">
        <Text>
          {files.length} file{files.length === 1 ? '' : 's'} differ from the
          snapshot
        </Text>
        {shown.map(f => (
          <Text key={f.file} color={statusColor(f.status)}>
            {statusGlyph(f.status)}  {f.file}
            {'  '}
            {f.binary ? '(binary)' : `+${f.additions} -${f.deletions}`}
            {f.truncated ? '  [diff elided]' : ''}
          </Text>
        ))}
        {hidden > 0 ? (
          <Text color="inactive">
            ... {hidden} more file{hidden === 1 ? '' : 's'} not listed
            (full per-file patches sent to the model).
          </Text>
        ) : (
          <Text color="inactive">
            (Full per-file patches sent to the model.)
          </Text>
        )}
      </Box>
    )
  }
  return <Text color={output.ok ? 'success' : 'error'}>{output.summary}</Text>
}
