export const LIST_MCP_RESOURCES_TOOL_NAME = 'ListMcpResourcesTool'

export const DESCRIPTION = `
List available resources from configured MCP servers.
Each resource includes 'server' field indicating source server.

Usage examples:
- List all resources: \`listMcpResources\`
- List from specific server: \`listMcpResources({ server: "myserver" })\`
`

export const PROMPT = `
List available resources from configured MCP servers.
Each resource includes standard MCP fields + 'server' field indicating source.

Parameters:
- server (optional): MCP server name to get resources from. If omitted, resources from all servers returned.
`
