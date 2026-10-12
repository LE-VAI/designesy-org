/**
 * MCP Server Card and AI Catalog: who this MCP server is and where to connect,
 * readable before a client opens a session.
 *
 * WHAT THE STANDARD SAYS
 * SEP-2127 (MCP Server Cards, Final, Extensions Track) defines the card. Its
 * normative schema and discovery rules live in
 * github.com/modelcontextprotocol/experimental-ext-server-card (schema.json,
 * docs/discovery.md):
 *   - the card's $schema is the v1 URL below, and name, version and
 *     description (1 to 100 characters) are required;
 *   - a card does not list tools, resources or prompts: clients read those
 *     from the live server, so a card cannot go stale on them;
 *   - the reserved location is GET <streamable-http-url>/server-card, served
 *     as application/mcp-server-card+json;
 *   - a domain lists its cards in /.well-known/ai-catalog.json
 *     (application/ai-catalog+json, specVersion "1.0"), one entry per card,
 *     with a urn:air:{publisher}:{namespace}:{name} identifier.
 * /.well-known/mcp/server-card.json predates the Final spec. Smithery still
 * reads it when a live scan fails, so it serves this same card.
 *
 * ONE SOURCE FOR THE LISTING TEXT
 * The official MCP registry publishes server.json at the repo root, and the
 * directories that mirror the registry copy its title and description. The
 * card states the same name, title, description, website and remote, so a
 * client that reads both never sees two stories. scripts/check-mcp-tool-
 * parity.js asserts the agreement with server.json and the schema limits;
 * scripts/check-readme-facts.js holds the check count in the description to
 * the engine's.
 *
 * This file has no imports, so the gate can load it with Node's type
 * stripping. The routes pass in MCP_SERVER_VERSION.
 */

export const SERVER_CARD_SCHEMA = 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';
export const SERVER_CARD_MEDIA_TYPE = 'application/mcp-server-card+json';
export const AI_CATALOG_MEDIA_TYPE = 'application/ai-catalog+json';

const SITE = 'https://www.designesy.org';

/** The server's name in the official MCP registry, the one canonical listing. */
export const MCP_REGISTRY_NAME = 'io.github.LE-VAI/designesy-org';
export const MCP_SERVER_TITLE = 'Designesy';
/** Owner decision 2026-10-11. At most 100 characters (registry and card schema). */
export const MCP_SERVER_DESCRIPTION =
  'Design quality gate for AI-generated UI: score any URL on 44 deterministic checks, A–F grade.';
export const MCP_ENDPOINT = `${SITE}/api/mcp`;
export const MCP_SERVER_CARD_URL = `${MCP_ENDPOINT}/server-card`;
export const MCP_REPOSITORY = 'https://github.com/LE-VAI/designesy-org';

/**
 * Protocol revisions the hosted endpoint speaks, each confirmed against the
 * live endpoint on 2026-10-11:
 *   - 2024-11-05 to 2025-11-25: sent on a legacy initialize and read back.
 *   - 2026-07-28: the stateless revision, served per request. server/discover
 *     (MCP-Protocol-Version: 2026-07-28, with the _meta envelope) answers
 *     supportedVersions ["2026-07-28"], and tools/list under it returns all
 *     tools. A legacy initialize that asks for 2026-07-28 is answered with
 *     2025-11-25, so this one is not visible from initialize.
 * SEP-2127: a client reads this list to decide whether it can attempt a
 * connection, so a revision missing here turns away a client that would work.
 */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25', '2026-07-28'] as const;

/**
 * The v1 icon tile (brand ledger D53): the mark and its dot on the dark
 * paper, which reads on light and dark client backgrounds alike, so no theme
 * is set. Files: public/brand/.
 */
export const MCP_ICONS = [
  { src: `${SITE}/brand/designesy-icon.svg`, mimeType: 'image/svg+xml', sizes: ['any'] },
  { src: `${SITE}/brand/designesy-icon-512.png`, mimeType: 'image/png', sizes: ['512x512'] },
] as const;

export function buildServerCard(version: string) {
  return {
    $schema: SERVER_CARD_SCHEMA,
    name: MCP_REGISTRY_NAME,
    version,
    title: MCP_SERVER_TITLE,
    description: MCP_SERVER_DESCRIPTION,
    websiteUrl: SITE,
    repository: { url: MCP_REPOSITORY, source: 'github' },
    icons: MCP_ICONS.map((icon) => ({ ...icon, sizes: [...icon.sizes] })),
    remotes: [
      {
        type: 'streamable-http',
        url: MCP_ENDPOINT,
        supportedProtocolVersions: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
      },
    ],
  };
}

export function buildAiCatalog() {
  return {
    specVersion: '1.0',
    host: {
      displayName: MCP_SERVER_TITLE,
      identifier: 'designesy.org',
      documentationUrl: `${SITE}/docs/mcp`,
    },
    entries: [
      {
        identifier: 'urn:air:designesy.org:mcp:designesy',
        type: SERVER_CARD_MEDIA_TYPE,
        url: MCP_SERVER_CARD_URL,
      },
    ],
  };
}

/** Headers for a public, cacheable discovery document any origin may read. */
export function discoveryHeaders(contentType: string, filename: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    'Access-Control-Allow-Origin': '*',
    'Content-Disposition': `inline; filename="${filename}"`,
  };
}
