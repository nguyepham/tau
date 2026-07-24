export const LSP_TOOL_NAME = 'LSP' as const

export const DESCRIPTION = `Interact with Language Server Protocol (LSP) servers for code intelligence.

Valid "operation" values — exactly these 9:
- goToDefinition: Find symbol definition
- findReferences: Find all references to a symbol
- hover: Get hover info (documentation, type) for a symbol
- documentSymbol: Get all symbols (functions, classes, variables) in a document
- workspaceSymbol: Search symbols across workspace
- goToImplementation: Find implementations of interface/abstract method
- prepareCallHierarchy: Get call hierarchy item at a position
- incomingCalls: Find all functions/methods calling function at position
- outgoingCalls: Find all functions/methods called by function at position

Do NOT pass other values ("diagnostics", "rename", "completion", "formatting", "signatureHelp" will fail). Diagnostics (errors/warnings) arrive automatically after file open/edit — never call this tool to fetch them; read diagnostics that arrive by themselves.

For symbol operations (goToDefinition, findReferences, hover, goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls) pass:
- filePath: file to operate on
- symbol: symbol name, e.g. "LogoV2". ALWAYS pass this — tool locates exact position. Do NOT guess line/character: hand-picked column almost always lands on keyword (export/def/function) or whitespace, returning wrong empty result. Only pass explicit 1-based line+character if precise editor cursor position known.

documentSymbol lists every symbol in a file (filePath only). workspaceSymbol searches whole project — pass symbol name as query.

Works for languages with running language server (TS/JS, Python, HTML, CSS, JSON, etc.). If none supports file language, fall back to AFT or Grep.`
