# Changelog

All notable changes to `designesy-score` are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

**Monitor contract 0.1.5: monitor alert email is retired, and scores move.**
`/api/monitor` sends no email under any setting; alerts come back in the result
(`alerts[]`), as `/monitor` shows them. m10 is no longer scored, so a stable
site moves from 90 (A) to 89 (B) on its third run or later.

### Removed

- **Monitor alert email.** The send code, `app/lib/monitor-email.ts`, the `resend`
  import and the `resend` dependency are gone from apps/site, so no setting can
  make `/api/monitor` send mail, `MONITOR_EMAIL_ENABLED=true` included. Nothing
  in the site reads that variable now. The Continuity waitlist still sends its
  notices through Resend's HTTP API with `RESEND_API_KEY`, unchanged.
- `emailAlert` is gone from the monitor result, and with it the one-hour
  cooldown and the address check.

### Changed

- **m10 is N/A on every run and is not scored.** Its detail says alerts are
  returned in the response and email delivery was retired; the ids m01 to m10
  stay. m10 passed on every run unless a send was tried and failed, so leaving
  it out takes a PASS out of the score: a stable site moves from 90 (A) to 89
  (B) on its third run or later and from 95 to 94 on its second; a first run
  stays at 100.
- **An `email` field is accepted and ignored.** An address, `5` or `null` returns
  200, and no address appears in the result. designesy-mcp 1.13.10 and earlier
  forward `email` when given; the field has no effect, so they keep working.
- **`/monitor` has no email field.** It sends no address, and on load it removes
  an address an earlier version saved in the browser (`designesy:monitor-email`).
  Its formula reads `÷ scored checks` (it said `÷ 10`, which a SKIP made wrong),
  m10 is labelled "Alert email", and the engine bar has no email field type.
- The monitor contract (0.1.5) rewrites `alert_delivery`, the m10 row, the
  scoring line and the email open question; `/changelog` has the entry, and
  `/contracts/monitor` and `/monitor` follow.
- `apps/site/.env.example` drops `MONITOR_EMAIL_ENABLED` and says the Resend key
  is for waitlist notices only.

### Fixed

- **A malformed request is a 400 that names the field.** `app/lib/monitor-history.ts`
  holds one bounds-only schema, which the route reads: types,
  a score from 0 to 100, a grade from A to F, drift check ids d01 to d12, PASS,
  FAIL, WARN or SKIP, string lengths and at most 1000 runs. It does not recompute
  a run's score from its checks, so runs stored by an earlier engine stay valid.
  A body over 512 KB is a 413. Before, `history: [{}]`, an `email` that was not a
  string, a `url` that was not a string and a body of `null` crashed the route,
  and a `score` that was not a number made the m03 and m07 deltas NaN. A
  `history` that is not an array was read as no history; it is now a 400.

### Tests

- `check-mcp-accuracy`'s `monitor-no-mail` replaces `monitor-mail-off`: with
  `MONITOR_EMAIL_ENABLED="true"`, a Resend key set and Resend's API answered
  inside the harness, a run that raises an alert sends nothing; an `email` given
  as an address, `5` or `null` returns 200 with no address in the result; m10 is
  SKIP and the score leaves it out; each malformed request is a 400 naming its
  field, and a 600 KB body is a 413. The route harness no longer stubs the
  `resend` module.

**Monitor contract 0.1.4: drift-alert email is off unless the server
switches it on.** `/api/monitor` and the hosted `designesy_monitor_score`
mailed an alert to whatever address a request named, and nothing confirmed
that the address's owner had asked for it.
Superseded by 0.1.5 above: the switch, the escaping and `monitor-mail-off`
went with the sending.

### Security

- **No alert email without `MONITOR_EMAIL_ENABLED=true`.** A server sends
  monitor alert mail only when that variable is exactly `true` and
  `RESEND_API_KEY` is set. It is off unless set to exactly `true`. With it
  off, a request that names an email and raises an alert gets
  `emailAlert.off: true` and no mail, and the per-hour cooldown is not
  touched. Setting the switch alone brought back the old sending, with the
  HTML escaped; 0.1.5 removes the sending, so no setting does now.
- **Every value the alert email's HTML interpolates is escaped.** The host,
  the grade, both scores, the alert texts and the URL pass through
  `escapeHtml`.
  A previous score that is not a finite number shows as "no score recorded".
- **`check-mcp-accuracy` holds both.** Its new `monitor-mail-off` check runs
  the route with Resend stubbed. With the switch unset, `""`, `"1"`, `"TRUE"`
  or `"yes"`, a run that names an email and raises an alert sends nothing.
  With `"true"` it sends one email, in which a previous score that is not a
  number shows as missing. It also checks that `escapeHtml` turns `<`, `>`,
  `"`, `'` and `&` into entities.

### Changed

- m10 is rebuilt on every request, so when an alert fires it reports whether
  email alerts are on. With them off it says the alert was surfaced in-UI and
  that email alerts are off on this server, adding "so no email was sent" when
  an email was given. It stays PASS. A request whose send would have failed
  (m10 WARN) now sends nothing (PASS).
- `/monitor` shows no email field, and sends no saved address, while email
  alerts are off. Its method step and its descriptions no longer offer an
  email alert.
- The monitor contract (0.1.4) names the switch in `alert_delivery`, m10 and
  its open questions. Its m10 row now matches the engine: it passes when an
  alert is delivered, held back by the cooldown or surfaced in-UI, warns when
  a send fails, and never fails (it said in-UI only was a WARN). The
  `designesy_monitor_score` description, its `email` parameter, `/docs/mcp`
  and the designesy-mcp README's Safety section name the switch as well.
- `/contracts/monitor` no longer offers an email alert in its description.

### Not changed

- The PyPI server's text still names only `RESEND_API_KEY`: the
  `designesy_monitor_score` description and `email` parameter, the safety and
  annotation comments, and the pyproject description. That server forwards to
  this site's `/api/monitor`, so it sends no mail while the switch is off. Its
  text, and the README on PyPI, follow in the next designesy-mcp release.

## [1.13.10] — 2026-10-21

**Tokens contract 0.1.3: `designesy_tokens_score` reads a file the way the
DTCG 2025.10 Format Module does** (the hosted `/api/mcp`, and the PyPI server
from designesy-mcp 1.13.10, below). Scores move for files that
type their groups, reference with a JSON Pointer `$ref`, hold a `$ref` that
leads nowhere, leave out `$schema`, keep a top-level group named `tokens`, or
write dimensions as strings.

An installed PyPI server still on 1.13.9 keeps the 0.1.2 checks
but names them from the contract it fetches from this site, so its results
say `contract_version` 0.1.3 and put the 0.1.3 names beside 0.1.2 verdicts.
A file with no `$schema` FAILs t01 under a name that calls `$schema` a
Designesy policy, and t08 passes `"4px"` under a name that asks for
`{ value, unit }`. 1.13.10, published to PyPI and the MCP registry as
`v1.13.10`, closes the gap.

### Fixed (tokens contract 0.1.3)

- **A token takes the type of its group.** Both servers counted only a
  `$type` written on the token. The Format Module gives a token with no
  `$type` the type of the token it references, else the closest `$type` on
  the groups above it (5.2.2), and a group that `$extends` another takes that
  group's type (6.7.3). So a conformant file that typed its groups failed t03
  and t06, and t05 and t08 never saw its colours and dimensions. Of the 93
  valid (positive) files in the DTCG 2025.10 test suite, 13 failed t03 and 12
  failed t06, scoring 50 to 71; `group/type-inheritance.json` scored 71 (C) on
  both servers. Now none fails t03 or t06: 92 score 100, and the 93rd, a file
  holding only an empty group, scores 60. With no tokens t03 is SKIP, as t06
  already was.
- **A `{ $type, $ref }` token is a token, and a JSON Pointer `$ref` is not a
  deprecated pattern.** An object with a `$ref` and no `$value` was read as a
  group, so the two `$ref` tokens in the format's own JSON Pointer example
  were not counted, and a `$ref` beside a `$value` was reported in t10 as
  "deprecated $ref syntax". Tools must support JSON Pointer `$ref` (7.1.2).
  t10 now reports a `$ref` that is not a pointer (`#/...`), such as a dot
  path.
- **t04 checks that each token has one value.** It counts a token with one
  `$value` or `$ref`. It FAILs a token that has both, which the 2025.10 token
  schema does not allow, and a JSON Pointer that names no location in the
  file or loops back: tools must validate reference targets and detect loops
  (7.5.1, 7.2.3). A pointer reads array items by index, and where it reads
  the `$value` of a `$ref` token it follows that `$ref` (7.2.2). Until now
  t04 failed only a file with no tokens.
- **The whole file is scored.** A file with a top-level group named `tokens`
  (or a `$tokens` key) was scored on that group alone, and every other group
  was ignored. Neither name means anything in DTCG: `tokens` is now a group
  like any other, and `$tokens`, like every `$` key, holds no tokens.
- **A missing `$schema` is a WARN, named as Designesy policy.** t01 failed a
  file without `$schema` and said "DTCG 2025.10 requires $schema". The
  Format Module does not define `$schema`, and the official 2025.10 JSON
  Schema notes that it is not part of the specification. The contract's
  `schema_property`, which said DTCG marks it SHOULD, now says so.
- **t08 expects the 2025.10 dimension form.** A dimension is
  `{ value, unit }` with `px` or `rem` (8.2). t08 passed any string ending in a
  CSS unit (`"16px"`, `"2em"`) and the object form with any CSS unit. It now
  passes `{ value, unit }` in px or rem, reports a string with a CSS unit as
  the legacy form (a WARN, also listed in t10), and FAILs only when no
  dimension value is usable. t10's advice leads to a t08 PASS: a `px` or
  `rem` string is told to write `{ value, unit }`, a string in another unit
  that a 2025.10 dimension takes px or rem, and a bare number, which was told
  to include a unit string, to write `{ value, unit }` in px or rem.
- **A chain of references is followed once.** t08 walked the whole chain of
  each dimension alias, so 5,000 chained aliases took 3.7 to 5.4 seconds to
  score in the hosted port and 12 to 16 in the PyPI port (several runs, one
  machine). Each chain of aliases, JSON
  Pointers or `$extends` is now followed once per file, in a loop: the same
  file scores in 10 to 14 ms in the hosted port and 34 to 48 ms in the PyPI
  port, and
  every 5,000-long chain of aliases, pointers, dimension aliases or
  `$extends` in under 100 ms.
- **The tool description no longer says `$description` is checked.** No
  check reads it. Both servers' descriptions now name what the checks read.

### Changed (tokens contract 0.1.3)

- Tokens contract 0.1.2 to 0.1.3. t01, t04, t08 and t10 are named for what
  they check, and t01 has no FAIL; `schema_property` and the open item on
  references are rewritten, and the scoring note says how a type is found.
  Every result carries the new check names.

### Scores that move (tokens contract 0.1.3)

Measured with both servers on the shared fixtures in
`packages/designesy-mcp/test/fixtures/tokens/` (the two agree on every file):

| File | Before | After | Why |
|---|---|---|---|
| `type-inheritance.json` (new) | 71 C | 100 A | group types, `$extends` and untyped aliases |
| `json-pointer-ref.json` (new) | 71 C | 94 A | four `$ref` tokens counted; t10 WARNs on a dot-path `$ref` |
| `legacy-dimensions.json` (new) | 71 C | 88 B | group-typed; t08 and t10 WARN on `"16px"` |
| `tokens-group.json` (new) | 100 A | 83 B | the ignored group's bare-number dimension is now read |
| `empty-group.json` (new) | 50 F | 60 D | t03 SKIP with no tokens |
| `guardrails-emitted.json` | 100 A | 89 B | five string dimensions (`"4px"`, `"1rem"`) WARN in t08 and t10 |
| `bare-hex-ref.json` | 81 B | 69 D | its one token has both `$value` and `$ref`: t04 FAIL |
| `js-key-order.json` | 65 D | 55 F | one token has both `$value` and `$ref`: t04 FAIL |
| `empty.json`, `schema-host-apex.json` | 33 F | 40 F | t03 SKIP with no tokens |
| the three other `schema-host-*.json` | 25 F | 30 F | t03 SKIP with no tokens |

`site-export.json` (the site's `/export/dtcg`) stays at 100, and the other
five fixtures keep their scores.

- `designesy_guardrails` still writes dimensions as strings, so the token
  file it emits now scores 89 with no FAIL. The emitter is not changed here.
- On the 127 invalid (negative) files of the same suite, 7 scores drop and
  10 rise. The drops are files now caught: `dimension-wrong-unit.json` by t08
  (100 to 88), and by t04 a token with both `$value` and `$ref` (94 to 88)
  and five pointers that name nothing (100 to 86 or 88). Main scored nine of
  the rises 50, having read each `$ref` token as a group: they now score 86
  or 93, with t04 or t10 naming the `$ref`. The tenth, whose only token has
  a name that starts with `$`, scores 60 (t03 SKIP with no tokens). None
  reaches 100.

### Gates (tokens contract 0.1.3)

- The shared golden gains the five new fixtures. `valid.json`, `invalid.json`
  and `bare-hex-ref.json` lose their `$tokens` wrapper, which only the removed
  shortcut read; `valid.json`, `nine-pass-one-skip.json` and `aliases.json`
  write dimensions as `{ value, unit }`; `contract.json` is regenerated from
  the site.
- `test/test_tokens_score.py` and `test/test_server.py` add or rename 29
  tests (the five new golden rows among them); 28 fail against the previous
  main's server module, and the 29th guards that an `$extends` loop ends,
  which main's also does. The token fixtures in `test/test_server.py` follow
  the format.
- The three token fixtures of `scripts/check-mcp-accuracy.js` write
  dimensions as `{ value, unit }`, so each still tests the rule it names.
- The sibling contract lock records tokens 0.1.3.

**designesy-mcp 1.13.10: the stdio server fails closed** (PyPI and the MCP
registry `v1.13.10`). Apart from the tokens scoring
above, nothing changes in the hosted `/api/mcp` except the version it
reports. It is the first designesy-mcp release since 1.13.9, so it also
ships the offline engine merged since then: it mirrors engine 1.5.3 and
contract v0.4.7 (1.13.9 mirrored 1.4.0 and v0.4.6), and it scores tokens
files by contract 0.1.3, above.

### Fixed (designesy-mcp 1.13.10)

- **Every certificate is verified.** `_fetch` and `_post_api` retried with
  `CERT_NONE` after a failed verification, after any raw `ssl.SSLError`, and
  after any error whose text said "certificate" (an HTTP error with such a
  reason phrase included). That covered the POSTs to designesy.org's
  engines, the monitor email among them. A failed verification is now a tool
  error that names the reason, and `designesy_score` no longer scores offline
  when the engine's own certificate fails (1.13.9 did, without saying why).
  To read a site with a bad certificate anyway, set
  `DESIGNESY_INSECURE_TLS=1`: a URL the caller passes (never one on
  designesy.org) whose verification fails is then read without it, and the
  result carries `tls_verified: false`.
- **An engine error is not scored offline.** `designesy_score` fell back to
  the offline engine whenever the engine returned no score, so a URL the
  engine refused (HTTP 400 for `http://100.100.100.200/` and
  `http://[fec0::1]/`, both of which the server's own URL check lets
  through) was fetched from the user's machine instead. It now falls back
  only when the network fails before the request is sent (no DNS, no route,
  a refused connection). An HTTP error (a refused URL, a rate limit, a page
  the engine could not reach), `ok: false`, a reply that is not a JSON
  object, a failure after the request was sent (a reset, a read timeout),
  or a certificate that fails verification is returned as an error. 1.13.9
  scored the read timeout offline too, and the engine can spend longer on a
  page than the call waits, so a page that answered the engine slowly could
  have itself fetched from the user's machine.
- **No browser unless the operator names one.** The offline engine opened
  the URL in a new tab of any Chrome answering on `127.0.0.1:9222` to measure
  v02 and v21. It now does so only when `DESIGNESY_CDP_URL` names a Chrome
  DevTools endpoint, and both Node probes connect to that endpoint;
  otherwise both checks read MANUAL. The `designesy_score` description says
  so. Neither probe uses a tab it did not open: when `/json/new` failed, the
  viewport probe measured in a tab already open on the same host and then
  closed it.
- **No line ends the session.** An array, a bare string, a number, or
  `params: null` raised AttributeError and stopped the server, and so did a
  byte that is not UTF-8 wherever stdin was decoded strictly (CPython's
  default on a UTF-8 Linux locale). Each line is now decoded as UTF-8,
  whatever the locale. A line that is not UTF-8 or not JSON gets -32700, a
  message that is not an object gets -32600 (the 2024-11-05 revision has no
  batches), and a handler that raises gets -32603; the server reads on.
  On Windows, where stdin was read as cp1252, a non-ASCII request now
  arrives intact (a tool name `café` arrived as `cafÃ©`).
- **Notifications get no reply.** `notifications/cancelled` got a -32601
  error frame back.
- **Error codes follow the 2024-11-05 revision.** An unknown tool is -32602
  and an unknown resource -32002 (both were -32601). `params` or `arguments`
  of null read as `{}`, and any other non-object is -32602. A tool that runs
  and fails (a fetch error, a blocked URL) returns an `isError` result with
  the same text, instead of a JSON-RPC -32000 error.

### Not changed (designesy-mcp 1.13.10)

- The tool list, the schemas, the titles and the annotations:
  `designesy_score` stays `readOnlyHint: true`. The offline engine's checks
  and verdicts. The tokens checks change as described above.
- The hosted endpoint, which has no offline engine or browser probe.

**Engine 1.5.3: f14 counts what a `var()` resolves to, and line-height
ratios** (the site; not on npm, where `@designesy/score` 0.9.3 runs engine
1.5.2). A measurement fix to the own-contract score: no check is added, and
no weight or ceiling moves.

### Fixed (engine 1.5.3)

- f14 (own contract) read a `var()`'s raw custom-property text, so a token
  whose value is a chain of `var()`s was never counted. It now counts the
  value the chain resolves to.
- f14 had no line-height case. A unitless line-height that equals one of
  the contract's typography ratios (within 0.01, as the other kinds use)
  now counts. Own-contract formula 1.0.2.
- On the recorded contract-page fixtures, `landed-capped` and
  `landed-drift` move f14 from WARN to PASS: their tokens category rises (75
  to 100, and 25 to 50) and their uncapped fidelity score with it (84.7 to
  88.6, and 76.7 to 80.7). No reported score or grade moves.
- designesy-mcp 1.13.10's offline engine reports engine 1.5.3. The Python
  port has no f14 code, so its verdicts do not change.

**Contract v0.4.7: the contract declares what the site ships** (the site;
no engine, npm or PyPI release). Tints, radii, fluid type sizes and line
heights that the stylesheets wrote inline become named `:root` tokens and
contract entries, and the rules read them. The only things that change on
screen are marked below. No check is added, and no weight, ceiling or verdict
moves. The engine stays 1.5.2.

### Added (contract v0.4.7)

- **Eleven tints of contract tokens**, each on `:root` and in the contract's
  colors. Each one holds the same `color-mix()` its rules wrote inline, so it
  follows its source tokens into the light theme:
  - chip text: `--ok-chip`, `--warn-chip`, `--error-chip`
  - chip edges: `--ok-rim`, `--warn-rim`, `--error-rim`
  - the Azure washes and their edge: `--signal-wash`, `--signal-wash-raised`,
    `--signal-rim`
  - two surface states: `--surface-selected`, `--surface-raised-hover`

  The pass, warn and fail chips (`.row-side-chip`, `.definition-side
  .row-side-chip`, `.check-cell-status`), the featured home card, the copied
  button, the segmented control's selected tile and the hover on an avoided
  check cell all read them. So do `.status-badge--warn` (text and edge) and
  the two warn hints on the spring validator, which wrote the same mix
  inline.
- **Two radii.** `--radius-xs` is 2px: the legend swatches, the track
  segments and the reticle use it, and so do the seven 2px corners on the
  contracts, Orb, Poise and Takt pages. `--radius-full` is 9999px: the 18 `999px`
  pills, `.report-count`'s `99px` and the two 3px scrollbar thumbs use it.
  Any radius past half the box draws the same round end, so none of these
  changes on screen.
- **`typography.fluid`, 29 roles.** Each role's `--text-<role>` token holds
  the exact `clamp()` it ships, with its narrow and wide ends and the rules
  that read it. The 33 declarations that wrote those clamps inline now read
  the tokens. A custom property is substituted where it is read, so the
  viewport and container units still resolve on the element.
- **`typography.leading`, 22 roles.** Each `--leading-<role>` token holds a
  bare ratio, from `--leading-fidelity` (0.92) to `--leading-reading`
  (1.65), with `--leading-heading` (1.08) and `--leading-body` (1.55) among
  them. `--leading-reading` sets the long prose on the brand, data and
  engine pages, `--leading-figure-tight` (1.05) the prices, the type
  specimen and the empty contract readout, and `--leading-fidelity` the
  contract fidelity numeral. The 230 plain `line-height` declarations that
  wrote one of those ratios now read the tokens.
- **Role text and a role field on every fluid size.** Each leading role and
  each of the 29 fluid roles says what it sets; the rules that read a fluid
  size stay in their own `selectors` field.

### Changed (contract v0.4.7)

These change pixels:

- **The copied button's edge** (`.copy-prompt-btn.is-copied`) reads
  `--signal-rim`, the same edge as the featured card. In the dark theme that
  is 45% Azure instead of 40%, which is not visible. In the light theme it is
  Deep Azure (`--signal-access`) instead of Azure, a stronger non-text edge.
- **Five 3px corners read `--radius-sm` (4px):** `.status-badge`,
  `.score-card-cat`, `.report-check-status`, `.eg-minicell::before` and
  `.mt-cell`. Where the box's short side is 6px or less, both radii are past
  half the box and the shape does not change; on a larger box the corner is
  1px rounder.

This changes text only:

- **`typography.hero_wordmark` states the clamp the site ships**,
  `clamp(3.2rem, 3.2rem + 2.5vw, 5.5rem)`, and names `--text-wordmark-hero`.
  It said `clamp(3.2rem, 9vw, 5.5rem)`, which the site has not shipped
  (brand decision D76).

### Removed (contract v0.4.7)

- **`--live` is retired** (#22c55e, the "is-live status dot indicator"),
  following brand decision D57 of 2026-10-11, which retired the green live
  token. No stylesheet declared or read `--live`, and no `is-live` class
  exists in the app.

### Not changed

- The engine (1.5.2), the checks, the weights and the ceilings, and the MCP
  tools and their descriptions. `CONTRACT_VERSION` in the npm engine source
  moves to v0.4.7, because its test reads the site's contract. Nothing is
  published to npm or PyPI with it. Until designesy-mcp 1.13.10, the PyPI
  server's offline engine reported contract v0.4.6.
- The eleven 16px label lines (`line-height: 1rem` on the 12.8px label step)
  stay lengths. At 1.25, Chrome lays the line out at 15.984375px, and the
  1/64px it loses moves the text below it by a device pixel on some pages.
  The own-contract check f05 already counts each one as the declared 1.25,
  since it reads a length over its own rule's font size.
- `line-height: 0` stays literal; it is no declared role.
- Three spring validator mixes stay inline, because no token holds them
  byte for byte: the two ok hints write `var(--ok) 70%` over ink, where
  `--ok-chip` is 72%, and the error hint writes `var(--error) 70%`, where
  `--error-chip` is 82%.

### Gates (contract v0.4.7)

- `check-warn-ink.js` measures the three chip text tokens in both themes, on
  all four surfaces. Until now it measured the nine inline chip mixes that
  those tokens replace.
- `check-own-contract.mjs` section 19 writes the live contract version back
  as the version its legacy snapshot was recorded under, `v0.4.6`, before
  comparing. It treats the engine version the same way. A contract bump alone
  no longer moves the 82 legacy responses, and any other change to them still
  fails. Under v0.4.7 all 82 match.
- The MCP token-score fixtures are regenerated from the site
  (`contract.json`, `site-export.json`, and the golden `expected.json`).
  The DTCG export gains the two radii (51 to 53 tokens), and its tokens score
  is unchanged.

### Measured (contract v0.4.7)

- **Computed styles, main against this branch.** The run covered 40 pages in
  both themes at 1440 and 390px: 13,272 rendered elements and their first 25
  descendants, 440,776 property readings, and each element's box to
  0.001px. Only these differ:
  - the marked changes: the copied button's edge and the 3px corners now at
    4px;
  - the `999px` and `99px` radii, which now read `9999px` (every element
    involved is under 1998px on its short side, so the used radius is the
    same);
  - the width of the home card line that prints the contract version.

  The 2px corners, the three new leadings and the warn tints read the same
  computed values and boxes as before. Every new token, set in a probe
  element, computes the same value as the inline expression it replaced, in
  both themes and at both widths. Each 3px corner was measured on its own:
  every rendered instance has a short side over 6px (6.72px to 24.6px), so
  its used radius grows, to 4px, or to 3.36px on the 6.72px maturity legend
  cell, whose pixels do not change.
- **Own-contract score of /DESIGN.md against the home page.** The DESIGN.md
  is the one built by the pending front-matter change, with that change's
  generator extended for these tokens. Engine 1.5.2:
  - 43.6 F with the v0.4.6 contract on production CSS;
  - 90.7 A with this contract on main's CSS;
  - 100 A with this contract on this branch's CSS.

  The baseline is 100 A throughout. On this branch's CSS every check that
  runs passes: f01 142 of 142, f02 33 of 33, f03 32 of 32, f04 3 of 3
  families, f05 20 of 20, f07 7 of 7 (no 3px radius ships any more), f08 49
  of 52, f13 11 of 11 and f14 0.804. f06, f09, f10, f11 and f12 skip, as
  before.

**Engine 1.5.2 and @designesy/score 0.9.3: v46 reads the `font` shorthand**
(the hosted API and npm `score-v0.9.3`). No check is added, no
weight or ceiling moves, and contract v0.4.6 is unchanged. The PyPI server's
offline engine does not run v46 (listed as not ported), so it mirrors 1.5.2
unchanged.

### Fixed (engine 1.5.2)

- **v46 reads the `font` shorthand.** Through 1.5.1 v46 read only `font-size`,
  so a size written as `font: 500 0.66rem/1 var(--mono)` was never judged.
  designesy.org's own hero console sat at 8.8 to 12.5px under its 12.8px floor
  that way; measuring the rendered page found it, and v46 never saw it. The
  size is the first token that is a length, a size keyword or a size function,
  ahead of the line-height slash and the family; a weight (`500`) has no unit
  and a family is no length, so neither is taken. System font keywords
  (`caption`, `menu`…) and CSS-wide keywords (`inherit`) carry no measurable
  size and are skipped, as is a whole-shorthand `var()` the `:root` tokens
  cannot resolve. A `font:` whose value holds a `{`, such as an
  `@supports (font: …)` condition, declares nothing and swallows no rule after
  it, and a `font:` written inside a shorthand's own value (in a comment, say)
  is read as that value's text. `font-size` is read exactly as in 1.5.1,
  custom properties such as `--chip-font-size` included; `font-family`,
  `font-weight` and `--icon-font` are not the shorthand.
- **v46 reads a sheet in linear time.** The shorthand scan, the size test and
  the selector of each finding's rule each read the sheet once. Written as
  patterns, the scan re-read a value once for every `font:` inside it, and the
  size test could split a run of digits between two quantifiers in as many
  ways as the run was long. The selector was already a cost in 1.5.1: each
  finding read back toward the start of a sheet with few braces or
  semicolons, so 256 KB of off-scale `font-size` declarations under a type
  scale took about a second to score, 13 times as long as 64 KB. The sheet's
  braces and semicolons are now listed once, each finding is answered by
  binary search, and the findings of one rule share one reading of its
  selector, which comes out as before.

### Not changed (engine 1.5.2)

- The MCP tools, their names and descriptions, and the PyPI package version.
- `@designesy/score` 0.9.3 changes nothing but the engine: the API, the
  options and the output formats are those of 0.9.2. `@designesy/cli` 0.3.2
  asks for ^0.9.2, so a fresh install of the CLI runs engine 1.5.2 too.

### Measured (engine 1.5.2)

- The calibration corpus (34 fixtures, 47 pinned verdicts) and the offline
  golden (152 cases, 297 runs) regenerate with only `engine_version` changed:
  no fixture uses the shorthand under a type scale.
- `packages/score/test/engine-1-5-2.test.mjs`: 5 rule tests fail on the 1.5.1
  build, and 6 controls pass on both.
- `packages/score/test/linear-scan.test.mjs` holds the three new helpers to
  the patterns and reads they stand for, with identical results on the repo's
  fixture pages, on 10,000 generated inputs each, and on every UTF-16 code
  unit for the case folding, the lookbehind and the size test. On 100 KB
  inputs built to stress each one, the helpers take 1 to 3 ms, where the
  patterns took up to 5.1 seconds (the size test on a run of digits). Four
  mutants of the helpers each fail the test, and a fifth that gives the same
  answers in quadratic time fails its 50 ms budget.
- The leaderboard cohort, re-scored with 1.5.1 and 1.5.2 on the same recorded
  bytes (30 sites, 27 reachable) through the hosted route and the npm engine:
  **no score or grade moves**, and every check other than v46 returns the same
  result. v46 keeps its status on every site. It measures more sizes on three
  sites and fewer on none:

  | Site | Sizes measured | Under the floor | Off the scale |
  |---|---|---|---|
  | www.designesy.org | 348 → 405 | 0 → 2 | 7 → 10 |
  | cohort site A | 518 → 527 | 3 → 4 | 75 → 75 |
  | cohort site B | 233 → 234 | 1 → 1 | 36 → 36 |

  designesy.org's five new findings were real, and the site has since moved
  them onto the scale: two console numerals off the scale (1.2rem, 1.5rem),
  a 3.25rem readout, and an 11.52px inspector label and a 10px log pin under
  the floor. Cohort site A's new finding is an 11px keycap under its floor.
- The whole engine, scored at 64 KB and at 256 KB of CSS under a type scale
  on twelve inputs built for v46, takes at most 5.6 times as long on the input
  four times the size (1.5.1 took up to 13.2 times as long on its `font-size`
  inputs), and at most 0.3 seconds at 1 MB.

**@designesy/cli 0.3.2** (npm), released on its own (`cli-v0.3.2`). It depends
on `@designesy/score` ^0.9.2. 0.3.1 asked for ^0.5.0, which on a 0.x version
means 0.5.x only, so `designesy score` kept running the 0.5 engine; it now runs
engine 1.5.1. Installs also bring score's optional DESIGN.md linter
(`@google/design.md`), as installing `@designesy/score` itself does.

**Engine 1.5.1 and @designesy/score 0.9.2: linear-time matching and capped
document reads** (the hosted API and npm `score-v0.9.2`; the PyPI server's
offline engine carries the same change in its next release). Scoring time now
grows in step with the page. No check
is added, no weight or ceiling moves, and contract v0.4.6 is unchanged. On a
well-formed page no verdict, detail or score moves.

### Fixed (engine 1.5.1)

- **Each pattern that reads a page reads each run of text once.** Some of the
  patterns that read a page's CSS and HTML retried from every place a match
  could start, or tried every way to split a run of characters between two
  quantifiers, so their cost grew with the square of a long run of the right
  characters (one with the cube). A page built for it could hold a scoring
  request for many seconds. Each of those patterns is now a scan that returns
  exactly what the pattern returned: the same matches at the same positions,
  the same text after the same replacement, the same yes or no. The hosted
  route and the npm engine change together (source-drift OK), and so do the
  error-text copy the hosted MCP tools share (mcp-tool-parity OK) and the
  Python offline engine in the MCP server.
- **v27 finds the rule each font-size declaration sits in from one index of
  the sheet.** It read backwards from each declaration to that rule's
  selector, and on some sheets each read went back toward the start of the
  sheet, so the check's cost grew with the square of the sheet's length. The
  sheet's braces and semicolons are now listed once and each declaration is
  answered by binary search, with the same rule and selector as before; the
  declarations of one rule share one reading of its selector. All three
  engines change together.
- **The CSS rule parser has two bounds.** A brace that would open a block more
  than 16 levels deep is read as text of the block it sits in, and at the end
  of a sheet at most 4 blocks left open are closed and read, innermost first.
  The leaderboard cohort nests at most 6 levels deep and leaves at most 1 block
  open at the end of a page's CSS, so the bounds change a result only for a
  malformed or hostile sheet. v44, v45 and S2 read through this parser.
- **The hosted engine reads a capped number of bytes.** A page's HTML is read
  up to 8 MiB, one stylesheet up to 4 MiB, a page's stylesheets together up to
  16 MiB, and a /DESIGN.md up to 16 MiB; a longer body is read up to its cap.
  Each cap is four or more times the largest in the cohort (1.8 MB of HTML,
  0.87 MB for one stylesheet, 3.3 MB of CSS for one page, 2.6 MB for a
  /DESIGN.md). A contract-mode run that reached a cap says so in its coverage
  notes (`DOCUMENT_CAP:`).

### Fixed (@designesy/score 0.9.2)

- **The review table escapes backslashes before pipes.** A cell carries text
  read from the scored page, and a backslash written before a pipe escaped the
  table's own escape, which left a live cell separator. `--format review`
  output now keeps every cell whole.
- **Published from this repository's release workflow through npm trusted
  publishing,** with provenance, and with no stored npm token.

### Not changed (engine 1.5.1)

- The MCP tools, their names and descriptions, and the PyPI package version.
- Response shapes. A universal-mode response carries no field for a capped
  read; contract mode reports it in its coverage notes.

### Measured (engine 1.5.1)

- The calibration corpus (34 fixtures, 47 pinned verdicts) and the offline
  golden (152 cases, 297 runs) regenerate with only `engine_version` changed.
- Every rewritten pattern runs beside the pattern it replaced, on the repo's
  fixture pages and on 10,000 generated inputs per call site, with identical
  results: 87 call sites in `packages/score/test/linear-scan.test.mjs` and 37
  in `packages/designesy-mcp/test/test_linear_scan.py`.
- The leaderboard cohort, re-scored on the same recorded bytes before and
  after: 30 sites, 27 reachable; every hosted result, npm result and assembled
  page is identical, and every Python offline result is identical apart from
  the engine version it reports.
- Of 64 TypeScript patterns timed before and after on 100 KB inputs built
  to stress each one, 44 took more than a second and 22 more than 10
  seconds; each new helper takes tens of milliseconds at most. v27 on a
  1.6 MB sheet built for it took 20 to 27 seconds and now takes about 0.1
  seconds.
- The whole engine, scored at 64 KB and at 256 KB on every input unit of
  that stress table (1,974 runs, as CSS and as HTML), takes at most 4.8 times
  as long on the input four times the size.

**Engine 1.5.0: score a page against your own contract** (the hosted API;
npm and PyPI unchanged). `POST /api/score` takes an optional `contract`
field: a DESIGN.md or DTCG 2025.10 token file, pasted (`contract.content`)
or linked (`contract.url`), with an optional `tokenMap`. The answer is two
numbers that are never blended: **contract fidelity**, how closely the page
follows the caller's contract, and a **baseline** of universal web checks that
read no contract. Requests without `contract` are unchanged: no legacy
verdict, detail or score moves.

### Added (engine 1.5.0)

- **Contract intake.** One normalized model from either format. A contract
  below the minimum (3 colors that resolve, 1 text style with a family and a
  size) or one that does not parse answers 422 `contract_not_scoreable` with
  a `problems` list: each problem has a `code`, the `path` and `line` where
  they apply, and at most 80 characters of the offending value.
  `ALIAS_CYCLE` carries the loop as an ordered `chain` of token paths;
  `TOKEN_DROPPED` (a declared token the DESIGN.md format linter left out of
  its model) carries a `reason` from a closed list: `alias_unresolved`,
  `alias_cycle`, `alias_wrong_type`, `value_not_scalar`, `value_invalid`,
  `unit_unsupported`, `unknown`. `CONFUSABLE_NAME` warnings carry the
  character, its script, its code point, its 1-based position and the Latin
  letter expected. A contract with CRLF or CR line endings reads exactly as
  the same file with LF. Problems are returned, never logged.
- **Fidelity, f01 to f14.** Mapped tokens ship their declared values; shipped
  colors, font sizes, families, line heights, radii and spacing sit in the
  contract; declared font features ship; declared text and background pairs,
  and the primary action pair, meet contrast on shipped values; durations and
  easings (DTCG); interactive target sizes; aliases ship as `var()`
  references; styles use the contract's tokens. Weights: contrast 20,
  typography 18, color 16, tokens 14, spacing 12, shape 8, motion 6, targets
  6. A failing declared pair caps fidelity at 65, a failing primary action
  pair at 70; `uncappedScore` carries the score before the cap. Fewer than 3
  scored checks is "no score" (`nullReason.code: too_few_checks`).
- **Baseline.** The universal checks that read no contract: v02, v03, v05, v07,
  v09, v11, v12, v21, v25, v27, v34, v35, v36, v38, v39, v40, v44 and v45,
  under the accessibility, keyboard, motion, copywriting, identity and
  security groups (static maximum 57), with the accessibility floor, no A
  while any baseline check fails (89.9, as the URL score caps), and the v25
  and v44 ceilings. Each carries a customer-facing `contractTitle` in the
  check registry; legacy surfaces keep `item`.
- **Coverage.** Every declared token located by the token map, by CSS variable
  name, or by value, with counts per group and a hint when under 20% is found.
- **Receipt.** `receipt.own_contract.digest` is a sha256 of the contract as
  read (prose, names and key order do not move it); `receipt.digest` covers
  the fidelity verdicts, then the baseline's.
- **Published formula** at `GET /api/score/checks/own-contract` (version 1.0.1,
  2026-10-14): every check, threshold, weight, ceiling, baseline group and
  null rule. In 1.0.1 a linter problem carries the DESIGN.md linter's sentence
  whole in `linterMessage` (`value` is the offending value), a rejected
  DESIGN.md carries the linter's totals (`linter`), and a problem that
  absorbed a linter finding says so (`linterFinding`). No threshold, weight or
  verdict moved.
- **Limits.** 300 KB per request, 256 KB per contract, linked contracts only
  through the SSRF guard with an 8 s abort, 20 runs a minute and 300 a day per
  IP (failing open, as the edge limiter does). Nothing is cached or stored; a
  contract run counts once under `score-contract:<client>`.

### Not changed

- The npm engine, the CLI and the MCP tools (the MCP keeps its schema; its
  offline engine reports 1.5.0 because legacy verdicts are the same).
- `format=review`, `google` and `canonical` answer 400 `format_unsupported`
  when a `contract` is sent; this mode answers in `format=designesy`.

### Measured (engine 1.5.0)

The calibration corpus (34 fixtures, 47 pinned verdicts) and the offline
golden regenerate with only `engine_version` changed. 86 legacy requests (the
34 corpus pages, one recorded real page and five site fixtures, both scopes,
every format) answer identically under 1.4.1 and 1.5.0, apart from timestamps
and the engine version.

**Engine 1.4.1 and @designesy/score 0.9.1** (npm, published 2026-10-13 as
`score-v0.9.1`). One
check stops failing pages on a word it read in the wrong rule, and one check
is renamed. No check is added, no weight or ceiling moves, and contract v0.4.6
is unchanged. The hosted /score page and API change when the site deploys; the
PyPI server's offline engine carries the v27 change with the next
designesy-mcp release.

**Which grades can move.** v27 can only lose a FAIL or a floor it read from
another rule, so a page moves up where its only sub-16px "field" was in a rule
that styles no field, and down only where its 16px floor was read the same
way (none in the cohort, below).

### Fixed (engine 1.4.1)

- **v27 reads a field keyword only in the rule it is scoring.** The literal
  scan found `input`, `textarea`, `select` or `.field` and then the next rule
  body, and its `[^{]*` ran across a closing brace. So the word "select" in
  `.chip { user-select: none }` carried into `.chip-label { font-size: 12px }`
  and FAILed the page ("1 input(s) below 16px floor: 12px (12px)"), whose
  only field was 16px; now PASS. A keyword in a declaration value carried the
  same way (`--x: var(--selecta)` into `.kicker { font-size: 11px }`), and so
  did the 16px floor test (`--fields: input, textarea` into `.b { font-size:
  1rem }`). Each candidate is now judged by the selector of the rule its
  `font-size` sits in, read back from that rule's opening brace. Class names
  that name a field still count, as before (`.search-input`, `.form-select`,
  `.editableTextarea`): many sites style their fields that way.
  `select { font-size: 14px }` and a real `.number input[type=number]` field
  at 0.875rem still FAIL.
- **v37 is named "DESIGN.md spec-layer validation (DESIGN.md format lint)"**,
  where it read "(Google @google/design.md lint)". Its remediation says "The
  DESIGN.md format's linter (v0.4.0, Apache-2.0) validates the file". Every
  `npm install -g @google/design.md` and `npx @google/design.md` command is
  unchanged. The id stays v37; no stored leaderboard, history or snapshot
  keys on the name.

### Not changed

- **v27's test for a field rule is not narrowed to `isFieldSelector`**, the
  subject test 1.3.1 uses before resolving a `var()` size. Measured on the
  same bytes, that test also dropped real fields that cohort sites style
  through class names: one site's 16px floor on its search box and
  another's 14px textarea, both named only by class.

### Measured (engine 1.4.1)

The calibration corpus (34 fixtures, 47 pinned verdicts) and every existing
input of the offline golden give the same verdict, detail and score under
1.4.0 and 1.4.1, apart from v37's name; the golden gains eight v27 inputs. The
30 leaderboard URLs, each fetched once on 2026-10-13 and scored by both builds
of the npm engine on the same bytes (scope auto-detected; 27 fetched,
three did not answer). Scores move on two sites:

| Cohort site | 1.4.0 | 1.4.1 | Why |
|---|---|---|---|
| cohort site 1 | C | B (+16.1) | v27 FAIL to SKIP: an 11px caption rule was reached from a keyword in the rule before; the page has no field, and the FAIL had pulled accessibility under 60%, which caps a score at 70 |
| cohort site 2 | D | D (+2.8) | v27 FAIL to PASS: a 12px placeholder rule was reached from `user-select` in the rule before; its search field's floor now reads |

designesy.org stays 100 A. A site with a real 14px number field keeps its v27
FAIL, and a site whose v27 FAIL is real keeps it with one fewer size listed.
The other 24 are unchanged. Third-party sites are not named here: the
leaderboard publishes their scores, with dates, at its weekly re-score.

Reproduce: score the URLs in `apps/site/app/leaderboard/seed.ts` with both
builds of `packages/score` (`scoreUrl`, scope auto-detected), fetching each
page once and passing the same bytes to both.

## [1.13.9] — 2026-10-13

**Engine 1.4.0, @designesy/score 0.9.0, @designesy/cli 0.3.1, designesy-mcp 1.13.9,
contract v0.4.6** (npm `score-v0.9.0` and `cli-v0.3.1`; PyPI and the MCP registry
`v1.13.9`). One check is added; no weight, ceiling or existing verdict
moves. The hosted /score page and API change when the site deploys.

### Added (engine 1.4.0)

- **v46, type sizes come from the scale (cadence, WARN only).** v16 asks for
  rem and cannot tell a rem on the scale from one between steps. v46 reads the
  scale from the page's own `:root` type tokens (a name such as `--text-*`,
  `--font-size-*`, `--fs-*` or `--type-*` whose value resolves to a static rem
  or px length; a colour token such as `--text-muted` never counts), takes the
  token values plus their median ratio, and judges every static rem or px
  `font-size`: off the scale beyond 2.5% from every step, under the floor below
  the smallest type token. A `clamp()`, `min()` or `max()` that moves with a
  viewport or container unit is deliberate fluid type and is accepted as
  written; only its lower bound is held to the floor. Relative sizes (em, %,
  keywords) are not judged. Fewer than three type tokens: SKIP. Findings come
  as structured evidence (selector, value, px, issue, nearest step), one per
  rule.
- **Measured on designesy.org:** WARN, 7 sizes under the 12.8px floor and 7
  between steps, of 322 static and 26 fluid sizes; the fluid section titles
  pass. Score unchanged at 100 A.
- The registry grows from 44 to 45 checks, 42 scored. Every "44 checks" claim
  in the READMEs, manifests, Action and MCP descriptions moves to 45.
- designesy-mcp 1.13.9: the offline engine lists v46 as not ported, with its
  reason, and mirrors engine 1.4.0 and contract v0.4.6.

**Engine 1.3.1 and @designesy/score 0.8.1** (npm, published 2026-10-12 as `score-v0.8.1`). Four
checks stop warning on pages that are right, and the npm engine stops
following a redirect loop. No check is added, no weight or ceiling moves, and
contract v0.4.5 is unchanged. The hosted /score page and API change when the
site deploys; the PyPI server's offline engine carries the v27 change with the
next designesy-mcp release.

**Which grades can move.** v26, v27, v38 and v43 move WARN to PASS where the
page was right, so scores move up or not at all, with one exception: v27 now
reads a field whose font size comes from a token, so a field set to a token
under 16px FAILs where it read WARN (carbondesignsystem.com, below). The
redirect limit can only turn a site that redirects more than three times into
"could not read".

### Fixed (engine 1.3.1)

- **v26 skips any face named with the word "fallback"**, not only a name that
  ends in it. A metric-matched stand-in drawn until the real face loads is not
  a typeface choice. designesy.org's "Fraunces Fallback Tuned" (Times New
  Roman under `size-adjust`) was counted: before, "4 families (recommended
  ≤3): fraunces fallback tuned, fraunces, schibsted grotesk, atkinson
  hyperlegible mono" (WARN); after, "3 family/families: fraunces, schibsted
  grotesk, atkinson hyperlegible mono" (PASS). The match is on the whole word,
  so a family called "Fallbackish" still counts.
- **v27 reads `font-size: var(--token)` in a rule that styles a field** through
  the `:root` tokens, before both the below-16px scan and the 16px floor test.
  Before, `input, textarea, select { font-size: var(--text-body) }` with
  `--text-body: 1rem` read WARN ("no explicit input font-size ≥16px
  detected"), though it renders at 16px; after, PASS. A `0.875rem` token
  FAILs ("0.875rem (14px)"). A `var()` that does not resolve reads as before.
  Only rules whose selector styles the field itself are resolved (an `input`,
  `textarea` or `select` element, or the exact class `.input` or `.field`, as
  the subject; not a pseudo-element). Resolving every rule would have read
  designesy.org's card caption `.field-card-meta { font-size:
  var(--text-label) }` (12.8px) as an input below 16px, because v27's literal
  scan matches `.field` anywhere in a selector; that literal scan is
  unchanged.
- **v38 reads keycaps from the markup.** The text of `<kbd>` elements
  (keyboard input, by the HTML definition) is dropped before the verb check,
  as `aria-hidden` content already was, with any "+" left between them.
  designesy.org's flip button, `<kbd>ctrl</kbd> <span
  aria-hidden="true">+</span> <kbd>i</kbd>` after a hidden "Flip to the
  flame:", WARNed as "Flip to the flame: ctrl  i"; it now reads "Flip to the
  flame:" and PASSes. A button whose only text is keycaps is judged as an
  icon-only button is: by its aria-label, or not at all. In plain text, a
  "+key" hint is now stripped in any case ("ctrl+k", "Save ctrl+s"), when the
  modifier stands as its own word. Text is not otherwise read as keycaps:
  "Shift A", "Alt text" and "Option 2" are labels, as in 1.3.0, and "Find⌘K",
  "FindCtrlK" and "Save Ctrl+S" read as before.
- **v38 knows get, set and try.** The check's own comment said "Get X", "Set
  X" and "Try X" were allowed, but none of the three was in the verb list, so
  "Get started" and "Try it free" WARNed on every site. Added with them, each
  justified in the source as a verb when it leads a button label: flip, learn,
  sign (in, up, out), join, expand, select, read. Left out because they are
  common nouns too: switch, watch. explore, collapse, toggle, choose and
  compare already passed by their ending. v38 stays a WARN-only heuristic.
- **v43 counts `--destructive` as the error role**, the name shadcn/ui gives
  it. Before, a shadcn theme with `--success`, `--warning`, `--destructive`
  and `--info` found 3/4 families and reported error missing; after, 4/4.
- **The npm engine follows at most three redirects.** `httpsFetch` re-checked
  each redirect target against the SSRF guard but counted nothing, though its
  comment said "Follow up to 3 redirects", so a redirect loop recursed without
  end. A fourth redirect now fails closed, as a refused target does, and a
  response reached through a redirect reports `redirected: true` with the last
  hop's URL. The hosted route fetches through `safeFetch`, which already
  stopped at five.

### Not changed

- **v42 is unchanged.** Tailwind CSS v4 writes only the theme variables a
  project uses ("only used CSS variables will be generated in the final CSS
  output", tailwindcss.com/docs/theme), so the 226 hue-named colour tokens
  x.com ships are tokens its stylesheet uses, and v42's WARN on it is right.

### Measured (engine 1.3.1)

The calibration corpus (32 fixtures), the recorded parity page and every
existing input of the offline golden give the same verdict, detail and score
under 1.3.0 and 1.3.1; the golden gains eleven v27 inputs. The 30 leaderboard
URLs, each fetched once on 2026-10-12 and scored by both builds on the same
bytes (scope auto-detected; 26 fetched, nytimes.com, getdesy.com,
awwwards.com and cssdesignawards.com did not answer). Scores move on two sites:

| Site | 1.3.0 | 1.3.1 | Why |
|---|---|---|---|
| wikipedia.org | 83.8 B | 84.7 B | v38 WARN to PASS: "Read Wikipedia in your language" leads with a verb |
| carbondesignsystem.com | 82.8 B | 81.8 B | v27 WARN to FAIL: `.cds--number input[type=text]` takes `var(--cds-body-compact-01-font-size)`, 0.875rem in its `:root`, and the page's search field is 14px too |

www.designesy.org stays 100 A (it was already at the clamp); its v26, v27 and
v38 move WARN to PASS. v38's detail lists fewer flagged labels on linear.app
(38 to 37), zeroheight.com (7 to 4), radix-ui.com (2 to 1, "Sign in") and
github.com (11 to 9), with the verdict still WARN. The other 19 are unchanged.

---

**Engine 1.3.0 and @designesy/score 0.8.0** (npm, published 2026-10-12 as `score-v0.8.0`). A page
with a failing check can no longer score an A. The hosted MCP tools and
/api/monitor change when the site deploys; the PyPI server's own code (the
offline engine, the accessibility kit's Python twin) ships with the next
designesy-mcp release. Contract v0.4.4 is unchanged.

**Grades: any FAIL now caps at B.** If a CI gate of yours requires an A and
needs time to adjust, pin the previous engine while you fix the failing
checks: `npx @designesy/score@0.7.2 <url>` on the command line, or
`engine-version: 0.7.2` in designesy/score-action (v1.2.0 or later). The
hosted /score page and API always run the current engine.

### Changed (engine 1.3.0)

- **No A while any check FAILs** (decided 2026-10-11). Any FAIL caps
  the score at 89.9, a B at most, and `hardFailCeilingReason` says which
  checks failed ("A FAIL caps the grade at B: v11 fails, ..."). The specific
  ceilings stay lower and win where they apply. Every cap runs after the
  originality lift, so the lift can carry a score up to a cap and never past
  one. Before, a page could score 100 / A beside its own FAIL verdicts, and
  the review printed **Block** and **Grade A** together.
- **v44 caps at 65**, as v06 does: both are measured WCAG contrast failures
  on text. The status-text page the core-logic audit built (status word
  `#b07d04` on white at 3.63:1) scored 100 / A; it scores 65 / D.
- **v34 FAILs only a positively identified AI chat surface**: a container or
  input that names itself a chatbot or an AI assistant, or a chatbot,
  AI-widget or Dialogflow script, with no disclosure. Live-chat vendors
  (Intercom, Drift, Zendesk, LiveChat, Tawk, Crisp), a generic chat container
  or "assistant" script, and page text about AI WARN "possible AI surface:
  review". The word "gpt" no longer counts, so Google Publisher Tag
  (`gpt.js`, an ad tag) is not an AI surface. The detail says Article 50(1)
  "may require" a disclosure and names the duty as the AI system provider's.
- **v06 and v22 read CSS Color 4**, through the parser v44 already used:
  `oklch()`, `oklab()`, space-syntax `rgb()` and `hsl()`, hex of 4 and 8
  digits, `color-mix()`, `light-dark()` (light side) and `var()` fallbacks.
  Translucent text is composited over the paper under it. Before, a sheet
  written in `oklch()` SKIPped both checks, and a page with text at 1.58:1
  scored 100 / A. Where a sheet declares `--muted-foreground`, v06 measures
  it as the muted text: in the shadcn convention `--muted` is a surface.
- **Tokens declared as `:root, :host { }`** (the block Tailwind v4 writes its
  theme into) are extracted. Before, such a sheet extracted no tokens.
- **v42 and v43 follow `var()` aliases**, and a palette that role tokens alias
  is not a hue vocabulary. `--error: var(--red-700)` counts as a role-named
  colour token (it was dropped, which inverted the verdict for the structure
  v42's own remediation recommends). Hue-named primitives that a role token
  reaches through its aliases are the palette layer and leave v42's role
  share; a hue-named token no role token references still counts against it.
  This is the two-tier structure DTCG 2025.10 (§3.8 aliases), Spectrum
  (primitive tokens "are typically used indirectly through semantic tokens as
  an alias") and Primer (base tokens "are generally used as a reference for
  functional tokens") describe.

### Fixed (engine 1.3.0)

- **v34 citations.** California's bot-disclosure law is SB 1001 (Bus. & Prof.
  Code §§17940-17943); AB 2659 (2023-24), cited before, is a salvageable
  personal property bill. Colorado SB 24-205 was repealed and re-enacted by
  SB 26-189 (signed 2026-05-14, obligations from 2027-01-01), which governs
  automated decision-making in consequential decisions; "Colorado AI Act (Feb
  2026)" was stale. EU AI Act Article 50 applies from 2026-08-02.
- **A colour value named like an Object.prototype key** (`constructor`,
  `toString`) threw inside the colour parser and failed the whole score; it
  now reads as unresolvable.

### MCP tools and the offline engine

- **The offline engine grades on the live bands**, A 90, B 80, C 70, D 60
  (it used 95, 85, 75, 60: 92% read B), applies the 89.9 cap on a FAIL, and
  reads colour and `:root, :host` tokens as the live engine does.
- **`designesy_a11y_score`** (hosted and PyPI): the generated Playwright
  script runs `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`; `wcag22aa`
  alone selected one axe-core rule (`target-size`). A page where no rule
  applied is "not scored" instead of grade F. With a `config` the script
  threw "axe is not defined"; it now passes axe-core's source with the
  `axe.configure()` call to AxeBuilder as `axeSource`. The accessibility
  contract moves to 0.1.2 (a01 and the ruleset text).
  The `url` argument is written into the script as a string literal; a quote
  in it used to end the literal and turn the rest into code.
- **`designesy_monitor_score`**: m01 is "History supplied" (PASS with at
  least one earlier run, SKIP on a first run, which is then not scored)
  instead of an unconditional PASS; the alert email no longer says the URL
  was registered. The monitor contract moves to 0.1.2.

### Measured (engine 1.3.0)

The 30 leaderboard URLs, each fetched once on 2026-10-11 and scored by the
1.2.0 build and this one on the same bytes (scope auto-detected; 27 fetched,
nytimes.com, getdesy.com and cssdesignawards.com did not answer). Grades move
on four sites, scores on eight:

| Site | 1.2.0 | 1.3.0 | Why |
|---|---|---|---|
| primer.style | 90.4 A | 89.9 B | v11 and v13 FAIL: the 89.9 cap |
| github.com | 70 C | 65 D | v44 FAIL (status text): the new 65 ceiling |
| x.com | 90.2 A | 86.7 B | its theme is a `:root, :host` block, read for the first time: v42 finds 5 role-named against 226 hue-named colour tokens, and no role token aliases any of them (197 are referenced straight from the stylesheet's rules); v43 finds no ok/warn/error/info |
| stripe.com | 67.9 D | 70 C | v42 WARN to PASS: with aliases followed it counts 226 role-named against 59 hue-named colour tokens; 39 hue primitives that role tokens alias are the palette layer |
| vercel.com | 84.6 B | 81.1 B | as x.com: 1 role-named against 12 hue-named, v43 no status families |
| designesy.ai.studio | 77.5 C | 74.5 C | its 25 Tailwind hue tokens are read, no role token aliases them, all 25 are used straight from its rules |
| carbondesignsystem.com | 81.6 B | 82.8 B | v06 and v22 SKIP to PASS: its `oklch()` tokens are measured (`--muted-foreground` 4.73:1) |
| fwa.org | 51.5 F | 54.6 F | v42 SKIP to PASS: 13 role tokens that alias colours now count |

The other 19 scores are unchanged. No v34 status changes on any of the 27.

---

**@designesy/score 0.7.2** (npm), released on its own (`score-v0.7.2`). The
engine reports design contract v0.4.4, the version designesy.org serves; 0.7.1
reports v0.4.3. Engine 1.2.0 and its 44 checks keep their number.

### Changed

- **The engine reports contract v0.4.4.** `contractVersion` in the default
  output and `tool.version` in `--format canonical` read `v0.4.4`. v0.4.4 is
  the identity v1 colour system: Azure `#0A94FF` as `--signal`, Deep Azure
  `#016ABB` for light-theme text, links and focus, and ink `#010102` on an
  Azure fill; a new `--paper-white` (`#FFFFFF`, both themes) for every use
  that means white; the instrument pass gradient and inspection head
  (`--lv-pass-a` `#36A7FF`, `--lv-pass-b` `#0A94FF`, `--lv-head` `#36A7FF`
  dark and `#0A94FF` light) in the Azure family; grade D in rose, with light
  `--grade-d-ink` `#BE1F67`. The contract changes token values only: no
  check, weight or verdict.
- **v22 measures a declared primary action pair.** Merged with identity v1
  and first published here: a contract that declares both `--action` (the
  fill) and `--on-action` (the label) is measured on that pair, the one the
  button paints, so a better-contrast token elsewhere cannot stand in for a
  label that fails. Without both tokens v22 keeps the 0.7.1 reading, the
  better of `--paper` or `--ink` on `--signal`, so a site that declares
  neither scores as before. The site engine has run the same rule since the
  identity v1 merge; the engine version stays 1.2.0. For designesy.org the
  packed 0.7.2 and the published 0.7.1 agree on every verdict: v22 PASS at
  6.65:1 (now read as `--on-action` on `--action`), 40 PASS, 1 WARN, 3 MANUAL.

## [1.13.8] — 2026-10-11

**designesy-mcp 1.13.8** (PyPI, MCP registry, hosted `/api/mcp`): `designesy_tokens_score` counts a warning the way every other Designesy score does and reads DTCG aliases as references, and the site's own `/export/dtcg` holds DTCG values only.

### Changed

- **`designesy_tokens_score` counts a WARN as half a point.** It counted 0,
  while `designesy_motion_score`, the score engine and the npm
  `@designesy/tokens` validator count 0.5, so one file graded differently
  depending on which tool read it. The rule is now PASS=1, WARN=0.5, FAIL=0,
  SKIP not scored, stated in the result's `scoring`, the tool description and
  the tokens contract, which moves to 0.1.2 because its published rule
  changed. A file with 8 PASS, 1 WARN and 1 SKIP scores 94 (it scored 89).

### Fixed

- **Aliases are references, not values.** The validator read a DTCG alias
  such as `{space.16}` on a dimension token as a literal with no unit, so a
  file that aliased its dimensions got a WARN in t08 and another in t10. t08
  now checks the value an alias resolves to (through chains, `$root`
  included); an alias that resolves to nothing, loops, or names a token of
  another type is reported as such in t08, and an alias is never a deprecated
  pattern in t10. On www.designesy.org the token file `designesy_guardrails`
  emits goes from 78 (t08 and t10 WARN on `grid.gutter = {space.16}`) to 100.
- **`$root` tokens are checked.** The validator skipped every `$`-key, so a
  group's `$root` token (the 2025.10 name for a group's own value) was never
  counted. It is now a token at `group.$root`; the guardrails file for the
  test site counts 23 tokens where it counted 18.
- **The 2025.10 dimension form is read.** A dimension written
  `{ "value": 16, "unit": "px" }` was not looked at by t08; it is now, and
  its unit is checked.
- **`/export/dtcg` holds DTCG values only.** Seven `$value`s were CSS `var()`
  (the three interaction colors, such as `focus_ring = var(--signal-light)`,
  and the four font stacks), the five radii were strings such as `"6px"`, and
  each shadow held a CSS color string and lengths such as `"0"`. A var() that
  names a token the file exports is now the alias to it
  (`{color.signal.light}`, `{fontFamily.serif}`); font stacks are arrays of
  family names, with `var(--font-*)` replaced by the face next/font loads
  under it (checked against the contract's role text); dimensions and shadow
  lengths are `{ value, unit }`; shadow colors are structured. A contract
  value with no DTCG form now fails the build instead of shipping. The export
  still scores 100 (9 PASS, 0 WARN, 0 FAIL, t07 SKIP). Contract data the
  format cannot type stays verbatim in `$extensions.designesy`, as before.
- **Design-system contract header.** The comment named v0.4.2 and `updated`
  read 2026-10-04, before the 0.4.3 entry of 2026-10-09; both now match 0.4.3.
  Neither is hashed by the contract lock, and no contract value changed.

### Gates

- `scripts/check-mcp-accuracy.js` adds `tokens-warn-half`, `tokens-alias`
  and `export-dtcg`; on the previous main they report 20 findings.
- The shared tokens golden gains `aliases.json` and `alias-unresolved.json`,
  and `site-export.json` and `contract.json` are regenerated from the site.

## [1.13.7] — 2026-10-10

**designesy-mcp 1.13.7** (PyPI, MCP registry, hosted `/api/mcp`): six tools now return what their descriptions promise, and two tools no longer disagree about one page. Found by a tool-by-tool re-test of 1.13.6.

### Fixed

- **`designesy_a11y_score` checks carry their names.** The description
  promises `checks[{id, name, status}]`; the hosted tool returned
  `{id, status}`, because it read `name` from contract rows that keep the
  name under `item`. Each check is now `{id, name, status}` with the a11y
  contract's own name for its id. The hosted tool reads the contract module
  this deployment serves, typed, so a field the rows lack no longer compiles.
  The PyPI server already returned the names.
- **`designesy_guardrails` and `designesy_drift_score` use one definition of
  a fabricated token.** On www.designesy.org guardrails documented 158
  fabricated tokens while drift's d02 found none. Guardrails counted every
  `var()` name missing from a `:root` block, so references with a fallback,
  properties declared on a component and properties set in `style`
  attributes all counted. Both tools now call one function in the drift
  module: a property is fabricated when it is referenced with no fallback and
  declared nowhere. On www.designesy.org guardrails now documents 0, and its
  g05 total falls from 557 to 399.
- **`designesy_tokens_score` leaves SKIP out of the score.** A clean file
  whose t07 had no custom types to check scored 90, because the score was
  PASS / all ten checks x 100. It is now PASS / scored checks x 100 (WARN and
  FAIL still count 0), the result adds `skip_count` and a `scoring`
  statement, and the description states the rule, as `designesy_motion_score`
  does. The site's own `/export/dtcg` scores 100 (it scored 90). The tokens
  contract (0.1.1) states the new rule. The ten checks moved into
  `apps/site/app/lib/tokens-score.ts` with a line-for-line port in the PyPI
  server, and both produce one golden: the PyPI server now names each check
  with the contract's name (it used short names of its own) and writes the
  hosted server's detail text.
- **`designesy_guardrails` emits a valid DTCG 2025.10 token file in the
  site export's form.** It carried a `$schema` the export does not use,
  aliases written as CSS variables (`{--muted-dim}`), bare hex colors, the
  non-DTCG types `spacing` and `string`, and a `$meta` root key, and it
  dropped a property whenever another one needed its name as a group. It now
  uses the export's `$schema`, `{colorSpace, components, alpha}` colors,
  `{group.token}` aliases that resolve, `$root` for a property that is also a
  group, and DTCG types only; values the format cannot type are kept verbatim
  in `$extensions.designesy.css`. On www.designesy.org: bare hex 27 to 0,
  CSS-variable aliases 26 to 0, non-DTCG types 112 to 0, dropped properties
  24 to 0, and the server's own tokens validator 60 with a t05 FAIL to 78
  with no FAIL (t08 and t10 WARN on one dimension alias, `{space.16}`, which
  the validator reads as a value with no unit). On the 22 reachable leaderboard sites that declare `:root`
  tokens, the emitted file failed that validator on 19 and now fails it on
  none. Structured values make the result larger (designesy.org 89,963 to
  108,942 characters; 26 sites measured, about 7 KB to about 530 KB), and
  the descriptions state the new sizes. The export and guardrails share the
  schema URL and the color parser (`apps/site/app/lib/dtcg.ts`); the export's
  output is unchanged.
- **`designesy_monitor_score` m09 reports the design contract version.** It
  read the scanned site's `agent.json` version, which on www.designesy.org is
  the catalog's (0.1.7), while `designesy_score` reported v0.4.3. m09 now
  reports the version `/api/score` reads from the contract module. The
  monitor contract (0.1.1) describes m09 that way.
- **`designesy_compare` rounds its score delta.** It printed
  `15.400000000000006` for scores of 100 and 84.6. The delta and both scores
  are rounded to two decimals, as the tool's contrast figures already were.
- **The acoustic-tokens version reads from its module.** The catalog's
  machine-export line and the export's download name said v0.1.1 while
  `acoustic-tokens.ts` and `/acoustic-tokens.json` serve 0.2.0 (its version
  history ends at 0.2.0, the extended cues). Both now read the module's
  version, as do the catalog lines for the tokens, a11y, motion and
  components contracts.

### Added

- **`scripts/check-mcp-accuracy.js`** (build and CI): runs the real route
  modules offline on a made-up site and holds the six tools above to their
  descriptions and to each other. `--measure <url>` prints what guardrails
  and drift report about one live page. Its loader,
  `scripts/lib/route-harness.js`, transpiles the site's TypeScript and stubs
  only the network, so the same check can run against another checkout.
- **`check-catalog-version-binding.js` reads the machine-export lines.** A
  line that states a version must state the one its export serves.

## [1.13.6] — 2026-10-10

**designesy-mcp 1.13.6** (PyPI, MCP registry, hosted `/api/mcp`): `designesy_motion_score` reports each verdict under its own check, `designesy_report` and `designesy_guardrails` take an option that returns less, and the drift engine stops counting fallbacks and style-attribute declarations as fabricated tokens (Anthropic Software Directory Policy 2B, 5B).

### Fixed

- **`designesy_motion_score` verdicts sit under the right check (policy 2B).**
  The tool computed ten checks of its own (required fields, version, frame
  rate, dimensions, layers, in/out points, markers, deprecated layers, a §16
  placeholder, schema) and named them with the motion contract's m01-m10 by
  array position. The contract's checks are different, so every verdict sat
  under another check's name: on a file with zero layers, no markers and no
  meta, "meta object present" FAILed with "layers: 0", "markers array present"
  PASSed with "w: 100, h: 100", and m09 listed the ten standards as ", , , ,"
  because it read fields the contract does not have. Both servers now run the
  contract's ten checks, each under its own id and the contract's name for it:
  m01 the schema's top-level animation object, m02 the required fields, m03 no
  4.x Bodymovin version, m04 a markers array, m05 a meta object, m06 a
  reduced-motion path (a marker or slot named for it, or a meta note of an
  external wrapper), m07 keyframe easing (linear, ease and ease-in fail), m08
  duration within 300 ms, and m09 and m10, which concern the page that embeds
  the file. A check a file cannot settle returns SKIP with the reason, never a
  PASS: m01 does not validate layer contents, so a clean file is SKIP, and m09
  and m10 cite their standard by number and rule from the contract. The score
  now follows the contract (WARN counts 0.5, SKIP is not scored), the result
  adds `skip_count` and `scoring`, and `validator_note` points at the schema
  URL that exists (the old one was a 404). The hosted tool reads the contract
  this deployment serves instead of fetching it from production.
- **The drift engine's d02 and d12 stop failing on properties nobody
  fabricated.** On www.designesy.org d02 (No fabricated tokens) and d12 (Token
  alias chains resolve) FAILed on 13 properties. Of the 29 undeclared names on
  the home page, 24 are always referenced with a fallback, `var(--x, 4px)`,
  and 5 are declared in `style` attributes by React style objects; none is
  referenced bare and declared nowhere. d02 now counts a property as
  fabricated only when it is referenced with no fallback and declared nowhere:
  not in a stylesheet, a `<style>` block or a `style` attribute. d12 reads
  each chain whole, so one that ends in a fallback (`var(--x, var(--y, 4px))`)
  resolves and one that ends in an undeclared property still dangles; it also
  no longer reads a reference inside another `var()`'s fallback as a chain of
  its own. d11 counts a property set in a `style` attribute as declared. A
  property referenced bare and declared nowhere still FAILs. `/api/drift` and
  `/api/monitor` read the attributes through one shared function and pass them
  to `runDriftChecks`, so the two engines agree. On the leaderboard cohort
  (27 of 30 sites reachable), drift and monitor scores move on 5 sites and no
  others: www.designesy.org 83 to 100, atlassian.design 67 to 88,
  designesy.ai.studio 75 to 83, stitch.withgoogle.com 63 to 67, linear.app 42
  to 46. The leaderboard ranks by `/api/score` alone and does not move; the
  report composite moves by 0.3 of the drift change.

### Added

- **`designesy_report` takes `detail` (policy 5B).** The full result is about
  75 to 100 KB of JSON on the ten sites measured (designesy.org 100,166
  characters), because it carries each engine's whole result beside the merged
  check list. `detail: "summary"` returns the same keys with fewer rows: the
  composite, the totals, each engine's score, grade and counts, and only the
  checks and synthesis entries that did not PASS, plus `omitted` counting what
  was left out (designesy.org 3,773 characters; 4 to 31 KB across the ten
  sites). `"full"`, the default, returns what the tool always returned.
- **`designesy_guardrails` takes `parts` (policy 5B).** The full bundle grows
  with a site's token count: about 10 KB to about 500 KB on the ten sites
  measured (designesy.org 89,963 characters). `parts`, a list of bundle file
  names (`tokens`, `lintConfig`, `agentRules`, `componentContract`,
  `antiPatterns`, `designMd`), returns only those files and keeps the score,
  grade, counts and checks. An unknown name, an empty list or a value that is
  not a list of strings returns an error (`isError: true`) listing the valid
  parts, before the engine runs, as `designesy_contract`'s `sections` does.
- **The two servers' motion checks and trimming are gated.** The PyPI suite
  (`test_motion_score.py`, `test_trim.py`) and `check-mcp-tool-parity.js` run
  their own implementation on the same Lottie fixtures and captured results
  and compare with one golden file each; the gate also checks that the
  fixtures' contract is the one the site serves.
- **d02 and d12 are checked on fixture pages.** `check-d02-coverage.js` runs
  ten pages through the shared drift checks, assembled the way `/api/drift`
  assembles them, including true positives that must still FAIL.

## [1.13.5] — 2026-10-10

**designesy-mcp 1.13.5** (PyPI, MCP registry): no result or error the PyPI server returns carries a local file path.

### Fixed

- **The PyPI server scrubs local paths from what it returns.** A caught
  error's text could carry the file system of the machine running the server:
  the browser-probe errors (v02, v21), a failed `/api/score` call and the
  JSON-RPC error messages quoted the exception as raised, path included.
  `_scrub_local_paths` replaces absolute paths (a drive letter, a UNC share, a
  POSIX home, temp or system root), `file://` URLs and npm cache segments with
  "a local path", "a local file" or "the npm cache", keeps the clause that
  says what failed, and runs on every offline check detail too. It mirrors
  `sanitizeErrorText` in the TypeScript engines, and
  `test/test_error_text.py` shares their cases.

### Also merged since 1.13.4

**@designesy/score 0.7.1** (npm), released on its own (`score-v0.7.1`).
Engine 1.2.0, unchanged: no check, verdict or weight changes. Under `npx`, v37
now runs the way it already runs on designesy.org, and no result carries a
local file path.

- **v37 runs under `npx @designesy/score`.** The engine lints a site's
  `/DESIGN.md` with Google's `@google/design.md` linter, but 0.7.0 did not
  declare the package, so under `npx` the import failed and v37 reported
  MANUAL for every site that serves a DESIGN.md. 0.7.1 declares
  `@google/design.md` 0.4.0 (Apache-2.0), the version the hosted engine runs,
  as an optional dependency, which npm installs by default. For designesy.org
  the CLI now returns what the site returns: 41 PASS and 3 MANUAL (v02, v04 and
  v21, which need a browser), where 0.7.0 returned 40 PASS and 4 MANUAL. An
  install that omits optional dependencies keeps the 0.7.0 behaviour for v37
  (MANUAL, weight 0). The package's README and description no longer say
  "zero dependencies": the engine needs none, and this one is optional.
- **No result carries a local file path.** 0.7.0's v37 detail quoted Node's
  error verbatim, including the absolute path of the npm cache it ran from,
  and with it the name of the account that ran the CLI. Both engine copies now
  pass every check detail, and the site's 502 error text, through one shared
  `sanitizeErrorText`: absolute paths (a drive letter, a UNC share, a POSIX
  home, temp or system root), `file://` URLs and npm cache segments become "a
  local path", "a local file" or "the npm cache", and the clause that says
  what failed stays ("Cannot find package '@google/design.md' imported from a
  local path"). The source-drift gate compares the function and the
  orchestrators' call to it. `test/error-text.test.mjs` pins the cases, each
  failing with the sanitiser removed.

## [1.13.4] — 2026-10-10

**designesy-mcp 1.13.4** (PyPI, MCP registry, hosted `/api/mcp`): tool output reads as reference data, `designesy_contract` returns only the sections you ask for, and every description matches what its tool returns (Anthropic Software Directory Policy 2B, 2F, 5B).

### Changed

- **The document tools return labeled reference data, never an agent prompt
  (policy 2F).** `designesy_llms_txt`, `designesy_llms_full_txt`,
  `designesy_agent_json` and `designesy_skill_md` now return JSON:
  `{ kind: "published_document", source_url, media_type, note, ... }`, with
  the published text in `content` (or the published object in `document`).
  Any part written as steps or a prompt for an AI agent is left out and named:
  a markdown section keeps its heading and its body becomes a one-line marker
  (listed in `omitted_sections`), and a JSON field is removed (listed in
  `omitted_fields`). Today that is the ingest steps of `/llms.txt`, the ingest
  protocol, the "Agents:" usage line and the paste-ready agent prompt of
  `/llms-full.txt`, and `ingest.steps` of `/.well-known/agent.json`. The
  published files are unchanged; only what the tools return changed. Until
  now a tool result could carry "You are working with Designesy..." and "If
  machine_url is present, fetch it for structured rules", which, inside a
  conversation, read as instructions to the assistant.
- **`designesy_design_review` returns the rubric without the kit's agent
  prompt.** The result is `{ kind: "review_rubric", source_url, note, kit,
  when_to_use, required_inputs, dimensions[8], output_format,
  verification_checklist, anti_patterns, rationalizations, kit_prompt_url,
  kit_prompt_note, omitted_fields }`, plus `inputs` when artifact, purpose,
  context or rules are passed. The prompt told its reader to fetch the machine
  kit and contract "for structured rules"; everything a review needs from it
  is already a field here, and a person can still copy it from
  `kit_prompt_url`. This also fixes the hosted tool's filled form, which mapped
  each dimension to fields the kit does not have (`name`, `question`,
  `weight`) and returned eight empty objects, and the PyPI tool's, which
  replaced placeholders the prompt does not contain and defaulted `rules` to
  contract v0.3.0.

### Added

- **`designesy_contract` takes `sections` (policy 5B).** The full contract is
  about 100 KB of JSON (roughly 25k tokens) and the only way to trim it was one
  named section. `sections`, a list of top-level keys, returns `id`, `version`
  and only those keys. The default is still the full contract, and `section`
  still returns `{ section, data }`. An unknown name, an empty list, or a value
  that is not a list of strings returns an error (`isError: true`) naming the
  unknown keys and listing every valid one; the PyPI server's unknown-section
  reply used to be a success.
- **The two servers' reference-data output is gated.** The PyPI suite
  (`test_reference_data.py`) and `check-mcp-tool-parity.js` run their own
  implementation on the same published-document fixtures and compare with one
  golden file, and both check that the two directive patterns are the same.

### Fixed

- **Descriptions match what the tools return (policy 2B).** `designesy_llms_txt`
  said "~500 tokens" for a brief of about 6,900 characters (about 1,700
  tokens), and `designesy_llms_full_txt` "~3000" for about 16,000 characters.
  Both now state ranges that hold ("a few thousand characters", "over ten
  thousand"). `designesy_contract` said "cached ~24h server-side" while the
  servers cache it for 5 minutes; the hosted description now derives the
  contract's size and key list from the contract it serves.
  `designesy_agent_json` named keys the document does not have
  (`ingest_protocol`, `package_index`, `permission_policy`,
  `citation_templates`). `designesy_tokens_score` and `designesy_motion_score`
  promised a `valid` field neither returns and left SKIP out of the statuses.
- The docs page (`/docs/mcp`) and both READMEs describe the new output.

## [1.13.3] — 2026-10-09

Released together: **engine 1.2.0** (designesy.org, `/api/score`, the MCP
endpoint), **@designesy/score 0.7.0** (npm), and **designesy-mcp 1.13.3** (PyPI,
MCP registry). Headlines: two checks found on this site, v44 and v45, join every score; the S2 and S8 anti-slop rules stop
firing on components and prose; the npm engine's accessibility floor matches
the site's. Contract mode moves to engine 1.3.0.

### Added

- **Engine 1.2.0: v44 and v45, two defects this site shipped and fixed.**
  `ENGINE_VERSION` is now `1.2.0`. Both engine copies carry the identical change
  and the source-drift gate reports them in agreement.

  - **v44 (accessibility): status colors used as text meet contrast in every
    declared theme.** A color picked to mark a state (a dot or a bar, where 3:1
    is enough) gets reused to write the word for that state, which needs 4.5:1.
    On designesy.org the light `--warn` #b07d04 painted status words at 3.51:1
    on #fbfbfc; mixed toward the ink, `color-mix(in oklab, var(--warn) 70%,
    var(--ink))`, it paints #7f5e21 at 5.76:1. The check measures every
    `color` that reads a status color (directly, through one alias, or at
    reduced alpha) in every theme the stylesheet declares (`:root`,
    `[data-theme]` and `.dark`/`.light` blocks, including attribute
    combinations, and `prefers-color-scheme` blocks). A theme named by part of
    a compound theme selector also reads that compound's tokens before the
    root's: primer.style declares its dark `--fgColor-danger` only under
    `[data-color-mode=dark][data-dark-theme=dark]`. It resolves `var()`
    chains, `color-mix()` in srgb, oklab and oklch (rounded to the 8-bit color
    a browser paints), `light-dark()` and relative color syntax.
    It measures on a surface the stylesheet attests: the rule's own background,
    another rule's for the same element, or the nearest ancestor compound's in
    the same selector (a `:hover` ancestor's own fill, else its fill without the
    state), with translucent fills composited over the next surface out, else
    the theme's page background. When an ancestor in an interactive state
    (hover, active, focus, checked, expanded, selected, open) paints no fill
    the stylesheet declares, the surface is unresolved and the finding WARNs at
    most: v44 never FAILs a pairing it cannot attest. Text needs 4.5:1, large
    text (24px, or 18.66px bold) 3:1. A non-text use is a graphic under WCAG
    1.4.11 and needs 3:1: an svg subject, a class whose role word is icon,
    octicon, glyph, spinner or indicator (or an `icon-`/`octicon-` prefix), a
    progress or meter bar, a color named for an icon (`--button-danger-iconColor`),
    or an element that paints its own background with `currentColor`. Only a
    color named as a status (ok, success, warn, warning, error, danger, fail,
    destructive, info, grade-a to grade-f) can FAIL, and only where it
    resolves to a hue (Oklch chroma 0.06 or more). White, grey or near-grey
    text under a status name (a counter or a keyboard hint on a danger button)
    WARNs at most, with its ratio kept: it is a general text-contrast miss, not
    a status color. A hue that counts only
    because the stylesheet also paints it as a fill or border WARNs at most,
    because its real surface is often a fill on an ancestor that a static
    reading cannot see. Disabled states are exempt, as WCAG 1.4.3 exempts
    inactive controls. SKIP when no status color is used as text. Results carry
    `evidence`: up to 20 measured uses (selector, token, theme, color,
    background, ratio, threshold) and a count of the rest. A ratio that misses
    its threshold by less than a rounding step is shown rounded down (4.49, not
    4.50, against 4.5).
  - **v45 (motion): pausing motion keeps content visible.** A site-level pause
    (`animation-play-state: paused` on every element, under an attribute or
    class on the document or inside `prefers-reduced-motion: reduce`) holds
    each animation on its current frame. An entrance whose first keyframe is
    opacity 0 is then held invisible; on designesy.org a paused visitor got
    empty pages. Each one-shot entrance that the pause holds must end or be
    removed under it: `animation: none`, `animation-play-state: running`, or a
    negative `animation-delay` at least as long as the animation (the site uses
    -3600s). FAIL without one, WARN when the override's selector or scope does
    not clearly match, SKIP when no rule pauses every element.

  **Legacy scores gain both checks.** A request without a
  contract returns what engine 1.1.0 returned except for v44 and v45. The
  registry grows from 42 to 44 checks, and 39 to 41 of them are scored.
  Category weights are unchanged (accessibility 15, motion 10, of 117), so each
  accessibility check now carries 15/7 = 2.14 points where it carried 2.5, and
  each motion check 2.0 where it carried 2.5. A SKIP leaves a score where it
  was.

### Fixed

- **S2 and S8 stopped deducting for components and prose.** designesy.org lost
  10 points to them, every one a false positive.
  - **S2, "Full-page gradient background"**, counted `inset: 0` as full-bleed,
    but `inset: 0` fills the nearest positioned ancestor. All three hits on
    designesy.org were components: a 1px window sheen, a cell fill and a heatmap
    bar. A gradient now needs viewport evidence: it is painted on `html`, `body`
    or `:root`, or the rule is `position: fixed` and pinned to all four edges,
    or it is sized in viewport units. `border-radius: inherit` marks a
    component, and a gradient sized to 1px by `background-size` is a hairline.
  - **S8, "AI-pill badge text"**, matched the whole HTML with no word boundary,
    so "Generate" matched "generates" and "AI-generated", and it read the
    framework's `<script>` payload, counting each sentence twice. It now strips
    `<script>`, `<style>`, `<template>` and comments, matches whole words, and
    counts only the text of a pill: an element whose class or role names a
    badge, pill, chip, tag or CTA, a button, or a link, holding 40 characters
    or fewer. A real "AI-powered" badge still counts.
- **The npm engine's accessibility floor matches the site's.** The site caps a
  score at 70 when the accessibility category is under 60% (WARN counts half),
  as /methodology documents. `@designesy/score` capped at 70 on any
  accessibility FAIL, so the CLI scored some pages lower than the site (with
  v44, primer.style 70 in the CLI against 89.8 on the site). The score
  arithmetic is now one function, `scoreArithmetic`, in both copies, and the
  source-drift gate compares it and each orchestrator's call to it; a test
  re-introduces the old floor in one copy and requires a finding.
- **Scores carry one decimal, without float noise.** The shared score
  arithmetic subtracted a fractional slop total and added the originality lift
  without rounding, so a page weighted 72.6 with 20 points of slop and a +4
  lift scored 56.599999999999994 in both engines. It now rounds to one
  decimal, the precision scores are shown at, after both steps. No cohort
  score moves by more than that noise.
- **`@designesy/score` reports the current contract.** `CONTRACT_VERSION` read
  `v0.4.1` in 0.6.0 while the site served v0.4.3. It reads `v0.4.3`, and a
  test now compares it with the site's contract source.

### Changed

- **`@designesy/score` 0.7.0 (npm)** ships engine 1.2.0. The package exports
  one new type, `CheckEvidence`, and `CheckResult` gains an optional `evidence`
  field (additive). The v24 hard-fail ceiling
  reason now matches the site's wording.
- **`designesy-score` (npm) stays retired.** It is not republished; its
  deprecation notice now points to `@designesy/score` with 44 checks and
  contract v0.4.3.
- **designesy-mcp 1.13.3 (PyPI).** The offline fallback mirrors engine 1.2.0
  and contract v0.4.3. v44 and v45 are listed in `engine.not_run` with a reason,
  so 27 of the 44 checks run offline. The tool descriptions state 44 checks,
  and the remote-score note reads the check count from the engine's reply. The
  offline engine's golden covers 118 cases and 229 runs.
- **The four engines' check grid on /score follows the check count.** Its
  lattice was written into the stylesheet for 42 cells (3 x 14 wide, 7 x 6
  narrow) and left a last row of two at 44. It is derived from the contract
  score's count: 4 x 11 wide and 11 x 4 narrow at 44.
- **Calibration corpus 1.3.0**: seven fixtures for v44 and v45 (32 in all).
  `test/engine-1-2-0.test.mjs` pins each rule's edges and both slop fixes.

**Leaderboard impact, measured.** The HTML and CSS of the 30 seed sites were
fetched once on 2026-10-09 with GET requests, one site at a time, and scored
by engine 1.1.0 and engine 1.2.0 on the same bytes. The scores below use the
site's arithmetic. The DESIGN.md probe (v37) was off in both runs, so a site
that serves a DESIGN.md can differ from its live score by that check. 26 of 30
sites were reachable; nytimes.com and cssdesignawards.com returned 403,
getdesy.com refused the connection and awwwards.com timed out. v44: 1 FAIL,
9 WARN, 4 PASS, 12 SKIP. v45: 1 PASS (designesy.org), 25 SKIP. The new checks
alone move 8 sites by -1.8 to +1.2 (mean -0.02); the slop fixes alone move 11
by 0 to +13 (mean +2.49); together 14 sites move, by 0 to +12.3 (mean +2.2),
and six change grade. The live leaderboard keeps its current scores until the
re-score that runs on release.

  | Site | v44 | v45 | S2, S8 findings | Score: 1.1.0 → 1.2.0 | v44/v45 | S2/S8 | Delta | Grade |
  |---|---|---|---|---|---|---|---|---|
  | linear.app | WARN | SKIP | S2 21 → 0; S8 9 → 0 | 70.0 → 70.0 | 0 | 0 | 0 | C |
  | vercel.com | SKIP | SKIP | S2 1 → 0 | 81.0 → 86.0 | 0 | +5 | +5 | B |
  | stripe.com | WARN | SKIP | S2 1 → 0; S8 12 → 0 | 66.9 → 67.9 | 0 | +1 | +1 | D |
  | apple.com | SKIP | SKIP | no change | 83.1 → 83.1 | 0 | 0 | 0 | B |
  | nytimes.com | not reached | | | | | | | |
  | mozaika.design | SKIP | SKIP | no change | 65.1 → 65.1 | 0 | 0 | 0 | D |
  | www.designesy.org | PASS | PASS | S2 3 → 0; S8 6 → 0 | 98.0 → 100.0 | 0 | +2 | +2 | A |
  | designesy.ai.studio | PASS | SKIP | no change | 77.7 → 78.5 | +0.8 | 0 | +0.8 | C |
  | getdesy.com | not reached | | | | | | | |
  | stitch.withgoogle.com | SKIP | SKIP | S8 4 → 0 | 64.4 → 69.4 | 0 | +5 | +5 | D |
  | zeroheight.com | WARN | SKIP | S8 3 → 0 | 70.0 → 70.0 | 0 | 0 | 0 | C |
  | roastbyai.com | SKIP | SKIP | S8 4 → 0 | 74.7 → 82.7 | 0 | +8 | +8 | C → B |
  | atlassian.design | PASS | SKIP | no change | 91.9 → 93.1 | +1.2 | 0 | +1.2 | A |
  | primer.style | WARN | SKIP | S2 2 → 0; S8 1 → 0 | 85.4 → 91.6 | -1.8 | +8 | +6.2 | B → A |
  | carbondesignsystem.com | WARN | SKIP | S2 3 → 0; S8 2 → 0 | 69.3 → 81.6 | -0.7 | +13 | +12.3 | D → B |
  | spectrum.adobe.com | SKIP | SKIP | no change | 69.1 → 69.1 | 0 | 0 | 0 | D |
  | m3.material.io | WARN | SKIP | no change | 66.4 → 66.4 | 0 | 0 | 0 | D |
  | radix-ui.com | WARN | SKIP | S2 2 → 0 | 65.2 → 70.0 | +0.4 | +4.8 | +4.8 | D → C |
  | geist.dev | SKIP | SKIP | no change | 64.4 → 64.4 | 0 | 0 | 0 | D |
  | plex.ibm.com | SKIP | SKIP | no change | 57.1 → 57.1 | 0 | 0 | 0 | F |
  | awwwards.com | not reached | | | | | | | |
  | fwa.org | WARN | SKIP | S8 1 → 0 | 47.9 → 51.5 | +0.6 | +3 | +3.6 | F |
  | cssdesignawards.com | not reached | | | | | | | |
  | pentagram.com | SKIP | SKIP | S8 4 → 0 | 56.6 → 56.6 | 0 | 0 | 0 | F |
  | vam.ac.uk | SKIP | SKIP | S2 7 → 0 | 70.0 → 70.0 | 0 | 0 | 0 | C |
  | github.com | FAIL | SKIP | S2 5 → 0; S8 6 → 0 | 68.5 → 70.0 | -1.8 | +10 | +1.5 | D → C |
  | notion.so | WARN | SKIP | S2 2 → 1 | 65.5 → 65.5 | 0 | 0 | 0 | D |
  | figma.com | SKIP | SKIP | S8 250 → 0 | 79.4 → 84.4 | 0 | +5 | +5 | C → B |
  | x.com | SKIP | SKIP | no change | 90.2 → 90.2 | 0 | 0 | 0 | A |
  | wikipedia.org | PASS | SKIP | no change | 83.0 → 83.8 | +0.8 | 0 | +0.8 | B |

  A WARN carries half credit, so whether it raises or lowers a score depends on
  where the accessibility category already stands; on this cohort the v44 WARNs
  move scores by -1.8 to +0.6. A score that holds at 70 (linear.app,
  zeroheight.com, vam.ac.uk) is held by the accessibility floor. pentagram.com
  stays at 56.6 because its slop deduction is still at the 20-point cap without
  S8.

  **The one v44 FAIL, read by hand**, each finding against the stylesheet it
  came from. carbondesignsystem.com WARNs: its progress bar and status icon
  (`--cds-support-success`, 3.05:1) are graphics and clear 3:1, and a
  ghost-button color it also paints as a mark stays a WARN. primer.style WARNs:
  its two misses are neutral text under a danger name, the danger button's
  counter on hover (white on 20% white over #cf222e, #d94e58, 4.05:1) and its
  keyboard hint in the dark theme (#9198a1 on #2a313c, 4.497:1). github.com
  FAILs on 83 hues, in five groups. 43 are in the Dark Dimmed theme, with both
  values from its `dark_dimmed` theme file: `--fgColor-danger` #e5534b on
  #212830 (4.02:1) 33 times, and 10 danger labels and buttons on that theme's
  surfaces (3.30 to 4.36:1). 4 are Primer Brand's dark red #fa383d on the Dark
  Dimmed canvas (4.04:1). 27 are Primer Brand colors when the appearance
  follows the system and a dark theme fills the day slot
  (`[data-color-mode=auto][data-light-theme=dark]` and its dimmed and
  high-contrast variants): the brand declares only `[data-color-mode=light]`
  and `[data-color-mode=dark]`, so it keeps its light palette on the dark
  canvas (2.78 to 4.41:1). The cascade produces that as written; only a
  signed-in visitor with those settings reaches it. 8 are
  `--brand-color-success-emphasis` as text, 2.46:1 on white and 2.13 to
  2.94:1 in the dark themes, under 3:1 even as a graphic. 1 is an alert
  counter in the light colorblind theme, #bc4c00 on #f0f1f2 (4.45:1). Its 12
  neutral counters and keyboard hints WARN.

## [1.13.2] — 2026-10-09

**designesy-mcp 1.13.2** (PyPI, MCP registry): every tool declares a title and the four MCP annotation hints.

### Added

- **MCP tool titles and annotations.** Each of the 17 tools on the hosted
  endpoint (`/api/mcp`) and in the PyPI stdio server now declares a `title`
  (as `Tool.title` and `annotations.title`) and all four MCP 2025-06-18 hints:
  `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`.
  Every value was read from the handler and the API route it calls. Sixteen
  tools are read-only. `designesy_monitor_score` is marked `readOnlyHint:
  false`, `destructiveHint: false` and `idempotentHint: false`, because
  `/api/monitor` sends a drift-alert email through Resend when the caller
  passes `email`, an alert fires and the server has a Resend key.
  `designesy_a11y_score` and the seven document tools are closed world; the
  tools that fetch a caller's URL are open world.
- **The annotations are gated.** `check-mcp-tool-parity.js` fails when a tool
  lacks a title or one of the four hints, when the route does not apply a
  tool's own entry, or when the PyPI server's titles and hints differ from the
  hosted endpoint's. The Python suite (`test_tool_annotations.py`) asserts the
  same from the package side, against the served `tools/list`.

### Fixed

- **The PyPI summary and README no longer call the server read-only.** Both
  said it never writes anywhere, while `designesy_monitor_score` can send
  email. The summary now reads "Read-only except monitor alerts, which can send
  email when configured", and the README's Safety section states when the email
  goes out.

## [1.13.1] — 2026-10-08

**designesy-mcp 1.13.1** (PyPI, MCP registry): the offline fallback mirrors engine 1.1.0 under a drift gate.

### Changed

- **PyPI MCP server: the offline fallback mirrors engine 1.1.0, under a drift
  gate.** When the live engine is unreachable, `designesy_score` (format
  `designesy`) falls back to a Python engine in `packages/designesy-mcp`.
  Nothing compared it with the live engine. Measured against the new golden, it
  disagreed with the live engine's status on at least one run for 23 of its 26
  checks (only v03, v07 and v09 agreed everywhere), and it raised `ValueError`
  on `scale(0.9.5)`.

  - Its 26 checks are now ports of the TypeScript checks, with the same item,
    category, status and detail, the same token inference, and the same scope
    filter. v05, v14 and v18 carry their 1.1.0 behaviour, and v27 is added with
    its 1.1.0 behaviour, so 27 of the 42 checks run offline.
  - `scope` now applies offline, requested or auto-detected from the URL as the
    live engine does. It used to be dropped with a `scope_note`.
  - v02, v04 and v21 read MANUAL without a browser, as in the live engine
    (all three read SKIP before).
  - The result names itself: `engine.kind` is `offline`,
    `engine.mirrors_engine_version` is `1.1.0`, `engine.not_run` lists the 15
    checks it does not run (each with a reason in the source), and `scope` is
    reported. Its score stays an unweighted pass rate over the checks it runs,
    and its note says that this is not the live engine's score.
  - It collects CSS the way the live route does (inline first, then each
    distinct stylesheet linked with `rel` before `href`, at most 60), and no
    longer fetches the contract from designesy.org, which only the old v01 used.

  **Drift gate.** `packages/score/scripts/export-offline-golden.mjs` scores the
  25 offline corpus fixtures, the recorded parity page, 77 edge inputs and 8
  scope auto-detection cases with the built TypeScript engine, under both scopes
  (215 runs), and writes `packages/designesy-mcp/test/fixtures/offline-engine-golden.json`.
  `test_offline_engine_parity.py` requires the Python engine to match every run,
  check by check, and requires its ported and listed checks to be exactly the
  live engine's 42. CI runs the exporter with `--check`. No version is bumped.


## [1.13.0] — 2026-10-08

Released together: **designesy-mcp 1.13.0** (PyPI, MCP registry) and
**@designesy/score 0.6.0** (npm). The entries below were merged since 1.12.2.
Headlines: engine 1.1.0 (v05, v27, v14/v18 tiering, the 13-type DTCG list) now
ships in the npm CLI's bundled engine; the PyPI `designesy_score` tool passes
`format` and `scope` through to the engine and identifies itself as
`designesy-mcp/1.13.0`.

### Changed

- **`@designesy/score` 0.5.0 — the standalone engine is converged with the site
  engine; no known debt remains.** The two hand-maintained copies of the 42-check
  engine had 13 unported fixes, so the CLI and the site could score the same page
  differently. All 13 are ported (#169) and the drift baseline is down from 15
  divergences to 4 — all genuine transport splits (`route.ts` attaches a receipt
  and takes a `Date`; the package fetches via an SSRF-guarded `httpsFetch`).
  Behaviour that changes for CLI users:

  - **v38** — `aria-hidden` subtrees are stripped before text extraction (tag
    removal used to FUSE neighbouring text into strings nobody wrote), a 1–2
    character label falls back to its `aria-label`, and selection controls
    (`aria-pressed`, `role="radio"`, `<button name= value=>`) are no longer read
    as non-verb commands. Icon-only buttons and radio groups stop failing.
  - **v37** — returning `PASS` when the `@google/design.md` linter was not
    installed **asserted validation that never ran**. It now returns `WARN`, and
    distinguishes "linter missing" from "linter threw", which need different fixes.
  - **v26, S2, S8, S9, S11, S12** — font-family and slop checks now match the
    site: the grid-pattern exemption accepts `color-mix()`/`var()`/hex stops in
    either order (a hairline-grid background was flagged at severity 5), and the
    slop checks are suppressed on a page that *documents* the rules, which
    previously cost points for publishing one's own rule registry.
  - **Alias resolution** — an alias resolving to an empty string no longer stops
    the search, so a later alias with a real value is still used.
  - **`emitReview`** — an all-`SKIP` result printed **"Approve"** for a page
    nothing had evaluated. It now reads "Not scored".

  **Public API (additive):** `deriveVerdict` and `statusToSeverity` are exported.
  The verdict rule is now shared by every emission format so they cannot disagree
  about the same result. Nothing was removed.

  **Guard added:** the source-drift gate also pins the package's exported
  surface. Its body comparison drops the `export` keyword by design (a route and
  a package legitimately differ on it), which made an accidental API change
  invisible — verified directly, then covered by a test with its own control.

### Fixed

- **Engine 1.1.0 (2026-10-08): four baseline defects fixed; 21 of the 30
  leaderboard sites change at least one verdict.** `ENGINE_VERSION` is now
  `1.1.0`, so every result and receipt scored from here on names the build that
  produced it. Both engine copies (`apps/site/app/api/score/route.ts` and
  `packages/score/src/engine.ts`) carry the identical change; the source-drift
  gate reports them in agreement.

  - **v05: motion gated behind `prefers-reduced-motion: no-preference` passes.**
    Declaring motion only inside a `no-preference` block is a recommended way to
    honour reduced motion, because a user who asked for less never receives it.
    Engine 1.0.0 accepted only a `reduce` block and WARNed this pattern. The block
    has to opt into motion: an animation, a transition, smooth scrolling or a view
    transition. An empty block still WARNs, and so does a block that only switches
    motion off (the `reduce` kill switch filed under the wrong query, which stills
    motion for users with no preference and leaves it running for users who asked
    for less). The existing regression fixture `broken-reduced-motion-inverted`
    pins that last case and still reads WARN.
  - **v27: a page with no field to zoom into reads SKIP.** When the CSS shows
    neither a sub-16px input rule nor a 16px floor, a page whose HTML carries no
    text input, textarea or select now reads SKIP, as v38 already does for a page
    with no buttons. It used to read WARN. Inputs that take no typed text (hidden,
    checkbox, radio, submit, button, reset, image, file, range, color) do not
    count as fields. A sub-16px input rule still FAILs and a declared floor still
    PASSes, on any page.
  - **v14 and v18 move to Tier 2.** Both encode Designesy Cadence taste (the
    Cadence umbrella rule set, and `text-wrap: balance` plus `pretty`) yet sat in
    Tier 1, so `scope=universal` WARNed external sites for not adopting them.
    Their absence now reads SKIP under `scope=universal`, the treatment v15, v19,
    v20 and x01 to x03 already receive. `scope=contract`, which designesy.org is
    scored under, is unchanged.
  - **MCP DTCG validator (t06, t07): the type list is the 13 types DTCG 2025.10
    defines.** `cubicBezier` was missing, so a conformant easing token WARNed on
    t06 and t07. Seven names the format does not define (`string`, `boolean`,
    `link`, `borderStyle`, `borderWeight`, `radius`, `spacing`) were accepted as
    standard. Fixed in the hosted endpoint (`apps/site/app/api/mcp/route.ts`) and
    in the Python package, whose tests now assert that the two lists are equal.
    This tool is separate from the site score, so no leaderboard verdict moves
    with it. `packages/tokens` keeps its own 15-type list (it also accepts
    `string` and `boolean`) and is untouched by this release.

  **Leaderboard impact, measured.** The HTML and CSS of every seed site in
  `apps/site/app/leaderboard/seed.ts` were fetched once on 2026-10-08 through the
  package engine's fetch path, then scored by engine 1.0.0 and engine 1.1.0 on
  the same bytes, with the live DESIGN.md probe (v37) enabled. 27 of 30 sites
  were reachable; nytimes.com, getdesy.com and cssdesignawards.com were not,
  which matches their held-over flags in `seed.ts`. 21 sites change at least one
  verdict: v14 on 19 sites, v18 on 17, v27 on 10 and v05 on 1. No other check
  moves. Six sites move nothing: linear.app, vercel.com (a), stripe.com,
  www.designesy.org, github.com and x.com (a). The live leaderboard keeps its
  1.0.0 scores until its next weekly re-score.

  | Site | Check: 1.0.0 → 1.1.0 | Score: 1.0.0 → 1.1.0 | Delta | Grade |
  |---|---|---|---|---|
  | apple.com | v14 WARN → SKIP; v18 WARN → SKIP | 82.1 → 83.1 | +1.0 | B |
  | mozaika.design | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 62.8 → 64.3 | +1.5 | D |
  | designesy.ai.studio | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 74.8 → 76.8 | +2.0 | C |
  | stitch.withgoogle.com | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 61.2 → 63.5 | +2.3 | D |
  | zeroheight.com | v18 WARN → SKIP | 70 → 70 | 0 | C |
  | roastbyai.com (a) | v14 WARN → SKIP; v18 WARN → SKIP | 72.2 → 74.7 | +2.5 | C |
  | atlassian.design (a) | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 89.1 → 91.9 | +2.8 | B → A (b) |
  | primer.style | v27 WARN → SKIP | 82.4 → 84.1 | +1.7 | B |
  | carbondesignsystem.com | v14 WARN → SKIP; v18 WARN → SKIP | 67.8 → 69.3 | +1.5 | D |
  | spectrum.adobe.com | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 63.5 → 65.1 | +1.6 | D |
  | m3.material.io | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 67.6 → 66.4 | -1.2 | D |
  | radix-ui.com | v05 WARN → PASS; v14 WARN → SKIP | 63.2 → 65.2 | +2.0 | D |
  | geist.dev | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 62.0 → 64.4 | +2.4 | D |
  | plex.ibm.com | v14 WARN → SKIP; v18 WARN → SKIP | 58.3 → 56.8 | -1.5 | F |
  | awwwards.com (a) | v14 WARN → SKIP; v18 WARN → SKIP | 70 → 70 | 0 | C |
  | fwa.org | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 48.0 → 47.9 | -0.1 | F |
  | pentagram.com | v14 WARN → SKIP | 56.3 → 56.6 | +0.3 | F |
  | vam.ac.uk | v14 WARN → SKIP; v18 WARN → SKIP | 70 → 70 | 0 | C |
  | notion.so | v14 WARN → SKIP | 65.0 → 65.5 | +0.5 | D |
  | figma.com | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 76.6 → 79.4 | +2.8 | C |
  | wikipedia.org | v14 WARN → SKIP; v18 WARN → SKIP | 80.7 → 83.0 | +2.3 | B |

  (a) On the captured bytes, engine 1.0.0 does not reproduce this site's live
  2026-10-08 score (live: vercel.com 79.6, roastbyai.com 71.2, atlassian.design
  86.1, awwwards.com 70.3, x.com 87.8), so the page or the fetch differed from the
  weekly run. The verdict moves and deltas in these rows hold for the captured
  bytes; the live values are not measured. The other 22 reachable sites reproduce
  their live 1.0.0 score exactly. www.designesy.org shows one PASS fewer than
  live at the same score, because the package engine reports v37 as MANUAL where
  the hosted engine runs the DESIGN.md linter.
  (b) The grade change rests on a 1.0.0 score of 89.1 that the live run did not
  reproduce: live, atlassian.design scored 86.1 with one more FAIL. Whether its
  live grade moves is not measured.

  Scores can fall. Removing a WARN (half credit) from a category that averages
  below half credit lowers that category, which is why m3.material.io,
  plex.ibm.com and fwa.org drop. A score that holds at 70 (zeroheight.com,
  awwwards.com, vam.ac.uk) is held by the accessibility floor, which caps any
  site whose accessibility category is below 60% at 70.

  The calibration corpus grows from 18 fixtures to 25 (corpus 1.2.0): fixtures
  that held each old wrong verdict, plus controls that keep the verdicts the
  fixes must not move. Fourteen existing fixtures change their counts: thirteen
  universal-scope fixtures because v14 and v18 now SKIP on them, and
  `edge-empty-page` because it has no field and v27 now SKIPs. Every pinned
  verdict still holds. `packages/score/test/engine-1-1-0.test.mjs` pins the edges
  of each rule.

- **`designesy-score` 1.0.5 (npm CLI): the v07 label no longer names an internal
  project.** 1.0.4 was built from a branch that never merged and printed a
  control-plane name in the v07 `item` on every run. 1.0.5 is built from `main`,
  where v07 reads `Semantic HTML foundation: single h1, title, meta description,
  landmark`, and the check function is renamed to `checkSemanticHtmlFoundation`
  in both engine copies so the shipped `engine.js` carries no trace of it. The
  CLI banner now reads its version from `package.json` (it said v1.0.0 through
  1.0.4) and counts 42 checks, not 40. The package stays deprecated in favour of
  `@designesy/score`.

- **Standalone `@designesy/score` engine re-synced to the site engine** (v0.3.0).
  37 of 40 check functions had drifted from the canonical `apps/site` engine —
  5 wrong category assignments (v03 accessibility→interaction, v05
  accessibility→motion, v20/v26 identity→cadence, v27 responsive→
  accessibility) and 32 stale check implementations (v10 takt, v34 AI
  disclosure, v38 button-verb, v39 trailing-period, v11/v19 semantics, and
  more). Before: the CLI scored designesy.org 88.5 B while the site engine
  scored it 93 A. After: identical scores and per-check statuses verified on
  three URLs (designesy.org 93 A, linear.app 67.7 D, example.com 63.3 D
  universal) — 0 diffs across all 42 checks on each. The v37 DESIGN.md check
  keeps its deliberate npm-runtime adaptations (SSRF-safe httpsFetch,
  optional-linter fallback).

## [1.12.2] — 2026-09-28

### Fixed

- **The published package now names the org, not a person.** `pyproject.toml`
  declared a personal name in `authors`, and PyPI renders that as
  `author_email` on the project page. The npm packages moved to
  `Designesy <hello@designesy.org>` in the same change, so the artifacts now
  agree. Registry metadata is immutable per published version, which is why this
  needs a release rather than an edit: 1.12.1 still carries the old field.
- **The sdist LICENSE now reads `Copyright (c) 2026 LE-VAI`**, matching the
  licence holder used across the other packages. The bundled copy had drifted.

## [1.12.0] — 2026-08-30

### Added

- **Semantic category wired: v42 + v43.** The `semantic` category carried a
  reserved weight (12) since v0.3.0 with zero checks returning it — dead
  weight in the engine's category table. Two deterministic checks now score
  it:
  - **v42 — Semantic color vocabulary:** classifies every color-valued token
    in :root as role-named (ink, paper, surface, danger, success, accent…)
    vs hue-named (blue, slate, amber, -500 scales…). PASS at ≥60% role share
    with ≥3 distinct roles. Grounded in the contract's own role-named
    palette (--ink, --paper, --surface, --signal, --ok/--warn/--error) and
    role-based naming best practice (zeroheight naming guide, Material 3).
  - **v43 — Semantic status colors:** checks status-state coverage
    (ok/success, warn/warning, error/danger, info/notice) among color token
    names. PASS at ≥3 of 4 families.
  Both checks are WARN-only (style craft, not user harm) per the engine's
  calibration precedent, self-SKIP when a site has no color tokens, and are
  site-agnostic (no scope-tier registration needed). Wired identically in
  the standalone `@designesy/score` engine to keep CLI/site parity.
- **Engine grows 40 → 42 checks.** The semantic category's weight 12 now
  enters the weighted denominator (6 per check). The methodology page's
  reserved-weight note is replaced with the live category description, and
  all engine-count copy is true-upped to 42 (READMEs, MCP tool descriptions,
  leaderboard, pricing, badge, CLI packages); historical surfaces (blog
  studies, dated compliance reports, changelog entries for past releases)
  intentionally keep their original counts.

### Fixed

- **The weekly-leaderboard write path was rotted three ways** (all fixed
  2026-08-30): rescore workflow died on a missing `leaderboard` label before
  opening its PR (labels now created idempotently in-workflow); the seed
  writer regenerated seed.ts from a stale template, stripping
  `liveScoreUrl`/`coiDisclosure` fields added after the last successful run
  (rewritten as a surgical field-preserving editor); and branch protection
  required status contexts in `CI / <job>` form that never matched the bare
  check-run names GitHub Actions reports (corrected to bare names). First
  fully-working weekly cycle lands with this release.

## [1.11.1] — 2026-08-30

### Added

- **/DESIGN.md served at site root** (Google DESIGN.md convention). The score
  engine's v37 spec-layer check now validates the live file with Google's
  @google/design.md linter (0 errors, 0 warnings) instead of SKIPping.
- **/DESIGN.md added to sitemap** and the post-deploy smoke assertions.

### Fixed

- **v37 serverless regression: @google/design.md linter ENOENT at Lambda
  runtime.** Next's bundler inlined build-machine absolute paths into the
  server bundle, so the dynamic import failed in production. The package is
  now externalized (serverExternalPackages) and traced into the /api/score
  Lambda zip (outputFileTracingIncludes).
- **Vercel alias flip missed on the 3845983 build** (integration glitch) —
  production briefly kept serving the prior build until a manual promote.

### Changed

- **Accuracy true-up, AnySearch-verified:** v24 target-size citation
  corrected to WCAG 2.5.5 Target Size (Enhanced) with the 2.5.8 24px AA
  minimum stated alongside; APCA Lc role mapping corrected (Lc 75 body
  minimum, Lc 90 body preferred, Lc 60 non-body); 84% token-adoption stat
  attributed to zeroheight Design Systems Report 2025; axe-core pinned
  4.12.1 → 4.13.0 across 17 pins; Belitsoft citation named exactly
  (State of React Development 2026).
- **Count true-up:** 23 packages, 17 MCP tools, 10 machine exports, 40
  checks across READMEs, open.json.cache, and the single-source check
  registry (lib/check-definitions.ts).
- **Live self-score: 93 A** (37 pass / 0 fail / 0 warn / 0 skip / 3 manual).

## [1.0.4] — 2026-08-15

### Fixed

- **v13 check: false FAILs from decorative animations.** The press-scale check
  extracted ALL `scale()` values from the entire CSS and used `:active` only as a
  boolean gate. Decorative `@keyframes` animations (`scale(0.3)` for checkmark
  pop-in, `scale(0.001)` for ripple start, `scale(0.85)` for spinner pulse) were
  incorrectly flagged as press-feedback failures. The check now extracts `scale()`
  values only from inside `:active` rule bodies, eliminating 9 false positives.
- **v27 check: false FAILs from unit blindness and substring matching.** The
  input font-size check dropped the CSS unit (`1rem` became `1`, compared against
  `16` as px) and matched "input" as a substring inside class names (`.cmdk-input`,
  `.score-url-input-inner`). The check now captures and converts units (rem/em × 16
  = px) and requires element selectors at selector boundaries. Eliminates 6 false
  positives.

### Changed

- **Real CSS fix: `.score-search-input` font-size raised from 0.8rem to 1rem.**
  The score page check search input was at 12.8px, which triggers iOS Safari
  auto-zoom on focus. Now at 16px (1rem), the WCAG 2.5.8 floor.
- **Dependabot ignore blocks added** for `next`, `eslint`, `eslint-config-next`,
  and `typescript` major version bumps. These require migration work (Next 16
  removes `next lint`, TS 6 requires CSS module declarations) and will be handled
  in a dedicated session. Minor/patch updates still flow.

## [1.0.3] — 2026-08-15

### Fixed

- **Critical: safeLookup did not honor `options.all` (Node v24 regression).**
  Node v24's `net` layer passes `{ all: true }` to the custom `lookup` function,
  expecting the callback to receive an array of `{ address, family }` objects.
  The previous `safeLookup` always returned a single `(address, family)` tuple,
  causing `ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined` on every fetch.
  This made every `httpsFetch` fail silently, returning empty HTML/CSS, which
  caused all CSS-text and token-based checks to report false FAILs/WARNs against
  empty input (0 tokens extracted, no `<h1>` found, no `:focus-visible` found,
  no `prefers-reduced-motion` found, no duration tokens found).
  The fix: `safeLookup` now checks `options.all` and returns an array when true.
  Impact: designesy.org contract score went from 59.4 F (0 tokens) to 78.1 C
  (146 tokens extracted) with the same source CSS — the engine was blind, not
  the site.

## [1.0.2] — 2026-08-14

### Security

- **DNS rebinding SSRF mitigation (TOCTOU-safe).** The SSRF guard now validates
  resolved IP addresses *inside the connection path* via a custom `lookup`
  function (`safeLookup`). This eliminates the time-of-check/time-of-use race
  (CWE-367) that made the previous resolve-then-fetch approach vulnerable to
  DNS rebinding attacks. A hostname like `localtest.me` (which resolves to
  `127.0.0.1`) is now blocked before the socket connects. References: OWASP
  SSRF Prevention Cheat Sheet (DNS pinning), CVE-2026-27826.

### Added

- **`node:test` automated test suite (36 tests, zero dependencies).** Three
  test files covering SSRF guard unit tests (12), scoring engine contract
  tests (8), CLI integration tests (8), and engine parity tests (4). Uses
  `node --test` discovery with `node:assert/strict`. Run via `npm test` in
  `packages/score`.
- **Engine parity test.** Compares the npm engine output against the live
  `designesy.org/api/score` endpoint — catches structural drift (check IDs,
  check count, grade) and score drift (> 5 points triggers a sync warning).

### Changed

- **`@designesy/cli` path resolution refactored.** Replaced the 6-candidate
  filesystem path heuristic with `createRequire(import.meta.url).resolve()`,
  which uses Node's built-in module resolution. Handles npm flat-hoisting,
  pnpm virtual stores, and yarn PnP correctly. Bumped to 0.2.0.
- **`@designesy/score` bumped to 0.2.0.** Includes the safeLookup fix and
  test suite.

## [1.0.1] — 2026-08-14

### Fixed

- **SSRF redirect bypass (critical).** The SSRF guard now re-validates every HTTP
  redirect target with `isValidUrl()` before following it. Previously, only the
  initial URL was validated — an attacker could redirect from a safe URL to
  `http://169.254.169.254/` (AWS IMDS) and the engine would follow it. The
  CHANGELOG previously claimed "SSRF guard runs on every fetch, including
  redirect hops" — this is now actually true.
- **CHANGELOG links fixed.** Version comparison links now point to the correct
  monorepo tag names (`designesy-score@1.0.0` instead of `v1.0.0`).

### Added

- **Runtime deprecation warning.** Using `--api` or `$SCORE_API` now emits a
  `DeprecationWarning` to stderr, directing users to the local engine.
- **MIGRATION.md shipped in tarball.** The migration guide is now included in the
  npm package so users who install via npm can read it without visiting GitHub.

## [1.0.0] — 2026-08-14

### ⚠️ BREAKING CHANGES

- **Local engine by default.** The CLI now runs the full 40-check scoring engine
  locally — no server required. In 0.x, the CLI POSTed to `https://www.designesy.org/api/score`.
  In 1.0.0, it fetches the target URL, extracts CSS + `:root` tokens, and runs
  all 40 checks in-process. Zero dependencies (Node built-ins only).

- **`--api` is now a remote fallback.** The `--api <url>` flag and `$SCORE_API` env var
  still work, but they now opt INTO the old remote API client mode instead of being
  the default. If you relied on the remote server, add `--api https://www.designesy.org`
  or set `SCORE_API=https://www.designesy.org` to restore the pre-1.0.0 behavior.

- **New `--scope` flag.** `--scope contract` (strict — all checks penalize absence,
  default for designesy.org) or `--scope universal` (fair to external sites — optional
  features SKIP on absence). Default is `auto` (detects whether the site declares
  Designesy tokens). [NEW in 1.0.0]

- **Report includes anti-slop + originality.** The formatted report now shows
  anti-slop deductions (12 patterns) and originality lifts (7 craft signals) that
  affect the final score. These were always part of the engine but not displayed
  in the 0.x CLI report.

- **`verify` subcommand runs locally.** The `verify <url>` subcommand (DESIGN.md
  spec-layer check) now runs the v37 check from the local engine instead of
  POSTing to the server. Use `--api` to fall back to remote mode.

### Added

- Local 40-check scoring engine (zero dependencies, `node:https` + pure-JS SSRF guard)
- `--scope` flag for contract vs universal scoring
- Anti-slop deductions (S1-S12) and originality lifts (O1-O7) in the formatted report
- `--scope`, `--format`, `--min-score`, `--min-grade`, `--json`, `--quiet` all work
  in both local and remote mode
- `MANUAL` check status icon (for checks that need a live browser to verify)

### Changed

- Default mode: local engine (was: remote API call to designesy.org)
- `--api` and `$SCORE_API`: now opt-in remote fallback (was: default behavior)
- Engine fetch: `node:https` with zero-dep SSRF guard (was: `fetch()` + `ipaddr.js`)
- Report: shows anti-slop + originality lines (was: score + categories + findings only)

### Deprecated

- `--api <url>` remote fallback mode — will be removed in 2.0.0. The local engine
  is strictly better (works offline, no rate limits, no server dependency).
- `$SCORE_API` env var — same as `--api`, deprecated in favor of local mode.

### Fixed

- Windows libuv crash: replaced `fetch()`/undici with `node:https` to avoid the
  `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` crash on process exit
- SSRF guard: replaced `ipaddr.js` dependency with pure-JS private-range checks
  (10.x, 127.x, 169.254.x, 172.16-31.x, 192.168.x, 100.64+, all IPv6, encoded IPs)

### Security

- Zero runtime dependencies (was: ipaddr.js)
- SSRF guard runs on every fetch, including redirect hops

---

## [0.4.2] — 2026-08-11

- API client CLI: POSTs to designesy.org/api/score, formats the response
- Flags: `--format`, `--api`, `--min-score`, `--min-grade`, `--json`, `--quiet`
- Subcommand: `verify <url>` (DESIGN.md spec-layer check via remote API)
- Zero dependencies

## [0.3.0] — 2026-07-30

- Initial API client release
- 40-check engine running server-side at designesy.org

[1.0.4]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.4
[1.0.3]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.3
[1.0.2]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.2
[1.0.1]: https://github.com/LE-VAI/designesy-org/compare/designesy-score%401.0.0...1adacfb8c1ff92173104161e5a18ebc2732ee106
[1.0.0]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.0
[0.4.2]: https://github.com/LE-VAI/designesy-org/compare/v0.4.0...designesy-score%401.0.0