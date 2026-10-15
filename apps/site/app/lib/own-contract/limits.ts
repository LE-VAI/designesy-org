// Own-contract intake limits (engine spec section 4.2), checked before and
// during parsing. One place, so the published formula, the API and the tests
// read the same numbers.

/** Request body cap. Over it: 413 body_too_large. */
export const MAX_BODY_BYTES = 300 * 1024;
/** Contract text cap, inline or fetched (UTF-8 bytes). Over it: 413 contract_too_large. */
export const MAX_CONTRACT_BYTES = 256 * 1024;
/** A linked contract's fetch aborts after this long (CONTRACT_URL_UNREACHABLE). */
export const CONTRACT_FETCH_TIMEOUT_MS = 8_000;
/** Content types a linked contract may be served as. */
export const CONTRACT_CONTENT_TYPES = ['text/', 'application/json', 'application/octet-stream'];
/** Declared tokens. Over it: TOO_MANY_TOKENS. */
export const MAX_TOKENS = 2_000;
/** DTCG group nesting. Deeper: TOO_DEEP. */
export const MAX_DEPTH = 16;
/** Hops in one alias chain. Longer: ALIAS_TOO_DEEP. */
export const MAX_ALIAS_HOPS = 16;
/** Resolution steps across the whole contract. More: ALIAS_TOO_DEEP. */
export const MAX_RESOLUTION_STEPS = 10_000;
/** Token map entries. More: TOKEN_MAP_INVALID. */
export const MAX_TOKEN_MAP_ENTRIES = 500;
/** A token map value must be a CSS custom property name. */
export const TOKEN_MAP_NAME = /^--[A-Za-z0-9_-]{1,128}$/;
/** Parse and validate budget. Over it: CONTRACT_TOO_COMPLEX. */
export const INTAKE_BUDGET_MS = 1_000;
/** YAML aliases per document (billion-laughs guard). */
export const YAML_MAX_ALIASES = 100;
/** At most this many characters of any offending value reach a message. */
export const MAX_VALUE_CHARS = 80;
/** A linter sentence is shown whole; only past this length is it cut, at a word boundary. */
export const MAX_LINTER_MESSAGE_CHARS = 400;
/** Evidence entries per check; the rest are counted in `truncated`. */
export const EVIDENCE_CAP = 20;
/** The 16px root the engine assumes for rem (the existing engine's rule). */
export const ROOT_PX = 16;

/** The minimum scoreable contract. */
export const MIN_COLORS = 3;
export const MIN_TYPE_STYLES = 1;
