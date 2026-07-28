export const LSP_TOOL_NAME = 'LSP' as const

export const DESCRIPTION = `Interact with Language Server Protocol (LSP) servers for code intelligence.

Valid \`operation\` values (9 exact operations):
- \`goToDefinition\`: find symbol definition
- \`findReferences\`: find symbol references
- \`hover\`: get hover documentation and type info
- \`documentSymbol\`: list all symbols in document
- \`workspaceSymbol\`: search symbols across workspace
- \`goToImplementation\`: find interface/abstract implementation
- \`prepareCallHierarchy\`: prepare call hierarchy item
- \`incomingCalls\`: find caller functions
- \`outgoingCalls\`: find callee functions

"diagnostics" is NOT an operation (delivered automatically).

Parameters:
- \`filePath\`: file path.
- \`symbol\`: symbol identifier name (preferred over line/character).

Fallback to AFT or Grep if language server unavailable.`
