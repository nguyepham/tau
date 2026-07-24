export const DESCRIPTION = `
Read specific resource from MCP server.
- server: MCP server name
- uri: Resource URI to read

Usage:
\`readMcpResource({ server: "myserver", uri: "my-resource-uri" })\`
`

export const PROMPT = `
Read specific resource from MCP server, identified by server name + resource URI.

Parameters:
- server (required): MCP server name
- uri (required): Resource URI to read
`
