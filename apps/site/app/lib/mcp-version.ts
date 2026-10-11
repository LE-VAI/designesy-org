// The MCP server's release version, as every surface reports it: serverInfo
// on /api/mcp, the server card, the outbound User-Agent, server.json, and the
// Action's SARIF driver. The source of truth is packages/designesy-mcp/
// pyproject.toml (PyPI and the MCP registry publish from it);
// packages/designesy-mcp/test/test_server.py fails CI if any surface drifts.
export const MCP_SERVER_VERSION = '1.13.7';
