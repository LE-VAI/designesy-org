#!/usr/bin/env node
/**
 * Fetch bounds: url-guard's safeFetch stops reading a response body at the
 * cap its caller names while the body is still arriving, a caller's signal
 * ends a read at its deadline however slowly the server sends and keeps no
 * listener once the read settles, a reader's chunk holds only the bytes
 * returned, every URL the MCP route reads for itself ends at the route's 15 s
 * read deadline and fails once its body is past that read's byte limit
 * (16 MiB for a Lottie file, 4 MiB for a token file or one of this site's
 * documents), a readiness check whose file is past the readiness route's
 * 4 MiB read limit reports WARN and says the file was not read while a file
 * within it is judged as before, an error or redirect body is held to the
 * same limit as the read that receives it, a request's body reaches its
 * server and a redirect is followed with the method and body fetch would
 * use, a read given a signal ends at that signal alone, and the MCP tools
 * that read a URL through url-guard still read one that answers.
 *
 * WHY THIS EXISTS
 * safeFetch holds a body in memory whole before it returns. With maxBodyBytes
 * it holds at most cap + 1 bytes, and check-fetch-layer.mjs checks that
 * length, but a length alone cannot show that the read stopped as the cap was
 * reached rather than once the whole body had arrived. The transport's own
 * 15 s timeout is a socket idle timeout, set only when the caller passes no
 * signal, so a server that sends one byte a second and never stops never
 * trips it: read with no cap, that body ends at the caller's signal or not at
 * all. The transport ended each request without writing the body its caller
 * passed, so a POST reached its server empty, readiness r04's tools/list
 * request among them, which an endpoint built with mcp-handler answers with
 * 400, and each redirect hop repeated the caller's method. With a signal, it
 * set no timeout of its own unless the caller passed an idle timeout (only
 * the MCP route's reads did, of 15 s), so the idle timeout of Node's global
 * agent, whose requests it makes, ended a read whose server went quiet
 * before the caller's deadline, with an error the caller did not read as its
 * own timeout: after 5 s on Node 24.15.0, and after 4 s on a connection kept
 * alive from an answer that gave a 5 s Keep-Alive timeout. The MCP route
 * passed no signal for the URLs it reads (cachedFetch, and
 * the url of designesy_tokens_score and designesy_motion_score), so nothing
 * in the process ended such a read short of the function's maxDuration
 * (300 s, vercel.json). It passed no maxBodyBytes either, so it held an
 * identity body whole however long it was, and a compressed body that
 * decoded past url-guard's default of 4 MiB (DEFAULT_MAX_DECODED_BYTES)
 * failed with "content decoding failed", which names no limit, a gzip Lottie
 * file that decodes to 16 MiB among them. The readiness route passed no
 * maxBodyBytes for its GET probes or for r04's read of an MCP endpoint, so it
 * read an identity body of any length whole and judged it, and a probe whose
 * compressed body decoded past that default failed: its check reported a
 * file that answered as not found (FAIL), and a home page that did so failed
 * the whole scan as not fetched. Neither route passed a limit for a body it
 * does not read: url-guard holds a 3xx, 4xx or 5xx body raw up to
 * maxBodyBytes, or whole when there is none, so an error page of any length
 * was received in full before its status was reported, and a redirect's
 * body before the next hop was requested. Each hop of a read adds an abort
 * listener to the caller's signal, and it stayed there once the read settled.
 * A signal can outlive the read: Node keeps an AbortSignal.timeout that has a
 * listener alive until its timer fires, and the listener kept the read's
 * request and the body it read reachable until then. The Response reads the
 * body as one chunk the transport joins, uncopied. Joined by Buffer.concat, a
 * body under 4 KiB would sit in Node's shared 8 KiB pool, whose buffer also
 * holds other reads' bytes.
 *
 * HOW IT MEASURES
 * The real URL guard, the real MCP route and the real readiness route, loaded
 * through scripts/lib/route-harness.js with realSafeFetch. As in
 * check-score-read-bounds.mjs, two things are swapped, both below the guard:
 * node:dns/promises answers a public address, and records each host it is
 * asked about (looked), and node:http(s) connect to a server on 127.0.0.1
 * that this script runs. The connect wrapper also counts
 * the body bytes that reach the client and keeps the request, so a case can
 * say how far a body got and whether the request was destroyed. The server
 * reads each request's body before it answers, and records the method, the
 * headers that describe a body, one header that does not, and the body
 * (asked), so a case can say what a request carried. One host is answered
 * by an MCP endpoint built with mcp-handler, the package the site's MCP
 * route serves its tools with, resolved from the app checked or else from
 * this checkout. The
 * keep-alive case's host has a server of its own, on its own port, so the
 * connection Node's agent keeps alive from its first answer is taken by no
 * other case's request.
 * getEventListeners (node:events) counts the abort listeners left on a
 * signal. The MCP, readiness and score routes and page-fetch are loaded
 * before the first case starts, so no case's time includes their load, and
 * one case each for the MCP and readiness routes reads its source instead of
 * running it. The cases run concurrently, each on its own URLs; the last one
 * runs once the others have settled.
 *
 * The MCP read limits are stated here (MCP_READ_LIMITS), as the read deadline
 * is (MCP_DEADLINE_S): a route file cannot export them. The bodies of the
 * limit cases are built so that a body cut anywhere does not parse or shows
 * it was cut: JSON padded with spaces after its opening brace, and a document
 * whose last line says it is whole. The server sends an identity body of a
 * limit case at most PACE_WINDOW (256 KiB) ahead of what the client has
 * received, so a socket buffer larger than the 1 MiB past each limit cannot
 * let the server finish before the client stops reading. designesy_llms_txt
 * reads one fixed URL, and the route caches a read that succeeds for 5
 * minutes and answers later calls from it, so the designesy_llms_txt cases
 * take turns (llmsTurn), in the order they are listed, each setting what that
 * URL serves.
 *
 * The readiness read limit is stated here too (READINESS_LIMIT). The
 * readiness route reads every file from the origin of the URL it scans, so
 * each readiness case scans a host of its own through the route's POST
 * handler, and a path the host does not list answers 404: a check whose file
 * is not listed reports what it reports on a site with none of the files
 * (EMPTY_SITE). The harness's unstable_cache calls straight through, so no
 * scan is answered from a cache. The two token checks read /tokens.json at
 * the same time, so the site where every file is past the limit sends its
 * bodies unpaced, and its case asserts what the checks report, not where the
 * reads stopped. The later-path sites send their token files, which both
 * token checks read, and r07's fallback agent.json, which r03 reads too,
 * unpaced for the same reason.
 *
 * WHAT IT ASSERTS
 *   - A 10 MiB body read with maxBodyBytes 1 MiB resolves with exactly its
 *     first 1 MiB + 1 bytes (the byte past the cap says the body went past
 *     it); at most one socket read past the cap reached the client, the
 *     request was destroyed, nothing more arrived after it, and the server
 *     never finished sending.
 *   - A body of exactly maxBodyBytes comes back whole, with no byte past the
 *     cap, and cutByBudget says no budget cut it. An ordinary page read with
 *     no cap comes back whole.
 *   - The chunk a reader gets (for a 9 byte body, a 2 MiB body read with
 *     maxBodyBytes 100, and a 1 MiB body) sits in a buffer that holds exactly
 *     the bytes returned, with none of the body of a read made just before
 *     it. How much comes back is the cap cases' to check.
 *   - A read leaves no abort listener on the caller's signal once it
 *     settles, and settles as its label says: whole, cut at maxBodyBytes,
 *     after a redirect, failed (the server closes the connection), at a 999
 *     status, as a gzip body, as a corrupt gzip body, and cut by a shared
 *     budget. Between them they reach every place the transport settles a
 *     read other than an abort.
 *   - A POST carries its body: a 46 byte tools/list request reaches the
 *     server with content-length 46. After a 307 or a 308 the URL it lands
 *     on receives the same POST; after a 301, a 302 or a 303 it receives a
 *     GET with no body and none of the headers that describe one
 *     (content-type, content-language and content-location), while a header
 *     that describes no body is kept. A PUT is repeated, its body included,
 *     after a 302, and becomes such a GET after a 303. Each is as fetch
 *     follows that redirect.
 *   - A request body is sent as its bytes, with their count as its
 *     content-length: a string past ASCII (3 characters, 9 bytes), an
 *     ArrayBuffer, and a view of part of a buffer (only the bytes it views).
 *     A body of another kind (URLSearchParams), and a body on a GET or a
 *     HEAD, is refused with a TypeError before its host is looked up, and
 *     no request is made.
 *   - A server that sends one byte a second is ended by the caller's 3 s
 *     signal at its deadline, with an AbortError, and the request is
 *     destroyed. Each MCP read of such a server (designesy_tokens_score,
 *     designesy_motion_score, and designesy_llms_txt through cachedFetch)
 *     ends at the route's 15 s read deadline with an error saying the fetch
 *     timed out after 15 s, and its request is destroyed.
 *   - A read given a signal ends at that signal alone. A server that sends
 *     nothing for 6 s mid-body is read whole by a caller whose signal ends
 *     at 12 s. On a connection kept alive from an answer that gave a 5 s
 *     Keep-Alive timeout, a server that sends nothing for 4.5 s before it
 *     answers is read by a caller whose signal ends at 5 s, and so is one
 *     quiet for 1.5 s after an answer that gave 2 s; neither read opens a
 *     connection of its own. designesy_tokens_score on a server that sends
 *     its headers and then nothing ends at the 15 s read deadline with the
 *     route's timeout error, its request destroyed.
 *   - A read given no signal fails once its server has sent nothing for
 *     15 s, with "SSRF guard: fetch timeout", its request destroyed.
 *   - Every safeFetch call in the site's app directory (url-guard's own
 *     aside), and fetchContract's call of the fetcher it is handed, passes a
 *     signal that a timer fires: an AbortSignal.timeout, or the signal of an
 *     AbortController that a setTimeout in the same function aborts. These
 *     are the seven reads a route makes through the guard.
 *   - Each MCP read of a body 1 MiB past its limit fails with "Fetch failed:
 *     the response is over the N MiB read limit": designesy_tokens_score
 *     (4 MiB), designesy_motion_score (16 MiB) and designesy_llms_txt
 *     (cachedFetch, 4 MiB), each for an identity body sent with no
 *     content-length and with one. At most one socket read past the limit
 *     reached the client, the request was destroyed, and the server never
 *     finished sending. A gzip body that decodes to 1 MiB past the limit
 *     fails the same way in each of the three.
 *   - designesy_motion_score reads a gzip Lottie file that decodes to exactly
 *     16 MiB whole, also when it is reached through a 302.
 *   - A read is held to its limit on the URL a redirect lands on: a token
 *     file reached through a 302 and 1 MiB past the 4 MiB limit fails
 *     naming the limit, and at most one socket read past the limit reached
 *     the client on the URL it landed on, the request was destroyed, and the
 *     server never finished sending.
 *   - Each coding is held to the limit after decoding: designesy_tokens_score
 *     fails, naming the limit, on a deflate (zlib-wrapped and raw) or br
 *     token file that decodes to one byte past 4 MiB, and
 *     designesy_motion_score reads a br Lottie file that decodes to exactly
 *     16 MiB whole and fails on one that decodes to one byte past it. A
 *     control: a deflate (both kinds) or br token file that decodes to
 *     exactly 4 MiB is read whole, as it was before the read limits.
 *   - Every safeFetch call in the MCP route is the one in readUrl, which
 *     passes it a signal from AbortSignal.timeout(READ_DEADLINE_MS) and its
 *     limit as maxBodyBytes, and READ_DEADLINE_MS is 15 s. readUrl is called
 *     in three places, each with the limit in MCP_READ_LIMITS: cachedFetch
 *     (4 MiB), designesy_tokens_score (4 MiB) and designesy_motion_score
 *     (16 MiB).
 *   - Controls, which hold on a route with no read limit too: a body of
 *     exactly the limit is read whole (a 4 MiB token file, a 16 MiB Lottie
 *     file, a 4 MiB document read by designesy_skill_md through cachedFetch);
 *     a 404 whose body is 1 MiB past the limit still fails as "Fetch failed:
 *     404" in each of the three tools; a token file that is not JSON, and a
 *     document cachedFetch reads as JSON that is not, fail with JSON.parse's
 *     own message, and a token file that starts with a byte order mark is
 *     read; designesy_tokens_score still reads a token file that answers,
 *     and designesy_llms_full_txt (cachedFetch) a document that answers.
 *   - designesy_tokens_score still reads a token file whose server is quiet
 *     for 8 s before it answers.
 *   - A token file that starts with two byte order marks is read, or fails,
 *     as res.json() reads or fails on the same bytes (on Node 24.15.0 it is
 *     read). This holds on the route from before the read limits.
 *   - A readiness check whose file is 1 MiB past the 4 MiB read limit is
 *     WARN, never FAIL or PASS, and its detail names the file and says it is
 *     larger than the 4 MiB read limit and was not read: r02 for an
 *     /llms.txt, r08 for a /sitemap.xml and r10 for a home page, each sent
 *     with no content coding and as gzip that decodes past the limit, r10
 *     also for a home page that answers 404, and r04 for an MCP endpoint
 *     whose tools/list answer is past the limit, both ways, and r02 for an
 *     /llms.txt reached through a 302, held to the limit on the URL it lands
 *     on. For each body
 *     sent with no content coding, at most one socket read past the limit
 *     reached the client, the request was destroyed, and the server never
 *     finished sending. In each scan the other nine checks are as on a site
 *     with none of the files, and the score, grade and counts follow the
 *     route's rule (PASS 1, WARN 0.5, FAIL 0; A at 90, B 80, C 70, D 60).
 *   - On a site where every file the checks read is past the limit, all ten
 *     checks are WARN with that detail (score 50, F). With no component
 *     schema, r07 is WARN with it for an /open.json past the limit.
 *   - A check that tries several paths stops at the first one that answers
 *     ok past the limit, wherever it is in the list. With every path before
 *     it answering 404, a file past the limit at the second path of each
 *     list (r01, r02, r03, r05, r06 and r07), at the third (r01, r06 and
 *     r07), at the fourth (r01 and r06), and at the second path of r07's
 *     fallback (/.well-known/agent.json, which is r03's first) is WARN with
 *     that detail, naming that path, and the other checks are as on a site
 *     with none of the files. For each of those files that only one check
 *     reads, sent with no content coding, at most one socket read past the
 *     limit reached the client, the request was destroyed, and the server
 *     never finished sending.
 *   - Readiness r04 on the mcp-handler endpoint is PASS with its one tool,
 *     and the endpoint received the 46 byte request; reached through a 307,
 *     r04 is PASS the same way. Through a 302 the endpoint receives a GET,
 *     which it answers 405, and r04 is WARN with that status. The same
 *     endpoint answers a tools/list POST that carries no body with 400.
 *   - Each caller whose signal ends at 8 s reads a server that sends nothing
 *     for 6 s before it answers: readiness r02 is PASS for such an
 *     /llms.txt, the score route scores such a page, and page-fetch (the
 *     drift, guardrails, monitor and compare routes' page read) reads it.
 *     The score route reports a page that sends its headers and then
 *     nothing, on both of its candidate URLs, as unreachable because the
 *     request timed out, at 2 x 8 s.
 *   - The readiness route's READ_LIMIT is 4 MiB, and each of its two
 *     safeFetch calls (probeUrl's and r04's) passes it as maxBodyBytes, a
 *     HEAD probe none.
 *   - The readiness route's cache and the report route's (which keeps the
 *     readiness result each report was made with) carry the key part
 *     'read-limit-4mib' in their unstable_cache keys.
 *   - Readiness controls, which hold on the readiness route from before its
 *     read limit too: an /llms.txt, a /sitemap.xml, a home page and a
 *     tools/list answer of exactly 4 MiB are read whole and PASS, as is a
 *     gzip /llms.txt that decodes to exactly 4 MiB; a 404 whose body is
 *     1 MiB past the limit is not found (r02, r08 and r09 FAIL, r04 WARN with
 *     its HTTP status); an ordinary small site's ten checks (seven PASS, three
 *     WARN, score 85, B) and those of a site with none of the files (nine
 *     FAIL, one WARN, score 5, F) are, detail for detail, what the route
 *     reported before the read limit; and an /llms.txt that starts with two
 *     byte order marks and holds two bytes that are not UTF-8 is r02 PASS
 *     with the length of the text resp.text() gives for it.
 *   - An error or redirect body is held to the limit of the read that
 *     receives it. designesy_tokens_score (4 MiB) and designesy_motion_score
 *     (16 MiB) on a 500 whose body is 20 MiB each fail with "Fetch failed:
 *     500 Internal Server Error", as before, and readiness r02 on an
 *     /llms.txt that answers 500 with such a body is not found (every check
 *     as on an empty site), as before; in each, at most one socket read past
 *     the limit of that read reached the client, the request was destroyed,
 *     and the server never finished sending. A
 *     302 whose body is 20 MiB, read by designesy_tokens_score and by
 *     readiness r02, leads to the next hop once at most one socket read past
 *     the 4 MiB limit of that body has reached the client and before the
 *     server has sent all of it (the server records both as the next request
 *     arrives), and the URL it lands on is read.
 *   - Last: nothing was thrown during the run where no caller could catch it
 *     (an uncaught exception or an unhandled rejection). One thrown before the
 *     first case starts (a module that does not load) ends the run with
 *     exit 1 and prints it.
 *
 * PROVING IT CAN FAIL
 * --app <dir> runs the gate against another apps/site directory. Against a
 * source snapshot of main from before engine 1.5.4, which has no
 * maxBodyBytes, the 10 MiB body comes back whole and the exact-size case
 * finds no cutByBudget. The listener case fails there too: every read but
 * the 999 leaves a listener (two after the redirect), and the cap, budget,
 * gzip, corrupt gzip and 999 reads settle some other way, the 999 only at
 * its signal, after a throw nothing catches, which fails the last case. Its
 * MCP route, like engine 1.5.4's, passed safeFetch no signal: against
 * either, the three MCP drips are still open at the case deadline, and the
 * source case finds three safeFetch calls and no readUrl. Of the cases from
 * before the MCP read limits, the others hold there. Against engine 1.5.4's
 * url-guard, which left the listener registered, the listener case is the
 * only one of those that fails: each read settles as labelled
 * and leaves a listener (two after the redirect). A url-guard that skips the
 * removal at one of its three places leaves the listener after the 999 and
 * corrupt gzip reads (fail), after the five reads that resolve (finish), or
 * after the failed read (the request's 'error' handler). The 10 MiB case and
 * the chunk, signal and last cases each fail against a url-guard changed to
 * break them: one that holds cap + 1 bytes but reads the socket to its end
 * receives all 10 MiB; one that hands the Response Buffer.concat's bytes
 * uncopied puts the 9 byte and the 101 byte chunks in the shared pool,
 * beside the earlier read's body; one that never listens to the caller's
 * signal leaves the drip open at the case deadline; and a rejection left
 * unhandled, or a throw in a timer, fails the last. main's MCP route, which
 * passed no signal and so kept url-guard's 15 s idle timeout, holds the 8 s
 * quiet case.
 *
 * Against the MCP route from before the read limits, whose readUrl takes no
 * limit and passes safeFetch no maxBodyBytes, with the rest of the tree as
 * it is, 12 cases fail: the three over-limit cases, the gzip Lottie file of
 * exactly 16 MiB, the two 302 cases (the token file past the limit and the
 * gzip Lottie file of exactly 16 MiB), the deflate and br token files past
 * the limit, the br Lottie files, the two 500 cases, the 302 whose body is
 * 20 MiB, and the source case. Every control holds. Each identity body past
 * a limit is read whole and scored or returned, so the tool returns a
 * result, not an error; in designesy_llms_txt the second identity read is
 * answered from the route's cache, so no request reaches the server. Each
 * compressed body past a limit, and each compressed Lottie file of exactly
 * 16 MiB, fails with url-guard's "the decoded body is over 4194304 bytes".
 * Each 20 MiB error or redirect body is received whole. The source case
 * finds a readUrl that takes no limit. Two changes to the new readUrl each
 * fail cases too. One that checks the length before the status fails the
 * 404 control in all three tools and the two 500 cases, each with the
 * over-limit message in place of the status. One that checks the length but
 * passes safeFetch no maxBodyBytes fails the same 12 cases as the route from
 * before the limits. A textWithin (url-guard, shared by both routes) that
 * fails a body of exactly its limit (`>=` for `>`) fails the eight cases
 * that read a body of exactly a limit: seven MCP reads and the readiness
 * exact-limit control. The ordinary page, the three identity exact-limit reads,
 * the 404s, the JSON.parse messages and the two MCP reads of a URL that
 * answers are controls: they pin what a change to the transport or the MCP
 * route must keep.
 *
 * Against the readiness route from before its read limit, which passes
 * safeFetch no maxBodyBytes, with the rest of the tree as it is, 12 cases
 * fail: the four single-file cases (r02, r08, r10 and r04), the r02 302
 * case, the every-file case, the /open.json case, the later-path case, the
 * r02 500 case, the r02 302 whose body is 20 MiB, the readiness source case
 * and the cache key case. The four readiness controls hold: the files of
 * exactly the limit, the 404s past the limit, the llms.txt that starts with
 * two byte order marks, and the small and empty sites. Each identity body
 * past the limit is read whole and judged: r02, r04, r08 and r10 PASS, r10
 * for the 404 home page too, and on the later-path sites each file is PASS,
 * but for r07's fallback agent.json, which is WARN ("Component documentation
 * found but not machine-readable"). Each gzip body past it fails url-guard's
 * 4 MiB default, so r02 and r08 are FAIL as not found, r04 is FAIL ("No MCP
 * endpoint detected at /api/mcp"), and the gzip home page fails the whole
 * scan (HTTP 502, "Could not fetch the target URL"). On the every-file site
 * all ten checks PASS, r07 judges the /open.json read whole ("Component
 * documentation found but not machine-readable"), each 20 MiB error or
 * redirect body is received whole, and the readiness source case finds no
 * READ_LIMIT. Five changes to the new route each fail cases too. One that
 * checks the limit only on an ok response, and so hands r10 a 404 page's cut
 * body, fails the r10 case: r10 is PASS for the cut 404 page. One that
 * checks the length but passes safeFetch no maxBodyBytes receives each
 * identity body past the limit to its end and fails each gzip body at
 * url-guard's default, which fails nine cases: the four single-file cases,
 * the r02 302 case, the r02 500 case, the r02 302 whose body is 20 MiB, the
 * later-path case and the readiness source case. One whose probePaths goes
 * on past a file that is too large reports it as not found, which fails five
 * cases: r02, r02 302, every-file, /open.json and later-path. One whose
 * probePaths stops only at the first path of a list (`result.ok &&
 * result.tooLarge && path === paths[0]`) fails the later-path case alone. One
 * whose r09 reports a robots.txt past the limit whatever its status (`if
 * (result.tooLarge)`) fails the 404 control alone: r09 is WARN for a
 * robots.txt that answers 404.
 *
 * A url-guard that drops maxBodyBytes after the first hop of a redirect fails
 * the three redirect cases: the token file and the llms.txt are read to
 * their end on the URL they land on (the verdicts stay right, since each
 * route compares the length), and the gzip Lottie file fails at the 4 MiB
 * default. The deflate and br cases past a limit, and the br Lottie file of
 * exactly 16 MiB, fail on a route that passes no limit of its own, as the
 * gzip ones do. A readUrl that decodes a body with TextDecoder fails the
 * case of a token file that starts with two byte order marks. The deflate
 * and br token files of exactly 4 MiB, and the readiness llms.txt that
 * starts with two byte order marks, are controls: they hold on the code from
 * before the read limits too.
 *
 * The five error and redirect body cases fail on the tree from before the
 * read limits, whose reads passed no maxBodyBytes: each 20 MiB body is
 * received whole (the 302's before the next hop is requested), while each
 * tool's error and the r02 verdict are what they are now. A url-guard that
 * holds only a 2xx body to maxBodyBytes fails the same five cases and the
 * r10 case, whose 404 home page past the limit is then received whole.
 *
 * The cache key case fails on the tree from before the read limits, whose
 * readiness and report caches carry no such part, and on one whose report
 * cache alone lacks it.
 *
 * Against the tree from before the requests and deadline cases, seven of
 * them fail: the POST case (each URL receives a POST with 0 body bytes), the
 * body kinds case (below), the mcp-handler r04 case (WARN with HTTP 400,
 * also through the 307 and the 302), the 6 s mid-body case (it ends at 5 s
 * with "SSRF guard: fetch timeout"), the keep-alive case (at 4 s after the
 * 5 s Keep-Alive timeout and at 1 s after the 2 s one), the 8 s callers case
 * (r02 is FAIL, the score route reports the page unreachable and page-fetch
 * reads nothing) and the silent page case (unreachable at about 10 s,
 * because the request failed at the network level). Its MCP route passed
 * its 15 s deadline as an idle timeout too, so the silent MCP case holds
 * there; with that taken out, the silent MCP case and the 8 s quiet case
 * fail at 5 s. A url-guard that leaves the agent's idle timeout on for a
 * read given a signal fails the 6 s mid-body, keep-alive, silent MCP, 8 s
 * quiet, 8 s callers and silent page cases. One that follows every redirect
 * with the caller's method and body fails the POST case after the 301, the
 * 302 and the 303 (and the PUT after the 303), and the r04 case through the
 * 302. The POST case also
 * fails against a url-guard that keeps content-language and
 * content-location on the GET, one that makes a PUT a GET after a 302, one
 * that makes a 308 a GET, and one that repeats a POST after a 301.
 *
 * On that tree each body of the body kinds case arrives with content-length
 * 0, and URLSearchParams, a body on a GET and a body on a HEAD are each sent
 * (HTTP 404, as the server lists none of those URLs). Against the tree that
 * merged the read limits into this change, before the guard checked a body
 * ahead of the DNS check, it fails on the three refusals: URLSearchParams
 * is refused only after its host is looked up, and the GET and the HEAD are
 * sent with their body. A url-guard that counts a string body's length in
 * characters, one that sends the whole buffer behind a view, one that sends
 * a URLSearchParams body as no body, one that checks the body only as each
 * hop is requested, and one that sends a body with a GET or HEAD each fail
 * it.
 *
 * The no-signal case and the call-site case hold on the trees from before
 * this change and from before the read limits, where each of those reads
 * had its timer and a read given no signal had the same 15 s idle timeout;
 * they pin both for a later change. A url-guard that sets no idle timeout
 * on any read leaves the no-signal read open at the case deadline, and a
 * page-fetch whose fetchText passes no signal, or whose timer does not
 * abort it, fails the call-site case.
 *
 * Run against the tree from before the read limits (url-guard, MCP route and
 * readiness route from before them), 31 of the 58 cases fail and every
 * control holds: the 24 the read limits make fail there, and the seven
 * above.
 *
 * Usage:  node scripts/check-fetch-bounds.mjs [--app <dir>]
 * Exits 1 on any failure.
 */

import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argApp = process.argv.indexOf('--app');
const APP = argApp > 0 ? path.resolve(process.argv[argApp + 1]) : path.join(HERE, '..');
const require = createRequire(import.meta.url);
const { createHarness } = require('./lib/route-harness.js');

const MiB = 1024 * 1024;
/** How long a timed case may run past its expected end before it fails. */
const MARGIN_S = 2;
/** A case still open this long after it started has no bound at all. */
const CASE_DEADLINE_S = 30;
/** READ_DEADLINE_MS in app/api/mcp/route.ts. */
const MCP_DEADLINE_S = 15;
/** The read limit of each place app/api/mcp/route.ts calls readUrl, in bytes (LOTTIE_READ_LIMIT and READ_LIMIT there). */
const MCP_READ_LIMITS = { cachedFetch: 4 * MiB, designesy_tokens_score: 4 * MiB, designesy_motion_score: 16 * MiB };
const TOKENS_LIMIT = MCP_READ_LIMITS.designesy_tokens_score;
const LOTTIE_LIMIT = MCP_READ_LIMITS.designesy_motion_score;
const DOC_LIMIT = MCP_READ_LIMITS.cachedFetch;
/** READ_LIMIT in app/api/readiness/route.ts, in bytes: what each GET probe and r04's read hold. */
const READINESS_LIMIT = 4 * MiB;
/** The key part the readiness and report routes' caches carry since the read limits, so no result cached before them is read. */
const CACHE_KEY_PART = 'read-limit-4mib';
/** How far past its limit an over-limit body runs. */
const PAST_LIMIT = MiB;
/** The deadline the transport-level drip case passes as its own signal. */
const SIGNAL_DEADLINE_S = 3;
/** How long the quiet case's server sends nothing mid-body: longer than the 5 s idle timeout of Node's global agent. */
const QUIET_S = 6;
/**
 * The keep-alive case: each [Keep-Alive timeout its first answer gives, how
 * long its second is quiet], and the signal of each read. Node's agent then
 * ends a quiet socket 1 s before that timeout: after 4 s for 5, and 1 s for 2.
 */
const KEEP_ALIVE = [[5, 4.5], [2, 1.5]];
const KEEP_ALIVE_SIGNAL_S = 5;
/** url-guard's idle timeout for a read given no signal. */
const NO_SIGNAL_IDLE_S = 15;
/** The deadline of the readiness probes, the score route's page read and page-fetch's (an 8 s abort in each). */
const CALLER_DEADLINE_S = 8;
/** The listener case's signals: they outlive each read, and end one that never settles before the case deadline. */
const LISTEN_SIGNAL_S = 10;
/** Node hands a socket's bytes to the response in reads of at most 64 KiB, so this much can arrive past a cap before the check sees it. */
const ONE_READ = 64 * 1024;
/** How far a paced body may run ahead of what the client has received. */
const PACE_WINDOW = 256 * 1024;
/** How long a destroyed request is watched for bytes that still arrive. */
const SETTLE_MS = 300;

const PAGE = '<!doctype html><html lang="en"><head><title>Fetch bounds</title></head><body><main><h1>Fetch bounds</h1><p>A page that answers at once.</p></main></body></html>';
const TOKENS = JSON.stringify({
  $schema: 'https://www.designtokens.org/schemas/2025.10/format.json',
  color: { ink: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.07, 0.07, 0.07] }, $description: 'Body text.' } },
});
const LOTTIE = JSON.stringify({ v: '5.12.2', fr: 60, ip: 0, op: 18, w: 64, h: 64, layers: [], markers: [{ cm: 'reduced-motion', tm: 0, dr: 0 }], meta: { g: 'fetch bounds' } });

/** host + path -> the client side of the last request: body bytes received, and the request. */
const seen = new Map();

/** Hosts answered by a server of their own (KEEP_ALIVE_PORT), so no other case's request takes the connection it keeps alive. */
const KEEP_ALIVE_HOSTS = new Set(['keepalive.example.com']);

// The guard's sockets reach the local server; every other option (the
// method, the headers, the timeout, the signal handling) is the guard's own.
const toLocal = (real) => ({
  ...real,
  request(opts, cb) {
    const key = `${opts.hostname}${opts.path}`;
    const port = KEEP_ALIVE_HOSTS.has(opts.hostname) ? KEEP_ALIVE_PORT : PORT;
    const o = { ...opts, hostname: '127.0.0.1', port, headers: { ...(opts.headers || {}), 'x-fetch-bounds-host': opts.hostname } };
    delete o.lookup;
    const record = { received: 0, req: null, wake: null };
    seen.set(key, record);
    record.req = http.request(o, (res) => {
      res.on('data', (c) => {
        record.received += c.length;
        // A paced body waiting on the client goes on.
        const wake = record.wake;
        record.wake = null;
        if (wake) wake();
      });
      cb(res);
    });
    return record.req;
  },
});
/** Every host the guard's DNS check was asked about. */
const looked = new Set();
const lookup = async (hostname) => {
  looked.add(hostname);
  return [{ address: '93.184.215.14', family: 4 }];
};

/**
 * Errors thrown where no caller could catch them (in a stream listener, say):
 * the last case fails on any. One that arrives before the cases start (a
 * module that does not load, say) ends the run at once with exit 1. These
 * listeners take such an error from Node, which would otherwise print it and
 * exit 1 itself, so without that a run that never reached a case exited 0.
 */
const uncaught = [];
let casesStarted = false;
const onUncaught = (kind) => (e) => {
  const text = `${kind} ${e && e.name}: ${e && e.message}`;
  if (!casesStarted) {
    console.error(`Fetch bounds: ${text}, before any case ran.`);
    process.exit(1);
  }
  uncaught.push(text);
};
process.on('uncaughtException', onUncaught('uncaught'));
process.on('unhandledRejection', onUncaught('unhandled rejection'));

// The score route imports the DESIGN.md linter, an ES module, which the
// harness hands it as check-score-read-bounds.mjs does.
const { lint } = await import('@google/design.md/linter');
const h = createHarness({
  app: APP,
  realSafeFetch: true,
  lookup,
  stubs: { 'node:http': toLocal(http), 'node:https': toLocal(https), '@google/design.md/linter': { lint } },
});
const guard = h.load('app/lib/url-guard.ts');
const { safeFetch } = guard;
// Load the routes and page-fetch before any case starts, so no case's time includes their load.
h.load('app/api/mcp/route.ts');
h.load('app/api/readiness/route.ts');
h.load('app/api/score/route.ts');
const { fetchPageResilient } = h.load('app/lib/page-fetch.ts');

// ── Bodies ───────────────────────────────────────────────────────────────────

/** Printable bytes whose value at offset i is fixed by i, so a cut body can be checked byte for byte. */
const PATTERN = Buffer.alloc(10 * MiB);
for (let i = 0; i < PATTERN.length; i++) PATTERN[i] = 0x21 + (i % 89);

/** An earlier read's body: no later read's chunk may reach these bytes. */
const EARLIER = 'fetch bounds: the body of an earlier read, which no later reader may reach';

/** `json`, one JSON object, as exactly n bytes: spaces after its opening brace, so a body cut anywhere does not parse. */
function jsonOfSize(json, n) {
  const pad = n - Buffer.byteLength(json);
  assert.ok(pad >= 0, `${json.length} bytes of JSON do not fit in ${n}`);
  return Buffer.from(`{${' '.repeat(pad)}${json.slice(1)}`);
}

/** The last line of a document of docOfSize: a document cut anywhere lacks it. */
const DOC_END = 'The last line of the document.\n';
/** A text document of exactly n bytes. */
function docOfSize(n) {
  const head = '# Read limits\n\n';
  return Buffer.from(`${head}${'a'.repeat(n - head.length - DOC_END.length - 1)}\n${DOC_END}`);
}

const TOKENS_AT = jsonOfSize(TOKENS, TOKENS_LIMIT);
const TOKENS_OVER = jsonOfSize(TOKENS, TOKENS_LIMIT + PAST_LIMIT);
const LOTTIE_AT = jsonOfSize(LOTTIE, LOTTIE_LIMIT);
const LOTTIE_OVER = jsonOfSize(LOTTIE, LOTTIE_LIMIT + PAST_LIMIT);
const DOC_AT = docOfSize(DOC_LIMIT);
const DOC_OVER = docOfSize(DOC_LIMIT + PAST_LIMIT);
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
/** One byte past each limit, decoded. */
const TOKENS_PAST_ONE = jsonOfSize(TOKENS, TOKENS_LIMIT + 1);
const LOTTIE_PAST_ONE = jsonOfSize(LOTTIE, LOTTIE_LIMIT + 1);
/** Each content coding a case below sends: its Content-Encoding and its encoder. Raw deflate is sent as deflate, as some servers send it. */
const CODINGS = {
  deflate: ['deflate', (b) => zlib.deflateSync(b)],
  raw: ['deflate', (b) => zlib.deflateRawSync(b)],
  br: ['br', (b) => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })],
};
/** `bytes` sent in `coding` (a CODINGS key), and the length it decodes to. */
const coded = (coding, bytes, type = 'application/json') => ({ bytes: CODINGS[coding][1](bytes), encoding: CODINGS[coding][0], decoded: bytes.length, type });
const NOT_JSON = 'this is not json';
/** The body a 500 or a 302 below carries: 20 MiB, past every read limit. A reader skips such a body, but receives it. */
const NOISE = Buffer.alloc(20 * MiB, 0x65);

// host + path -> what the server sends. Each case below owns its URLs, but
// designesy_llms_txt's: llmsTurn sets what www.designesy.org/llms.txt sends.
// bytes: sent in 64 KiB pieces; paced: at most PACE_WINDOW ahead of the
// client; length: with a content-length header.
const ROUTES = {
  'ok.example.com/': { body: PAGE },
  'big.example.com/ten': { bytes: PATTERN },
  'exact.example.com/': { bytes: PATTERN.subarray(0, MiB) },
  'own-earlier.example.com/': { body: EARLIER, type: 'text/plain' },
  'own-small.example.com/': { body: 'nine byte', type: 'text/plain' },
  'own-cut.example.com/': { bytes: PATTERN.subarray(0, 2 * MiB) },
  'own-large.example.com/': { bytes: PATTERN.subarray(0, MiB) },
  'drip.example.com/': { drip: true },
  'listen-ok.example.com/': { body: PAGE },
  'listen-cut.example.com/': { bytes: PATTERN.subarray(0, 2 * MiB) },
  'listen-hop.example.com/': { status: 302, location: 'https://listen-landed.example.com/' },
  'listen-landed.example.com/': { body: PAGE },
  'listen-reset.example.com/': { reset: true },
  'listen-nines.example.com/': { status: 999, body: 'Request denied', type: 'text/plain' },
  'listen-gzip.example.com/': { bytes: zlib.gzipSync(PAGE), encoding: 'gzip' },
  'listen-corrupt.example.com/': { bytes: Buffer.from('this body says it is gzip and it is not'), encoding: 'gzip' },
  'listen-budget.example.com/': { bytes: PATTERN.subarray(0, 2 * MiB) },
  'tokens-drip.example.com/tokens.json': { drip: true },
  'motion-drip.example.com/anim.json': { drip: true },
  'tokens-over.example.com/plain.json': { bytes: TOKENS_OVER, paced: true, type: 'application/json' },
  'tokens-over.example.com/length.json': { bytes: TOKENS_OVER, paced: true, length: true, type: 'application/json' },
  'tokens-over.example.com/gzip.json': { bytes: zlib.gzipSync(TOKENS_OVER), encoding: 'gzip', decoded: TOKENS_OVER.length, type: 'application/json' },
  'tokens-at.example.com/tokens.json': { bytes: TOKENS_AT, type: 'application/json' },
  'tokens-404.example.com/tokens.json': { status: 404, bytes: TOKENS_OVER, paced: true },
  'motion-over.example.com/plain.json': { bytes: LOTTIE_OVER, paced: true, type: 'application/json' },
  'motion-over.example.com/length.json': { bytes: LOTTIE_OVER, paced: true, length: true, type: 'application/json' },
  'motion-over.example.com/gzip.json': { bytes: zlib.gzipSync(LOTTIE_OVER), encoding: 'gzip', decoded: LOTTIE_OVER.length, type: 'application/json' },
  'motion-at.example.com/anim.json': { bytes: LOTTIE_AT, type: 'application/json' },
  'motion-at.example.com/gzip.json': { bytes: zlib.gzipSync(LOTTIE_AT), encoding: 'gzip', decoded: LOTTIE_AT.length, type: 'application/json' },
  'motion-404.example.com/anim.json': { status: 404, bytes: LOTTIE_OVER, paced: true },
  'www.designesy.org/contracts/skill': { bytes: DOC_AT, type: 'text/markdown' },
  'tokens-parse.example.com/not.json': { body: NOT_JSON, type: 'application/json' },
  'tokens-parse.example.com/bom.json': { bytes: Buffer.concat([BOM, Buffer.from(TOKENS)]), type: 'application/json' },
  'tokens-parse.example.com/two-boms.json': { bytes: Buffer.concat([BOM, BOM, Buffer.from(TOKENS)]), type: 'application/json' },
  'www.designesy.org/.well-known/agent.json': { body: NOT_JSON, type: 'application/json' },
  'tokens-ok.example.com/tokens.json': { body: TOKENS, type: 'application/json' },
  'tokens-late.example.com/tokens.json': { body: TOKENS, type: 'application/json', delayMs: 8000 },
  'www.designesy.org/llms-full.txt': { body: '# Fetch bounds\n\nA published document that answers at once.\n', type: 'text/plain' },
  // A 302 to a body past the limit, sent with no content coding, and to a gzip Lottie file of exactly the limit.
  'tokens-hop.example.com/tokens.json': { status: 302, location: 'https://tokens-hop-landed.example.com/tokens.json' },
  'tokens-hop-landed.example.com/tokens.json': { bytes: TOKENS_OVER, paced: true, type: 'application/json' },
  'motion-hop.example.com/anim.json': { status: 302, location: 'https://motion-hop-landed.example.com/gzip.json' },
  'motion-hop-landed.example.com/gzip.json': { bytes: zlib.gzipSync(LOTTIE_AT), encoding: 'gzip', decoded: LOTTIE_AT.length, type: 'application/json' },
  // deflate (zlib and raw) and br bodies of exactly each limit and one byte past it, decoded.
  ...Object.fromEntries(Object.keys(CODINGS).flatMap((c) => [
    [`tokens-coded.example.com/${c}-at.json`, coded(c, TOKENS_AT)],
    [`tokens-coded.example.com/${c}-over.json`, coded(c, TOKENS_PAST_ONE)],
  ])),
  'motion-coded.example.com/br-at.json': coded('br', LOTTIE_AT),
  'motion-coded.example.com/br-over.json': coded('br', LOTTIE_PAST_ONE),
  // A 500 for each tool that reads a URL, and a 302, each with a 20 MiB body
  // (paced), and the token file the 302 leads to.
  'tokens-500.example.com/tokens.json': { status: 500, bytes: NOISE, paced: true },
  'motion-500.example.com/anim.json': { status: 500, bytes: NOISE, paced: true },
  'tokens-302.example.com/tokens.json': { status: 302, location: 'https://tokens-302-landed.example.com/tokens.json', bytes: NOISE, paced: true },
  'tokens-302-landed.example.com/tokens.json': { body: TOKENS, type: 'application/json', hopFrom: 'tokens-302.example.com/tokens.json' },
  // A POST, sent straight and through each kind of redirect, and the URLs it lands on.
  'post-direct.example.com/rpc': { body: 'ok', type: 'text/plain' },
  'post-307.example.com/rpc': { status: 307, location: 'https://post-landed-307.example.com/rpc' },
  'post-landed-307.example.com/rpc': { body: 'ok', type: 'text/plain' },
  'post-302.example.com/rpc': { status: 302, location: 'https://post-landed-302.example.com/rpc' },
  'post-landed-302.example.com/rpc': { body: 'ok', type: 'text/plain' },
  'post-303.example.com/rpc': { status: 303, location: 'https://post-landed-303.example.com/rpc' },
  'post-landed-303.example.com/rpc': { body: 'ok', type: 'text/plain' },
  'post-301.example.com/rpc': { status: 301, location: 'https://post-landed-301.example.com/rpc' },
  'post-landed-301.example.com/rpc': { body: 'ok', type: 'text/plain' },
  'post-308.example.com/rpc': { status: 308, location: 'https://post-landed-308.example.com/rpc' },
  'post-landed-308.example.com/rpc': { body: 'ok', type: 'text/plain' },
  // A PUT through a 302, which repeats it, and through a 303, which makes it a GET.
  'put-302.example.com/rpc': { status: 302, location: 'https://put-landed-302.example.com/rpc' },
  'put-landed-302.example.com/rpc': { body: 'ok', type: 'text/plain' },
  'put-303.example.com/rpc': { status: 303, location: 'https://put-landed-303.example.com/rpc' },
  'put-landed-303.example.com/rpc': { body: 'ok', type: 'text/plain' },
  // Bodies of each kind the guard sends.
  'body-kinds.example.com/text': { body: 'ok', type: 'text/plain' },
  'body-kinds.example.com/buffer': { body: 'ok', type: 'text/plain' },
  'body-kinds.example.com/view': { body: 'ok', type: 'text/plain' },
  // Servers that go quiet: mid-body, after the headers for good, and before
  // the headers on a connection an earlier answer kept alive.
  'quiet.example.com/': { bytes: Buffer.from(PAGE), length: true, pause: QUIET_S * 1000 },
  'tokens-silent.example.com/tokens.json': { silent: true, type: 'application/json' },
  ...Object.fromEntries(KEEP_ALIVE.flatMap(([hint, quiet]) => [
    [`keepalive.example.com/first-${hint}`, { body: 'the first answer', type: 'text/plain', keepAlive: hint }],
    [`keepalive.example.com/quiet-${hint}`, { body: PAGE, type: 'text/html', delayMs: quiet * 1000 }],
  ])),
  // Headers, and then nothing, read with no signal.
  'nosignal-silent.example.com/': { silent: true, type: 'text/plain' },
  // A page whose server is quiet for QUIET_S before it answers, for the score route and for page-fetch.
  'score-quiet.example.com/': { body: PAGE, type: 'text/html', delayMs: QUIET_S * 1000 },
  'page-quiet.example.com/': { body: PAGE, type: 'text/html', delayMs: QUIET_S * 1000 },
  // A page that sends its headers and then nothing, on both of the score route's candidate URLs (https and http).
  'www.score-silent.example.com/': { silent: true, type: 'text/html' },
};
const LLMS = 'www.designesy.org/llms.txt';
const LLMS_OVER = { bytes: DOC_OVER, paced: true, type: 'text/plain' };
const LLMS_OVER_LENGTH = { bytes: DOC_OVER, paced: true, length: true, type: 'text/plain' };
const LLMS_OVER_GZIP = { bytes: zlib.gzipSync(DOC_OVER), encoding: 'gzip', decoded: DOC_OVER.length, type: 'text/plain' };
const LLMS_404 = { status: 404, bytes: DOC_OVER, paced: true };

// The readiness route reads every file from the origin of the URL it scans,
// so each readiness site below is a host of its own; a path a site does not
// list answers 404.

/** `head`, spaces, then `tail`, as exactly n bytes. */
function textOfSize(head, tail, n) {
  const pad = n - Buffer.byteLength(head) - Buffer.byteLength(tail);
  assert.ok(pad >= 0, `${head.length + tail.length} bytes do not fit in ${n}`);
  return Buffer.from(`${head}${' '.repeat(pad)}${tail}`);
}
/** A sitemap of exactly n bytes: r08 passes on it, read whole. */
const sitemapOfSize = (n) => textOfSize('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n', '<url><loc>https://ready.example.com/</loc></url>\n</urlset>\n', n);
/** A home page of exactly n bytes with Open Graph and Twitter card tags: r10 passes on it, read whole. */
const homeOfSize = (n) => textOfSize('<!doctype html><html lang="en"><head><title>Read limits</title><meta property="og:title" content="Read limits"><meta name="twitter:card" content="summary"></head><body>', '<main><h1>Read limits</h1></main></body></html>\n', n);
/** A tools/list answer with one tool: r04 passes on it, read whole. */
const MCP_ANSWER = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'read_limits', inputSchema: { type: 'object' } }] } });
/** A body each of the ten checks passes on, read whole: a tools/list answer whose text holds what the other nine look for. */
const EVERY_CHECK = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'read_limits' }] }, holds: "<urlset> $type $value $description identity component <meta property='og:title'> <meta name='twitter:card'>" });
const READY_OVER = READINESS_LIMIT + PAST_LIMIT;
const READY_LLMS_OVER = docOfSize(READY_OVER);
const READY_SITEMAP_OVER = sitemapOfSize(READY_OVER);
const READY_HOME_OVER = homeOfSize(READY_OVER);
const READY_MCP_OVER = jsonOfSize(MCP_ANSWER, READY_OVER);
const READY_EVERY_OVER = jsonOfSize(EVERY_CHECK, READY_OVER);
/** A body served as gzip, and the length it decodes to. */
const gzipped = (bytes, type) => ({ bytes: zlib.gzipSync(bytes), encoding: 'gzip', decoded: bytes.length, type });

const READY_FILES = {
  // One file 1 MiB past the limit, sent with no content coding (paced) or as gzip.
  'ready-llms.example.com': { '/llms.txt': { bytes: READY_LLMS_OVER, paced: true, type: 'text/plain' } },
  'ready-llms-gzip.example.com': { '/llms.txt': gzipped(READY_LLMS_OVER, 'text/plain') },
  'ready-sitemap.example.com': { '/sitemap.xml': { bytes: READY_SITEMAP_OVER, paced: true, type: 'application/xml' } },
  'ready-sitemap-gzip.example.com': { '/sitemap.xml': gzipped(READY_SITEMAP_OVER, 'application/xml') },
  'ready-home.example.com': { '/': { bytes: READY_HOME_OVER, paced: true } },
  'ready-home-gzip.example.com': { '/': gzipped(READY_HOME_OVER, 'text/html') },
  'ready-home-404.example.com': { '/': { status: 404, bytes: READY_HOME_OVER, paced: true } },
  'ready-mcp.example.com': { '/api/mcp': { bytes: READY_MCP_OVER, paced: true, type: 'application/json' } },
  'ready-mcp-gzip.example.com': { '/api/mcp': gzipped(READY_MCP_OVER, 'application/json') },
  // Every file each check reads, 1 MiB past the limit (one body, so the two
  // token checks' reads of /tokens.json are not paced).
  'ready-all.example.com': Object.fromEntries(['/tokens.json', '/llms.txt', '/.well-known/agent.json', '/api/mcp', '/DESIGN.md', '/components.json', '/sitemap.xml', '/robots.txt', '/']
    .map((p) => [p, { bytes: READY_EVERY_OVER, type: 'application/json' }])),
  // r07's second search: no component schema, and /open.json past the limit.
  'ready-open.example.com': { '/open.json': { bytes: READY_EVERY_OVER, type: 'application/json' } },
  // A file past the limit at each later path a check tries, every path before
  // it answering 404: the second path of each list, the third, the fourth, and
  // the second of r07's fallback (/.well-known/agent.json, which r03 reads
  // first). A file only one check reads is paced; the token files, which r01
  // and r06 both read, and the fallback's agent.json are not.
  'ready-second.example.com': {
    '/design-tokens.json': { bytes: READY_EVERY_OVER, type: 'application/json' },
    '/.well-known/llms.txt': { bytes: READY_LLMS_OVER, paced: true, type: 'text/plain' },
    '/agent.json': { bytes: READY_EVERY_OVER, paced: true, type: 'application/json' },
    '/design.md': { bytes: READY_LLMS_OVER, paced: true, type: 'text/markdown' },
    '/contracts/components.json': { bytes: READY_EVERY_OVER, paced: true, type: 'application/json' },
  },
  'ready-third.example.com': {
    '/contracts/tokens.json': { bytes: READY_EVERY_OVER, type: 'application/json' },
    '/component-schema.json': { bytes: READY_EVERY_OVER, paced: true, type: 'application/json' },
  },
  'ready-fourth.example.com': { '/export/tokens.json': { bytes: READY_EVERY_OVER, type: 'application/json' } },
  'ready-fallback.example.com': { '/.well-known/agent.json': { bytes: READY_EVERY_OVER, type: 'application/json' } },
  // Controls: files of exactly the limit, and 404s whose body is past it.
  'ready-at.example.com': {
    '/llms.txt': { bytes: docOfSize(READINESS_LIMIT), type: 'text/plain' },
    '/sitemap.xml': { bytes: sitemapOfSize(READINESS_LIMIT), type: 'application/xml' },
    '/': { bytes: homeOfSize(READINESS_LIMIT) },
    '/api/mcp': { bytes: jsonOfSize(MCP_ANSWER, READINESS_LIMIT), type: 'application/json' },
  },
  'ready-at-gzip.example.com': { '/llms.txt': gzipped(docOfSize(READINESS_LIMIT), 'text/plain') },
  // An llms.txt reached through a 302, 1 MiB past the limit on the host it lands on.
  'ready-hop.example.com': { '/llms.txt': { status: 302, location: 'https://ready-hop-landed.example.com/llms.txt' } },
  'ready-hop-landed.example.com': { '/llms.txt': { bytes: READY_LLMS_OVER, paced: true, type: 'text/plain' } },
  // An llms.txt that answers 500 with a 20 MiB body, and one reached through a 302 whose body is 20 MiB.
  'ready-500.example.com': { '/llms.txt': { status: 500, bytes: NOISE, paced: true, type: 'text/plain' } },
  'ready-302.example.com': { '/llms.txt': { status: 302, location: 'https://ready-302-landed.example.com/llms.txt', bytes: NOISE, paced: true } },
  'ready-302-landed.example.com': { '/llms.txt': { body: '# Read limits\n\nA brief reached through a redirect.\n', type: 'text/plain', hopFrom: 'ready-302.example.com/llms.txt' } },
  // An MCP endpoint built with mcp-handler (mcpEndpoint, below), which reads the request it is sent.
  'ready-mcp-handler.example.com': { '/api/mcp': { mcp: true } },
  // Sites whose /api/mcp redirects to that endpoint with a 307 and with a 302.
  'ready-mcp-307.example.com': { '/api/mcp': { status: 307, location: 'https://ready-mcp-handler.example.com/api/mcp' } },
  'ready-mcp-302.example.com': { '/api/mcp': { status: 302, location: 'https://ready-mcp-handler.example.com/api/mcp' } },
  // An llms.txt whose server is quiet for QUIET_S before it answers.
  'ready-quiet.example.com': { '/llms.txt': { body: '# Read limits\n\nA brief sent after a quiet start.\n', type: 'text/plain', delayMs: QUIET_S * 1000 } },
  // An llms.txt that starts with two byte order marks and holds two bytes that are not UTF-8.
  'ready-bom.example.com': { '/llms.txt': { bytes: Buffer.concat([BOM, BOM, Buffer.from('# Read limits\n\n'), Buffer.from([0xff, 0xfe]), Buffer.from('\nA brief.\n')]), type: 'text/plain' } },
  'ready-404.example.com': {
    '/llms.txt': { status: 404, bytes: READY_LLMS_OVER },
    '/sitemap.xml': { status: 404, bytes: READY_SITEMAP_OVER },
    '/robots.txt': { status: 404, bytes: READY_LLMS_OVER, type: 'text/plain' },
    '/api/mcp': { status: 404, bytes: READY_MCP_OVER },
  },
  // An ordinary small site, whose checks pass or warn by what the files say.
  'ready-small.example.com': {
    '/tokens.json': { body: TOKENS, type: 'application/json' },
    '/llms.txt': { body: '# Read limits\n\nA short brief for agents.\n', type: 'text/plain' },
    '/.well-known/agent.json': { body: JSON.stringify({ identity: { name: 'Read limits' } }), type: 'application/json' },
    '/api/mcp': { body: `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'a' }, { name: 'b' }] } })}\n\n`, type: 'text/event-stream' },
    '/DESIGN.md': { body: '# Design\n\nThe design brief.\n', type: 'text/markdown' },
    '/open.json': { body: JSON.stringify({ components: 'listed on the components page' }), type: 'application/json' },
    '/sitemap.xml': { body: sitemapOfSize(200).toString(), type: 'application/xml' },
    '/robots.txt': { body: 'User-agent: *\nDisallow: /\n', type: 'text/plain' },
    '/': { body: '<!doctype html><html lang="en"><head><title>Read limits</title><meta property="og:title" content="Read limits"></head><body><main><h1>Read limits</h1></main></body></html>' },
  },
};
for (const [host, files] of Object.entries(READY_FILES)) {
  for (const [p, route] of Object.entries(files)) ROUTES[`${host}${p}`] = route;
}

/** host + path -> what the server managed to send: bytes handed to the socket, and whether the body finished. */
const sent = new Map();
/**
 * host + path -> what the last request carried: its method, its
 * content-length, content-type, content-language and content-location
 * headers, an x-kept header that describes no body, and its body.
 */
const asked = new Map();

// An MCP endpoint built with mcp-handler, the package app/api/mcp/route.ts
// serves its tools with, listing one tool. It reads the request it is sent:
// a tools/list POST with no body is answered 400. The package resolves from
// the app checked, then from this checkout, as the harness's packages do.
const fromApp = createRequire(path.join(APP, 'package.json'));
const appRequire = (spec) => {
  try {
    return fromApp(spec);
  } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') return require(spec);
    throw e;
  }
};
const { z } = appRequire('zod');
const mcpEndpoint = appRequire('mcp-handler').createMcpHandler((mcp) => {
  mcp.registerTool('read_limits', { description: 'A tool the fetch bounds gate lists.', inputSchema: z.object({}) }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
}, { serverInfo: { name: 'fetch-bounds', version: '1.0.0' } });

/** Answers a request on the endpoint above. */
async function answerMcp(host, req, res, body) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && k !== 'x-fetch-bounds-host') headers.set(k, v);
  const r = await mcpEndpoint(new Request(`https://${host}${req.url}`, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body }));
  const text = await r.text();
  res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'text/plain' });
  res.end(text);
}

/** The connections the keep-alive case's server has accepted. */
let keepAliveConnections = 0;

// What a request found when it arrived is recorded then; it is answered once
// its body has been read, and the body is recorded in `asked`.
const handle = (req, res) => {
  const host = req.headers['x-fetch-bounds-host'];
  const key = `${host}${req.url}`;
  const b = ROUTES[key] || { status: 404, body: 'not here' };
  const stat = { written: 0, finished: false };
  // The next hop of a redirect: how far the redirect's body had got, on
  // each side, when this request arrived.
  if (b.hopFrom) {
    const from = sent.get(b.hopFrom);
    const client = seen.get(b.hopFrom);
    Object.assign(stat, { fromWritten: from ? from.written : null, fromFinished: from ? from.finished : null, fromReceived: client ? client.received : null });
  }
  sent.set(key, stat);
  res.on('error', () => {});
  res.on('finish', () => { stat.finished = true; });
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const requestBody = Buffer.concat(chunks);
    asked.set(key, {
      method: req.method,
      length: req.headers['content-length'],
      type: req.headers['content-type'],
      language: req.headers['content-language'],
      place: req.headers['content-location'],
      kept: req.headers['x-kept'],
      body: requestBody,
    });
    answer(b, key, host, req, res, stat, requestBody);
  });
};

function answer(b, key, host, req, res, stat, requestBody) {
  // A read that fails: the connection closes before any answer.
  if (b.reset) return req.socket.destroy();
  if (b.mcp) return answerMcp(host, req, res, requestBody);
  // A server that is quiet before it answers, well inside the read deadline.
  if (b.delayMs) {
    const t = setTimeout(() => { res.writeHead(200, { 'content-type': b.type }); res.end(b.body); }, b.delayMs);
    res.on('close', () => clearTimeout(t));
    return;
  }
  const headers = { 'content-type': b.type || 'text/html' };
  if (b.location) headers.location = b.location;
  if (b.encoding) headers['content-encoding'] = b.encoding;
  if (b.length) headers['content-length'] = String(b.bytes.length);
  // The Keep-Alive timeout a server gives, which Node's agent reads when it keeps the connection.
  if (b.keepAlive) headers['keep-alive'] = `timeout=${b.keepAlive}`;
  res.writeHead(b.status || 200, headers);
  // Headers, and then nothing: the connection stays open until the client closes it.
  if (b.silent) return res.flushHeaders();
  // The first 16 bytes, nothing for `pause` ms, then the rest.
  if (b.pause) {
    res.write(b.bytes.subarray(0, 16));
    const t = setTimeout(() => res.end(b.bytes.subarray(16)), b.pause);
    res.on('close', () => clearTimeout(t));
    return;
  }
  if (b.drip) {
    res.flushHeaders();
    const t = setInterval(() => { stat.written += 1; res.write('a'); }, 1000);
    res.on('close', () => clearInterval(t));
    return;
  }
  if (!b.bytes) return res.end(b.body || '');
  // Written in 64 KiB pieces with backpressure, so the socket closing stops it.
  let at = 0;
  const pump = () => {
    while (at < b.bytes.length) {
      if (res.destroyed) return;
      // A paced body waits until the client has received all but PACE_WINDOW of what was written.
      const client = seen.get(key);
      if (b.paced && client && at - client.received >= PACE_WINDOW) {
        client.wake = () => setImmediate(pump);
        return;
      }
      const piece = b.bytes.subarray(at, at + ONE_READ);
      at += piece.length;
      stat.written += piece.length;
      if (!res.write(piece)) {
        res.once('drain', pump);
        return;
      }
    }
    res.end();
  };
  pump();
}

const server = http.createServer(handle);
const keepAliveServer = http.createServer(handle);
keepAliveServer.on('connection', () => { keepAliveConnections += 1; });
for (const s of [server, keepAliveServer]) {
  s.requestTimeout = 0;
  s.headersTimeout = 0;
  // No Keep-Alive timeout of the server's own, so it closes no connection
  // and names none but the one a route gives.
  s.keepAliveTimeout = 0;
}
await new Promise((r) => server.listen(0, '127.0.0.1', r));
await new Promise((r) => keepAliveServer.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const KEEP_ALIVE_PORT = keepAliveServer.address().port;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** `work`'s Response; a rejection fails the case, naming the error. */
async function resolution(work) {
  try {
    return await work;
  } catch (e) {
    throw new Error(`rejected instead of resolving: ${e && e.message}`);
  }
}

/** The error `work` rejects with; a resolve fails the case, naming how much it returned. */
async function rejection(work) {
  let resp;
  try {
    resp = await work;
  } catch (e) {
    return e;
  }
  const bytes = resp instanceof Response ? (await resp.arrayBuffer()).byteLength : null;
  throw new Error(bytes === null ? 'resolved instead of rejecting' : `resolved with ${bytes} bytes (HTTP ${resp.status})`);
}

/**
 * Asserts a read of `key` with maxBodyBytes `cap` stopped at the cap: the
 * response holds exactly the body's first cap + 1 bytes, at most one socket
 * read past the cap reached the client, the request was destroyed, nothing
 * more arrived after it, and the server never finished. Says how far it got.
 */
async function heldToCap(key, cap, resp) {
  const rec = seen.get(key);
  assert.ok(rec && rec.req, `no request reached ${key}`);
  const atResolve = rec.received;
  const body = Buffer.from(await resp.arrayBuffer());
  assert.equal(body.length, cap + 1, `${body.length} bytes returned, not the ${cap} byte cap + 1`);
  assert.equal(Buffer.compare(body, ROUTES[key].bytes.subarray(0, cap + 1)), 0, 'the bytes returned are not the body\'s first bytes');
  assert.ok(atResolve <= cap + ONE_READ, `${atResolve} bytes received, more than one ${ONE_READ} byte read past the ${cap} byte cap`);
  assert.equal(rec.req.destroyed, true, 'the request was not destroyed');
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  assert.equal(rec.received, atResolve, `${rec.received - atResolve} more bytes arrived after the body was cut`);
  const s = sent.get(key);
  assert.equal(s.finished, false, `the server finished sending all ${ROUTES[key].bytes.length} bytes`);
  return `${body.length} bytes returned; ${atResolve} of ${ROUTES[key].bytes.length} received (${atResolve - cap} past the cap), server sent ${s.written} before the socket closed`;
}

/** How a read settled: the text of the Response `work` resolves with, or the error it rejects with. */
async function settledRead(work) {
  try {
    return { text: await (await work).text() };
  } catch (e) {
    return { err: e };
  }
}

/** The time, in seconds, `work` takes to reject, and the error. */
async function timedRejection(work) {
  const t0 = performance.now();
  const err = await rejection(work);
  return { err, s: (performance.now() - t0) / 1000 };
}

/** Asserts a run ended at `expect` seconds, within the margin. */
function endedAt(s, expect) {
  assert.ok(s <= expect + MARGIN_S, `${s.toFixed(2)} s is over the ${expect} s deadline plus ${MARGIN_S} s`);
  assert.ok(s >= expect - 0.5, `${s.toFixed(2)} s is under the ${expect} s deadline: something else ended the read`);
}

/** The first 120 characters of a tool's output. */
const clip = (text) => `${String(text).slice(0, 120)}${String(text).length > 120 ? '...' : ''}`;

/** An MCP tool call: whether it failed, and its error message (returned or thrown) or its payload. */
async function toolOutcome(tool, args) {
  try {
    const { result, payload } = await h.callTool(tool, args);
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return { failed: result.isError === true, message: String(payload && payload.error), payload, text };
  } catch (e) {
    return { failed: true, message: String(e && e.message), payload: null, text: '' };
  }
}

/** An MCP tool call that must fail; its error message, whether returned or thrown. */
async function toolError(tool, args) {
  const o = await toolOutcome(tool, args);
  assert.equal(o.failed, true, `${tool} returned a result, not an error: ${clip(o.text)}`);
  return o.message;
}

/** An MCP tool call that must not fail; its payload. */
async function toolResult(tool, args) {
  const o = await toolOutcome(tool, args);
  assert.equal(o.failed, false, `${tool} failed: ${o.message}`);
  return o.payload;
}

/** An MCP tool call of a server sending one byte a second: it must end at the route's read deadline with a timeout error. */
async function mcpDrip(tool, args, key) {
  const t0 = performance.now();
  const message = await toolError(tool, args);
  const s = (performance.now() - t0) / 1000;
  assert.match(message, new RegExp(`timed out after ${MCP_DEADLINE_S} s`), `ended with "${message}"`);
  endedAt(s, MCP_DEADLINE_S);
  assert.equal(seen.get(key).req.destroyed, true, 'the request was not destroyed');
  return `${s.toFixed(2)} s, "${message}", ${seen.get(key).received} bytes received`;
}

/** The error an MCP read past `limit` bytes fails with. */
const overLimit = (limit) => new RegExp(`^Fetch failed: the response is over the ${limit / MiB} MiB read limit$`);

/**
 * designesy_llms_txt reads one URL, so its cases take turns, in the order
 * they are listed, each setting what that URL serves for its turn. A read
 * that succeeds is cached and answers every call after it, so the read that
 * succeeds on a route with no read limit (a body past the limit, read whole)
 * is the last to take a turn.
 */
let llmsQueue = Promise.resolve();
function llmsTurn(route, work) {
  const turn = llmsQueue.then(() => {
    ROUTES[LLMS] = route;
    return work();
  });
  llmsQueue = turn.catch(() => {});
  return turn;
}

/**
 * Asserts an MCP read of `key`, whose body is past the tool's `limit`, failed
 * with the error that names the limit. For an identity body it also asserts
 * the read stopped at the limit: at most one socket read past it reached the
 * client, the request was destroyed, and the server never finished sending.
 * Says how far the body got.
 */
async function mcpOverLimit(tool, args, key, limit) {
  const route = ROUTES[key];
  seen.delete(key);
  const o = await toolOutcome(tool, args);
  const rec = seen.get(key);
  assert.ok(rec && rec.req, `no request reached ${key}, so the route answered from its cache`);
  assert.equal(o.failed, true, `returned a result, not an error, after ${rec.received} of ${route.bytes.length} bytes received: ${clip(o.text)}`);
  assert.match(o.message, overLimit(limit), `failed with "${o.message}"`);
  if (route.encoding) {
    return `"${o.message}"; ${route.bytes.length} ${route.encoding} bytes that decode to ${route.decoded}`;
  }
  return `"${o.message}"; ${await stoppedAtLimit(key, limit)}`;
}

/**
 * Asserts the read of `key`, a body sent with no content coding and past
 * `limit`, stopped at the limit: at most one socket read past it reached the
 * client, the request was destroyed, and the server never finished sending.
 * Says how far the body got.
 */
async function stoppedAtLimit(key, limit) {
  const rec = seen.get(key);
  const total = ROUTES[key].bytes.length;
  assert.ok(rec.received <= limit + ONE_READ, `${rec.received} bytes received, more than one ${ONE_READ} byte read past the ${limit} byte limit`);
  assert.equal(rec.req.destroyed, true, 'the request was not destroyed');
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  const s = sent.get(key);
  assert.equal(s.finished, false, `the server finished sending all ${total} bytes`);
  return `${rec.received} of ${total} bytes received, server sent ${s.written} before the socket closed`;
}

/**
 * Asserts a redirect from `key`, whose 20 MiB body is past the reader's
 * `limit`, led to `landed` once at most one socket read past the limit of
 * that body had reached the client, before the server had sent all of it,
 * and that the read of it stopped there (stoppedAtLimit). The server records
 * how far the body had got when the next hop's request arrived.
 */
async function hopAfterLimit(key, landed, limit) {
  const at = sent.get(landed);
  assert.ok(at, `no request reached ${landed}`);
  const total = ROUTES[key].bytes.length;
  assert.ok(at.fromReceived !== null && at.fromReceived <= limit + ONE_READ, `${at.fromReceived} bytes of the redirect's ${total} byte body were received before the next hop, more than one ${ONE_READ} byte read past the ${limit} byte limit`);
  assert.equal(at.fromFinished, false, `the server had sent all ${total} bytes of the redirect's body before the next hop`);
  return `the next hop came after ${at.fromReceived} of ${total} bytes of the 302's body were received (the server had written ${at.fromWritten}); ${await stoppedAtLimit(key, limit)}`;
}

/** Runs labelled reads one after another, and fails naming each that failed. */
async function eachRead(reads) {
  const out = [];
  for (const [label, read] of reads) out.push(await labelled(label, read));
  return reported(out);
}

/** Runs labelled reads at the same time, and fails naming each that failed. */
async function readsTogether(reads) {
  return reported(await Promise.all(reads.map(([label, read]) => labelled(label, read))));
}

/** A labelled read's outcome: what it says, or the first line of the error that failed it. */
async function labelled(label, read) {
  try {
    return { wrong: false, text: `${label}: ${await read()}` };
  } catch (e) {
    return { wrong: true, text: `${label}: ${String(e && e.message).split('\n')[0]}` };
  }
}

/** The labelled outcomes, joined; fails naming each that failed. */
function reported(out) {
  const wrong = out.filter((o) => o.wrong);
  assert.equal(wrong.length, 0, wrong.map((o) => o.text).join('; '));
  return out.map((o) => o.text).join('; ');
}

/**
 * The labelled reads of an over-limit case: each [label, key, route] reads
 * `key` with `tool` (designesy_llms_txt's url is its own), serving `route`
 * there first when one is given.
 */
function overLimitReads(tool, limit, reads) {
  return reads.map(([label, key, route]) => [label, () => {
    if (route) ROUTES[key] = route;
    return mcpOverLimit(tool, key === LLMS ? {} : { url: `https://${key}` }, key, limit);
  }]);
}

/**
 * Asserts an MCP read of `key`, a body of exactly the tool's limit, came back
 * whole: the client received every byte sent, and the tool returned a result
 * that `whole` accepts. (The server's 'finish' can come after the client has
 * read the last byte, so it is not waited for.)
 */
async function mcpAtLimit(tool, args, key, whole) {
  const route = ROUTES[key];
  const payload = await toolResult(tool, args);
  const rec = seen.get(key);
  assert.ok(rec && rec.req, `no request reached ${key}`);
  assert.equal(rec.received, route.bytes.length, `${rec.received} of ${route.bytes.length} bytes received`);
  return `${route.bytes.length} bytes${route.encoding ? ` of ${route.encoding} that decode to ${route.decoded}` : ''} read; ${whole(payload)}`;
}

/** The message JSON.parse throws for `text`. */
function parseMessage(text) {
  try {
    JSON.parse(text);
  } catch (e) {
    return e.message;
  }
  throw new Error(`${JSON.stringify(text)} parses`);
}

/** The detail of a readiness check whose file is past the read limit, `subject` naming the file. */
const notReadDetail = (subject) => `${subject} is larger than the ${READINESS_LIMIT / MiB} MiB read limit and was not read`;

/** Each check of a site with none of the files a readiness check reads: [status, detail]. */
const EMPTY_SITE = {
  r01: ['FAIL', 'No machine-readable token file detected at common paths'],
  r02: ['FAIL', 'No /llms.txt found: agents have no orientation brief'],
  r03: ['FAIL', 'No /.well-known/agent.json: agents have no discovery endpoint'],
  r04: ['WARN', 'Endpoint exists but did not respond with a tool list (HTTP 404)'],
  r05: ['FAIL', 'No /DESIGN.md: missing the machine-readable design brief'],
  r06: ['FAIL', 'No token file found to check for $description'],
  r07: ['FAIL', 'No machine-readable component contract'],
  r08: ['FAIL', 'No /sitemap.xml: agents cannot discover pages'],
  r09: ['FAIL', 'No /robots.txt: crawling rules undefined'],
  r10: ['FAIL', 'No social meta tags: missing share context'],
};

/** Each check of ready-small.example.com, as the readiness route reported it before the read limit. */
const SMALL_SITE = {
  r01: ['PASS', 'Token file found at https://ready-small.example.com/tokens.json (DTCG format)'],
  r02: ['PASS', `/llms.txt returns ${READY_FILES['ready-small.example.com']['/llms.txt'].body.length} bytes of agent-facing brief`],
  r03: ['PASS', '/.well-known/agent.json returns discovery document with identity/authority fields'],
  r04: ['PASS', 'MCP endpoint at /api/mcp responds to tools/list with 2 tool(s)'],
  r05: ['PASS', `/DESIGN.md found (${READY_FILES['ready-small.example.com']['/DESIGN.md'].body.length} bytes)`],
  r06: ['PASS', 'Tokens found with $description metadata'],
  r07: ['WARN', 'Component documentation found but not machine-readable'],
  r08: ['PASS', '/sitemap.xml found: site is crawlable'],
  r09: ['WARN', 'robots.txt found but restricts all agents'],
  r10: ['WARN', 'Partial social meta (OG or Twitter, not both)'],
};

/** A readiness scan of `url` through the real route; a scan that does not succeed fails the case, naming its error. */
async function readiness(url) {
  const { status, body } = await h.post('app/api/readiness/route.ts', { url });
  assert.equal(body.ok, true, `the scan failed (HTTP ${status}): ${body.error}`);
  return body;
}

/**
 * Asserts a scan's ten checks: those in `expect` ([status, detail]) as given,
 * the others as on a site with none of the files (EMPTY_SITE), and the score,
 * grade and counts as the route's rule makes them (PASS 1, WARN 0.5, FAIL 0;
 * A at 90, B 80, C 70, D 60). Says what the checks in `expect` reported.
 */
function checksAre(scan, expect) {
  const want = { ...EMPTY_SITE, ...expect };
  assert.equal(scan.checks.length, 10, `${scan.checks.length} checks, not 10`);
  const wrong = [];
  for (const [id, [status, detail]] of Object.entries(want)) {
    const c = scan.checks.find((x) => x.id === id);
    if (!c) wrong.push(`no ${id}`);
    else if (c.status !== status || c.detail !== detail) wrong.push(`${id} is ${c.status} (${c.detail}), not ${status} (${detail})`);
  }
  assert.equal(wrong.length, 0, wrong.join('; '));
  const statuses = Object.values(want).map(([s]) => s);
  const pass = statuses.filter((s) => s === 'PASS').length;
  const warn = statuses.filter((s) => s === 'WARN').length;
  const score = Math.round(((pass + warn * 0.5) / statuses.length) * 100);
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  const got = { score: scan.score, grade: scan.grade, pass: scan.pass, warn: scan.warn, fail: scan.fail, total: scan.total };
  assert.deepEqual(got, { score, grade, pass, warn, fail: statuses.length - pass - warn, total: 10 }, `scored ${JSON.stringify(got)}`);
  const ids = Object.keys(expect);
  const said = ids.length === 1 ? `${ids[0]} ${scan.checks.find((x) => x.id === ids[0]).status}: "${expect[ids[0]][1]}"` : ids.map((id) => `${id} ${expect[id][0]}`).join(', ');
  return `${said || 'every check as on an empty site'}; score ${score} ${grade}`;
}

/**
 * A readiness scan of `host`, whose `path` is past the read limit: check `id`
 * is WARN, saying `subject` is larger than the read limit and was not read,
 * and the other nine are as on an empty site. For a body sent with no content
 * coding it also asserts the read stopped at the limit (stoppedAtLimit).
 */
async function readinessOverLimit(host, path, id, subject) {
  const key = `${host}${path}`;
  seen.delete(key);
  const said = checksAre(await readiness(`https://${host}/`), { [id]: ['WARN', notReadDetail(subject)] });
  const route = ROUTES[key];
  assert.ok(seen.get(key), `no request reached ${key}`);
  if (route.encoding) return `${said}; ${route.bytes.length} ${route.encoding} bytes that decode to ${route.decoded}`;
  return `${said}; ${await stoppedAtLimit(key, READINESS_LIMIT)}`;
}

/** Asserts the client received all of `key`'s body. */
function receivedWhole(key) {
  const rec = seen.get(key);
  assert.ok(rec, `no request reached ${key}`);
  const total = ROUTES[key].bytes.length;
  assert.equal(rec.received, total, `${rec.received} of ${total} bytes of ${key} received`);
  return `${total} bytes`;
}

// ── Cases ────────────────────────────────────────────────────────────────────

/** Run together; each timed one measures its own deadline. */
const CONCURRENT = [
  {
    name: 'a 10 MiB body read with maxBodyBytes 1 MiB comes back as its first 1 MiB + 1 bytes, and the request is destroyed',
    run: async () => heldToCap('big.example.com/ten', MiB, await resolution(safeFetch('https://big.example.com/ten', { maxBodyBytes: MiB }))),
  },
  {
    name: 'a body of exactly maxBodyBytes comes back whole, with no byte past the cap and no budget cut',
    run: async () => {
      const { cutByBudget } = guard;
      assert.equal(typeof cutByBudget, 'function', 'url-guard exports no cutByBudget');
      const resp = await resolution(safeFetch('https://exact.example.com/', { maxBodyBytes: MiB }));
      const n = (await resp.arrayBuffer()).byteLength;
      assert.equal(n, MiB, `${n} bytes returned, not the ${MiB} bytes sent`);
      assert.equal(cutByBudget(resp), false, 'cutByBudget says a budget cut it');
      return `${n} bytes, cutByBudget false`;
    },
  },
  {
    name: 'an ordinary page read with no cap comes back whole',
    run: async () => {
      const resp = await resolution(safeFetch('https://ok.example.com/'));
      assert.equal(resp.status, 200);
      assert.equal(await resp.text(), PAGE);
      return `HTTP ${resp.status}, ${PAGE.length} bytes`;
    },
  },
  {
    name: "a reader's chunk sits in a buffer of exactly the bytes returned, with none of an earlier read's",
    run: async () => {
      const out = [];
      // How much of each body comes back is the cap cases' to check; this one
      // checks only where the bytes that come back sit.
      for (const [label, url, extra, sentBytes] of [
        ['9 byte body', 'https://own-small.example.com/', {}, Buffer.from('nine byte')],
        ['2 MiB body read with maxBodyBytes 100', 'https://own-cut.example.com/', { maxBodyBytes: 100 }, ROUTES['own-cut.example.com/'].bytes],
        ['1 MiB body', 'https://own-large.example.com/', {}, ROUTES['own-large.example.com/'].bytes],
      ]) {
        // Read just before, so a buffer the two reads shared would hold it.
        assert.equal(await (await safeFetch('https://own-earlier.example.com/')).text(), EARLIER);
        const resp = await resolution(safeFetch(url, extra));
        const reader = resp.body.getReader();
        const { value } = await reader.read();
        const rest = await reader.read();
        const own = value.byteOffset === 0 && value.buffer.byteLength === value.byteLength;
        const foreign = Buffer.from(value.buffer).includes(EARLIER);
        const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        const same = value.byteLength > 0 && Buffer.compare(chunk, sentBytes.subarray(0, value.byteLength)) === 0;
        out.push({
          wrong: !own || foreign || !same || !rest.done,
          text: `${label}: a ${value.byteLength} byte chunk in a ${value.buffer.byteLength} byte buffer`
            + `${value.byteOffset ? ` at offset ${value.byteOffset}` : ''}`
            + `${foreign ? " that holds the earlier read's body" : ''}`
            + `${same ? '' : ', not the start of the body sent'}${rest.done ? '' : ', with more chunks after it'}`,
        });
      }
      const wrong = out.filter((o) => o.wrong);
      assert.equal(wrong.length, 0, wrong.map((o) => o.text).join('; '));
      return out.map((o) => o.text).join('; ');
    },
  },
  {
    name: "a read leaves no abort listener on the caller's signal once it settles, however it settles",
    run: async () => {
      const { cutByBudget } = guard;
      // Each read reaches its outcome by a different path: the body's end,
      // the cap, two hops, the request's error, the status check, the
      // decoder's end and its error, and the shared budget. The last field
      // says whether the read settled the way its label says.
      const reads = [
        ['whole', 'https://listen-ok.example.com/', {}, (o) => o.text === PAGE],
        ['cut at maxBodyBytes', 'https://listen-cut.example.com/', { maxBodyBytes: MiB }, (o) => o.bytes === MiB + 1],
        ['after a redirect', 'https://listen-hop.example.com/', {}, (o) => seen.has('listen-landed.example.com/') && o.text === PAGE],
        ['failed (the server closes the connection)', 'https://listen-reset.example.com/', {}, (o) => o.err?.code === 'ECONNRESET'],
        ['status 999', 'https://listen-nines.example.com/', {}, (o) => o.err?.name === 'InvalidStatusError'],
        ['a gzip body', 'https://listen-gzip.example.com/', {}, (o) => o.text === PAGE],
        ['a corrupt gzip body', 'https://listen-corrupt.example.com/', {}, (o) => o.err?.name === 'ContentDecodingError'],
        ['cut by a shared budget', 'https://listen-budget.example.com/', { budget: { left: MiB } }, (o) => o.bytes === MiB && o.cut],
      ];
      const out = await Promise.all(reads.map(async ([label, url, extra, settledAsLabelled]) => {
        // A signal that outlives the read, as the readiness route's AbortSignal.timeout(8000) does.
        const signal = AbortSignal.timeout(LISTEN_SIGNAL_S * 1000);
        const o = {};
        try {
          const resp = await safeFetch(url, { ...extra, signal });
          const body = Buffer.from(await resp.arrayBuffer());
          Object.assign(o, { bytes: body.length, text: body.toString(), cut: typeof cutByBudget === 'function' && cutByBudget(resp) });
        } catch (e) {
          o.err = e;
        }
        const left = getEventListeners(signal, 'abort').length;
        const settled = o.err ? `rejected (${o.err.name}: ${o.err.message})` : `resolved, ${o.bytes} bytes${o.cut ? ', cut by the budget' : ''}`;
        const asLabelled = settledAsLabelled(o);
        return { wrong: !asLabelled || left !== 0, text: `${label}: ${settled}${asLabelled ? '' : ' (not the outcome this read is for)'}, ${left} abort listener(s) left` };
      }));
      const wrong = out.filter((o) => o.wrong);
      assert.equal(wrong.length, 0, wrong.map((o) => o.text).join('; '));
      return out.map((o) => o.text).join('; ');
    },
  },
  {
    name: `a server sending one byte a second is ended by the caller's ${SIGNAL_DEADLINE_S} s signal`,
    run: async () => {
      const { err, s } = await timedRejection(safeFetch('https://drip.example.com/', { signal: AbortSignal.timeout(SIGNAL_DEADLINE_S * 1000) }));
      assert.equal(err.name, 'AbortError', `ended with ${err.name}: ${err.message}`);
      endedAt(s, SIGNAL_DEADLINE_S);
      const rec = seen.get('drip.example.com/');
      assert.equal(rec.req.destroyed, true, 'the request was not destroyed');
      return `${s.toFixed(2)} s, ${rec.received} bytes received`;
    },
  },
  {
    name: `a read given no signal fails once its server has sent nothing for ${NO_SIGNAL_IDLE_S} s`,
    run: async () => {
      const key = 'nosignal-silent.example.com/';
      const { err, s } = await timedRejection(safeFetch(`https://${key}`));
      assert.equal(err.message, 'SSRF guard: fetch timeout', `ended with ${err.name}: ${err.message}`);
      endedAt(s, NO_SIGNAL_IDLE_S);
      assert.equal(seen.get(key).req.destroyed, true, 'the request was not destroyed');
      return `${s.toFixed(2)} s, "${err.message}"`;
    },
  },
  {
    name: 'every read the site makes through safeFetch passes a signal that a timer fires',
    run: async () => {
      const files = [];
      const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.tsx?$/.test(e.name)) files.push(p);
        }
      };
      walk(path.join(APP, 'app'));
      // The text of a call's arguments, from `open` (just past its "(") to the
      // ")" that closes it, past brackets and quoted strings.
      const argsOf = (src, open) => {
        let depth = 0;
        for (let k = open; k < src.length; k++) {
          const ch = src[k];
          if (ch === "'" || ch === '"' || ch === '`') {
            for (k++; k < src.length && src[k] !== ch; k++) if (src[k] === '\\') k++;
          } else if ('([{'.includes(ch)) depth++;
          else if (')]}'.includes(ch)) {
            if (depth === 0) return src.slice(open, k);
            depth--;
          }
        }
        return src.slice(open);
      };
      // How `expr`, a call's signal, is fired, read from `fn` (its function up to the call), or null.
      const firedBy = (expr, fn) => {
        if (/^AbortSignal\.timeout\(/.test(expr)) return 'AbortSignal.timeout';
        if (new RegExp(`\\bconst ${expr} = AbortSignal\\.timeout\\(`).test(fn)) return `${expr}, an AbortSignal.timeout`;
        const c = /^(\w+)\.signal$/.exec(expr);
        if (!c) return null;
        const made = new RegExp(`\\bconst ${c[1]} = new AbortController\\(\\)`).test(fn);
        const timed = new RegExp(`setTimeout\\(\\(\\) => (?:\\{[^}]*\\b${c[1]}\\.abort\\(\\)|${c[1]}\\.abort\\(\\))`).test(fn);
        return made && timed ? `${expr}, aborted by a setTimeout` : null;
      };
      const found = [];
      const wrong = [];
      for (const file of files) {
        const rel = path.relative(APP, file).split(path.sep).join('/');
        if (rel === 'app/lib/url-guard.ts') continue;
        const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
        // fetchContract reads a contract URL through the fetcher it is handed, url-guard's safeFetch.
        const call = rel === 'app/lib/own-contract/fetch-contract.ts' ? /\bfetcher\(/g : /\bsafeFetch\(/g;
        for (const { index, 0: name } of src.matchAll(call)) {
          const before = src.slice(0, index);
          if (/^\s*(?:\/\/|\/?\*)/.test(before.slice(before.lastIndexOf('\n') + 1))) continue;
          const starts = [...before.matchAll(/^(?:export )?(?:async )?function (\w+)/gm)];
          const fn = starts.length ? starts[starts.length - 1] : null;
          const where = `${rel}:${before.split('\n').length} (${fn ? fn[1] : 'top level'})`;
          const m = /\bsignal\b(?:\s*:\s*([\w.]+(?:\([^)]*\))?))?/.exec(argsOf(src, index + name.length));
          const expr = m ? m[1] || 'signal' : null;
          const how = expr && firedBy(expr, fn ? src.slice(fn.index, index) : '');
          if (how) found.push(`${where}: ${how}`);
          else wrong.push(`${where}: ${expr ? `${expr}, which no timer fires` : 'no signal'}`);
        }
      }
      assert.equal(wrong.length, 0, wrong.join('; '));
      assert.ok(found.length > 0, 'no safeFetch call found');
      return `${found.length} calls: ${found.join('; ')}`;
    },
  },
  {
    name: `a server that goes quiet for ${QUIET_S} s mid-body is read whole by a caller whose signal ends at ${2 * QUIET_S} s`,
    run: async () => {
      const t0 = performance.now();
      const read = await settledRead(safeFetch('https://quiet.example.com/', { signal: AbortSignal.timeout(2 * QUIET_S * 1000) }));
      const s = (performance.now() - t0) / 1000;
      assert.ok(read.text !== undefined, `ended at ${s.toFixed(2)} s with ${read.err && read.err.name}: ${read.err && read.err.message}`);
      assert.equal(read.text, PAGE, `${read.text.length} of ${PAGE.length} bytes, not the page`);
      assert.ok(s >= QUIET_S - 0.5, `${s.toFixed(2)} s: read before the server's ${QUIET_S} s pause ended`);
      return `${s.toFixed(2)} s, ${read.text.length} bytes`;
    },
  },
  {
    name: `on a connection kept alive from an answer that gave a Keep-Alive timeout of ${KEEP_ALIVE.map(([hint]) => hint).join(' s or ')} s, a server that sends nothing for 0.5 s less than that before it answers is read by a caller whose signal ends at ${KEEP_ALIVE_SIGNAL_S} s`,
    run: async () => {
      const signal = () => AbortSignal.timeout(KEEP_ALIVE_SIGNAL_S * 1000);
      return eachRead(KEEP_ALIVE.map(([hint, quiet]) => [`a ${hint} s Keep-Alive timeout, ${quiet} s quiet`, async () => {
        const first = await resolution(safeFetch(`https://keepalive.example.com/first-${hint}`, { signal: signal() }));
        assert.equal(await first.text(), 'the first answer');
        // Node's agent keeps the connection once the answer has ended.
        await new Promise((r) => setTimeout(r, SETTLE_MS));
        const connections = keepAliveConnections;
        const t0 = performance.now();
        const read = await settledRead(safeFetch(`https://keepalive.example.com/quiet-${hint}`, { signal: signal() }));
        const s = (performance.now() - t0) / 1000;
        assert.equal(keepAliveConnections, connections, `the second read opened ${keepAliveConnections - connections} connection(s) of its own, so it did not use the one kept alive`);
        assert.ok(read.text !== undefined, `ended at ${s.toFixed(2)} s with ${read.err && read.err.name}: ${read.err && read.err.message}`);
        assert.equal(read.text, PAGE, `${read.text.length} of ${PAGE.length} bytes, not the page`);
        assert.ok(s >= quiet - 0.5, `${s.toFixed(2)} s: read before the server's ${quiet} s quiet ended`);
        return `${s.toFixed(2)} s, ${read.text.length} bytes, on the connection the first answer kept alive`;
      }]));
    },
  },
  {
    name: 'a POST carries its body, with its length; a 307 or 308 sends it again, a 301, 302 or 303 is followed with a GET that carries none and none of the headers that describe one, and a PUT is repeated after a 302 and made a GET by a 303',
    run: async () => {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      // Content-Type, Content-Language and Content-Location describe the body; X-Kept does not.
      const headers = { 'Content-Type': 'application/json', 'Content-Language': 'en', 'Content-Location': '/rpc', 'X-Kept': 'kept' };
      const posted = { method: 'POST', length: String(Buffer.byteLength(body)), type: 'application/json', language: 'en', place: '/rpc', kept: 'kept', body };
      const put = { ...posted, method: 'PUT' };
      const got = { method: 'GET', length: undefined, type: undefined, language: undefined, place: undefined, kept: 'kept', body: '' };
      return eachRead([
        ['no redirect', 'POST', 'post-direct.example.com/rpc', 'post-direct.example.com/rpc', posted],
        ['after a 307', 'POST', 'post-307.example.com/rpc', 'post-landed-307.example.com/rpc', posted],
        ['after a 308', 'POST', 'post-308.example.com/rpc', 'post-landed-308.example.com/rpc', posted],
        ['after a 301', 'POST', 'post-301.example.com/rpc', 'post-landed-301.example.com/rpc', got],
        ['after a 302', 'POST', 'post-302.example.com/rpc', 'post-landed-302.example.com/rpc', got],
        ['after a 303', 'POST', 'post-303.example.com/rpc', 'post-landed-303.example.com/rpc', got],
        ['a PUT after a 302', 'PUT', 'put-302.example.com/rpc', 'put-landed-302.example.com/rpc', put],
        ['a PUT after a 303', 'PUT', 'put-303.example.com/rpc', 'put-landed-303.example.com/rpc', got],
      ].map(([label, method, key, landed, want]) => [label, async () => {
        const resp = await resolution(safeFetch(`https://${key}`, { method, headers, body }));
        assert.equal(resp.status, 200, `HTTP ${resp.status}`);
        const a = asked.get(landed);
        assert.ok(a, `no request reached ${landed}`);
        const carried = { method: a.method, length: a.length, type: a.type, language: a.language, place: a.place, kept: a.kept, body: a.body.toString() };
        assert.deepEqual(carried, want, `${landed} received ${JSON.stringify(carried)}`);
        return `${landed} received a ${a.method} with ${a.body.length} body bytes${a.length ? ` (content-length ${a.length})` : ''}`;
      }]));
    },
  },
  {
    name: 'a request body is sent as its bytes, with their count as its length: a string past ASCII, an ArrayBuffer and a view of part of one; a body of another kind, or one on a GET or HEAD, is refused with a TypeError before its host is looked up',
    run: async () => {
      // 2 + 3 + 4 bytes in UTF-8, 9 in all; a length counted in characters is 3 (4 in UTF-16 units).
      const text = String.fromCodePoint(0xe9, 0x6f22, 0x1f600);
      const plain = Buffer.from('{"kind":"ArrayBuffer"}');
      const buffer = plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.length);
      // A view whose buffer holds bytes on each side of it, which are not sent.
      const whole = new TextEncoder().encode('skip{"kind":"a view of part of a buffer"}skip');
      const view = whole.subarray(4, whole.length - 4);
      const sends = (label, key, body, bytes) => [label, async () => {
        const resp = await resolution(safeFetch(`https://${key}`, { method: 'POST', body }));
        assert.equal(resp.status, 200, `HTTP ${resp.status}`);
        const a = asked.get(key);
        assert.ok(a, `no request reached ${key}`);
        assert.equal(a.length, String(bytes.length), `content-length ${a.length} for a body of ${bytes.length} bytes`);
        assert.equal(Buffer.compare(a.body, bytes), 0, `${key} received ${JSON.stringify(a.body.toString())}, not ${JSON.stringify(bytes.toString())}`);
        return `${a.body.length} body bytes, content-length ${a.length}`;
      }];
      const refuses = (label, host, init) => [label, async () => {
        const err = await rejection(safeFetch(`https://${host}/`, init));
        assert.equal(err.name, 'TypeError', `rejected with ${err.name}: ${err.message}`);
        assert.equal(looked.has(host), false, `${host} was looked up before the refusal (${err.message})`);
        assert.equal(seen.has(`${host}/`), false, `a request reached ${host}`);
        return `TypeError "${err.message}", no DNS query and no request`;
      }];
      return eachRead([
        sends('a string past ASCII', 'body-kinds.example.com/text', text, Buffer.from(text, 'utf8')),
        sends('an ArrayBuffer', 'body-kinds.example.com/buffer', buffer, plain),
        sends('a view of part of a buffer', 'body-kinds.example.com/view', view, Buffer.from(view)),
        refuses('URLSearchParams', 'refused-params.example.com', { method: 'POST', body: new URLSearchParams({ kind: 'form' }) }),
        refuses('a body on a GET', 'refused-get.example.com', { method: 'GET', body: 'x' }),
        refuses('a body on a HEAD', 'refused-head.example.com', { method: 'HEAD', body: 'x' }),
      ]);
    },
  },
  {
    name: `designesy_tokens_score on a URL that sends its headers and then nothing ends at the ${MCP_DEADLINE_S} s read deadline`,
    run: async () => mcpDrip('designesy_tokens_score', { url: 'https://tokens-silent.example.com/tokens.json' }, 'tokens-silent.example.com/tokens.json'),
  },
  {
    name: `designesy_tokens_score on a URL sending one byte a second ends at the ${MCP_DEADLINE_S} s read deadline`,
    run: async () => mcpDrip('designesy_tokens_score', { url: 'https://tokens-drip.example.com/tokens.json' }, 'tokens-drip.example.com/tokens.json'),
  },
  {
    name: `designesy_motion_score on a URL sending one byte a second ends at the ${MCP_DEADLINE_S} s read deadline`,
    run: async () => mcpDrip('designesy_motion_score', { url: 'https://motion-drip.example.com/anim.json' }, 'motion-drip.example.com/anim.json'),
  },
  {
    // designesy_llms_txt's first turn.
    name: `designesy_llms_txt (cachedFetch) on a source sending one byte a second ends at the ${MCP_DEADLINE_S} s read deadline`,
    run: async () => llmsTurn({ drip: true }, () => mcpDrip('designesy_llms_txt', {}, LLMS)),
  },
  {
    // Listed before the over-limit cases: its designesy_llms_txt read is the second turn.
    name: 'a 404 whose body is 1 MiB past the read limit still fails as "Fetch failed: 404" (tokens, motion, llms_txt)',
    run: async () => {
      const is404 = (tool, args, key) => async () => {
        seen.delete(key);
        const message = await toolError(tool, args);
        assert.match(message, /^Fetch failed: 404\b/, `failed with "${message}"`);
        const rec = seen.get(key);
        assert.ok(rec, `no request reached ${key}`);
        return `"${message}", ${rec.received} of ${ROUTES[key].bytes.length} bytes received`;
      };
      const llms = llmsTurn(LLMS_404, () => eachRead([['designesy_llms_txt', is404('designesy_llms_txt', {}, LLMS)]]));
      const others = eachRead([
        ['designesy_tokens_score', is404('designesy_tokens_score', { url: 'https://tokens-404.example.com/tokens.json' }, 'tokens-404.example.com/tokens.json')],
        ['designesy_motion_score', is404('designesy_motion_score', { url: 'https://motion-404.example.com/anim.json' }, 'motion-404.example.com/anim.json')],
      ]);
      const [a, b] = await Promise.allSettled([others, llms]);
      const wrong = [a, b].filter((r) => r.status === 'rejected').map((r) => String(r.reason && r.reason.message).split('\n')[0]);
      assert.equal(wrong.length, 0, wrong.join('; '));
      return `${a.value}; ${b.value}`;
    },
  },
  {
    name: `designesy_tokens_score fails on a token file 1 MiB past its ${TOKENS_LIMIT / MiB} MiB read limit, naming the limit`,
    run: async () => eachRead(overLimitReads('designesy_tokens_score', TOKENS_LIMIT, [
      ['gzip that decodes past the limit', 'tokens-over.example.com/gzip.json'],
      ['identity, no content-length', 'tokens-over.example.com/plain.json'],
      ['identity with content-length', 'tokens-over.example.com/length.json'],
    ])),
  },
  {
    name: `designesy_motion_score fails on a Lottie file 1 MiB past its ${LOTTIE_LIMIT / MiB} MiB read limit, naming the limit`,
    run: async () => eachRead(overLimitReads('designesy_motion_score', LOTTIE_LIMIT, [
      ['gzip that decodes past the limit', 'motion-over.example.com/gzip.json'],
      ['identity, no content-length', 'motion-over.example.com/plain.json'],
      ['identity with content-length', 'motion-over.example.com/length.json'],
    ])),
  },
  {
    // designesy_llms_txt's last turn. On a route with no read limit its
    // identity reads succeed, and the first is cached, so they come last.
    name: `designesy_llms_txt (cachedFetch) fails on a document 1 MiB past its ${DOC_LIMIT / MiB} MiB read limit, naming the limit`,
    run: async () => llmsTurn(null, () => eachRead(overLimitReads('designesy_llms_txt', DOC_LIMIT, [
      ['gzip that decodes past the limit', LLMS, LLMS_OVER_GZIP],
      ['identity, no content-length', LLMS, LLMS_OVER],
      ['identity with content-length', LLMS, LLMS_OVER_LENGTH],
    ]))),
  },
  {
    name: `designesy_motion_score reads a gzip Lottie file that decodes to exactly its ${LOTTIE_LIMIT / MiB} MiB read limit whole`,
    run: async () => mcpAtLimit('designesy_motion_score', { url: 'https://motion-at.example.com/gzip.json' }, 'motion-at.example.com/gzip.json', (p) => `score ${p.score}, ${p.layer_count} layer(s)`),
  },
  {
    name: `designesy_tokens_score fails on a token file reached through a 302 and 1 MiB past its ${TOKENS_LIMIT / MiB} MiB read limit, and the read stops at the limit on the URL it lands on`,
    run: async () => {
      const landed = 'tokens-hop-landed.example.com/tokens.json';
      seen.delete(landed);
      const o = await toolOutcome('designesy_tokens_score', { url: 'https://tokens-hop.example.com/tokens.json' });
      const rec = seen.get(landed);
      assert.ok(rec && rec.req, `no request reached ${landed}`);
      assert.equal(o.failed, true, `returned a result, not an error, after ${rec.received} of ${ROUTES[landed].bytes.length} bytes received: ${clip(o.text)}`);
      assert.match(o.message, overLimit(TOKENS_LIMIT), `failed with "${o.message}"`);
      return `"${o.message}"; ${await stoppedAtLimit(landed, TOKENS_LIMIT)}`;
    },
  },
  {
    name: `designesy_motion_score reads a gzip Lottie file reached through a 302 that decodes to exactly its ${LOTTIE_LIMIT / MiB} MiB read limit whole`,
    run: async () => mcpAtLimit('designesy_motion_score', { url: 'https://motion-hop.example.com/anim.json' }, 'motion-hop-landed.example.com/gzip.json', (p) => `score ${p.score}, ${p.layer_count} layer(s)`),
  },
  {
    name: `designesy_tokens_score fails on a deflate (zlib and raw) or br token file that decodes to one byte past its ${TOKENS_LIMIT / MiB} MiB read limit, naming the limit`,
    run: async () => eachRead(Object.keys(CODINGS).map((c) => [c, () => mcpOverLimit('designesy_tokens_score', { url: `https://tokens-coded.example.com/${c}-over.json` }, `tokens-coded.example.com/${c}-over.json`, TOKENS_LIMIT)])),
  },
  {
    name: `designesy_tokens_score reads a deflate (zlib and raw) or br token file that decodes to exactly its ${TOKENS_LIMIT / MiB} MiB read limit whole`,
    run: async () => eachRead(Object.keys(CODINGS).map((c) => [c, () => mcpAtLimit('designesy_tokens_score', { url: `https://tokens-coded.example.com/${c}-at.json` }, `tokens-coded.example.com/${c}-at.json`, (p) => {
      assert.equal(p.total_tokens, 1, `${p.total_tokens} tokens, not 1`);
      return `score ${p.score}, ${p.total_tokens} token(s)`;
    })])),
  },
  {
    name: `designesy_motion_score reads a br Lottie file that decodes to exactly its ${LOTTIE_LIMIT / MiB} MiB read limit whole, and fails on one that decodes to one byte past it, naming the limit`,
    run: async () => eachRead([
      ['exactly the limit', () => mcpAtLimit('designesy_motion_score', { url: 'https://motion-coded.example.com/br-at.json' }, 'motion-coded.example.com/br-at.json', (p) => `score ${p.score}, ${p.layer_count} layer(s)`)],
      ['one byte past it', () => mcpOverLimit('designesy_motion_score', { url: 'https://motion-coded.example.com/br-over.json' }, 'motion-coded.example.com/br-over.json', LOTTIE_LIMIT)],
    ]),
  },
  {
    name: `designesy_tokens_score on a 500 whose body is 20 MiB fails with its status, as before, and the read stops at the ${TOKENS_LIMIT / MiB} MiB read limit of that body`,
    run: async () => {
      const key = 'tokens-500.example.com/tokens.json';
      seen.delete(key);
      const message = await toolError('designesy_tokens_score', { url: `https://${key}` });
      assert.equal(message, 'Fetch failed: 500 Internal Server Error', `failed with "${message}"`);
      assert.ok(seen.get(key), `no request reached ${key}`);
      return `"${message}"; ${await stoppedAtLimit(key, TOKENS_LIMIT)}`;
    },
  },
  {
    name: `designesy_motion_score on a 500 whose body is 20 MiB fails with its status, as before, and the read stops at the ${LOTTIE_LIMIT / MiB} MiB read limit of that body`,
    run: async () => {
      const key = 'motion-500.example.com/anim.json';
      seen.delete(key);
      const message = await toolError('designesy_motion_score', { url: `https://${key}` });
      assert.equal(message, 'Fetch failed: 500 Internal Server Error', `failed with "${message}"`);
      assert.ok(seen.get(key), `no request reached ${key}`);
      return `"${message}"; ${await stoppedAtLimit(key, LOTTIE_LIMIT)}`;
    },
  },
  {
    name: `designesy_tokens_score follows a 302 whose body is 20 MiB once at most one socket read past the ${TOKENS_LIMIT / MiB} MiB read limit of it has arrived, and reads the token file it lands on`,
    run: async () => {
      const key = 'tokens-302.example.com/tokens.json';
      const landed = 'tokens-302-landed.example.com/tokens.json';
      seen.delete(key);
      sent.delete(landed);
      const p = await toolResult('designesy_tokens_score', { url: `https://${key}` });
      assert.equal(p.total_tokens, 1, `${p.total_tokens} tokens, not 1`);
      return `score ${p.score}, ${p.total_tokens} token(s); ${await hopAfterLimit(key, landed, TOKENS_LIMIT)}`;
    },
  },
  {
    name: "every safeFetch call in the MCP route is readUrl's, which passes the read deadline and each call site's read limit",
    run: async () => {
      const src = fs.readFileSync(path.join(APP, 'app/api/mcp/route.ts'), 'utf8').replace(/\r\n/g, '\n');
      const calls = [...src.matchAll(/\bsafeFetch\(/g)].map((m) => m.index);
      const start = src.indexOf('\nasync function readUrl(');
      assert.ok(start >= 0, `no readUrl in the MCP route, which has ${calls.length} safeFetch call(s)`);
      // readUrl is a top-level function: it ends at the first closing brace
      // on a line of its own.
      const end = src.indexOf('\n}\n', start);
      const outside = calls.filter((i) => i < start || i > end);
      assert.equal(outside.length, 0, `${outside.length} of ${calls.length} safeFetch calls in the MCP route are outside readUrl`);
      assert.equal(calls.length, 1, `${calls.length} safeFetch calls in readUrl, expected 1`);
      const fn = src.slice(start, end);
      assert.match(fn, /const signal = AbortSignal\.timeout\(READ_DEADLINE_MS\);/, 'readUrl makes no AbortSignal.timeout(READ_DEADLINE_MS)');
      assert.match(fn, /safeFetch\(url, \{[^}]*(?<![\w.])signal(?=\s*[,}])/, 'readUrl does not pass that signal to safeFetch');
      const ms = src.match(/^const READ_DEADLINE_MS = ([\d_]+);$/m);
      assert.ok(ms, 'no READ_DEADLINE_MS in the MCP route');
      assert.equal(Number(ms[1].replace(/_/g, '')), MCP_DEADLINE_S * 1000, `READ_DEADLINE_MS is ${ms[1]}, not ${MCP_DEADLINE_S} s`);
      // The limit: readUrl takes it after the url and hands it to safeFetch.
      assert.match(fn, /^\nasync function readUrl\(url: string, limit: number, /, `readUrl takes no byte limit after its url: ${fn.split('\n')[1]}`);
      assert.match(fn, /safeFetch\(url, \{[^}]*(?<![\w.])maxBodyBytes: limit(?=\s*[,}])/, 'readUrl does not pass its limit to safeFetch as maxBodyBytes');
      // Each call of readUrl, by the function or tool it sits in, with the
      // byte count of the limit it passes: a constant's or a literal product.
      const bytesOf = (expr) => {
        const named = /^[A-Za-z_]\w*$/.test(expr) ? src.match(new RegExp(`^const ${expr} = ([\\d_ *]+);$`, 'm')) : null;
        const value = named ? named[1] : expr;
        return /^[\d_]+( *\* *[\d_]+)*$/.test(value) ? value.split('*').reduce((p, x) => p * Number(x.trim().replace(/_/g, '')), 1) : null;
      };
      const siteOf = (i) => {
        const before = src.slice(0, i);
        const fnAt = [...before.matchAll(/\nasync function (\w+)\(/g)].pop();
        const toolAt = [...before.matchAll(/registerTool\(\s*'(\w+)'/g)].pop();
        return toolAt && (!fnAt || toolAt.index > fnAt.index) ? toolAt[1] : fnAt ? fnAt[1] : '(top level)';
      };
      const defAt = start + '\nasync function '.length;
      const found = {};
      const problems = [];
      for (const { index } of src.matchAll(/\breadUrl\(/g)) {
        if (index === defAt) continue;
        const site = siteOf(index);
        const arg = src.slice(index).match(/^readUrl\(\s*[^,()]+,\s*([^,(){}]+?)\s*,/);
        const bytes = arg ? bytesOf(arg[1]) : null;
        if (bytes === null) problems.push(`the readUrl call in ${site} passes no limit this gate can read`);
        else if (!(site in MCP_READ_LIMITS)) problems.push(`a readUrl call in ${site}, which has no limit in MCP_READ_LIMITS`);
        else if (site in found) problems.push(`a second readUrl call in ${site}`);
        else if (bytes !== MCP_READ_LIMITS[site]) problems.push(`the readUrl call in ${site} passes ${bytes} bytes (${arg[1]}), not ${MCP_READ_LIMITS[site]}`);
        if (bytes !== null) found[site] = `${bytes / MiB} MiB (${arg[1]})`;
      }
      for (const site of Object.keys(MCP_READ_LIMITS)) if (!(site in found)) problems.push(`no readUrl call in ${site}`);
      assert.equal(problems.length, 0, problems.join('; '));
      return `1 safeFetch call, in readUrl; READ_DEADLINE_MS ${ms[1]}; limits ${Object.entries(found).map(([s, v]) => `${s} ${v}`).join(', ')}`;
    },
  },
  {
    name: `designesy_tokens_score reads a token file of exactly its ${TOKENS_LIMIT / MiB} MiB read limit whole`,
    run: async () => mcpAtLimit('designesy_tokens_score', { url: 'https://tokens-at.example.com/tokens.json' }, 'tokens-at.example.com/tokens.json', (p) => {
      assert.equal(p.total_tokens, 1, `${p.total_tokens} tokens, not 1`);
      return `score ${p.score}, ${p.total_tokens} token(s)`;
    }),
  },
  {
    name: `designesy_motion_score reads a Lottie file of exactly its ${LOTTIE_LIMIT / MiB} MiB read limit whole`,
    run: async () => mcpAtLimit('designesy_motion_score', { url: 'https://motion-at.example.com/anim.json' }, 'motion-at.example.com/anim.json', (p) => `score ${p.score}, ${p.layer_count} layer(s)`),
  },
  {
    name: `designesy_skill_md (cachedFetch) reads a document of exactly its ${DOC_LIMIT / MiB} MiB read limit whole`,
    run: async () => mcpAtLimit('designesy_skill_md', {}, 'www.designesy.org/contracts/skill', (p) => {
      const content = String(p.content);
      assert.equal(Buffer.byteLength(content), DOC_AT.length, `${Buffer.byteLength(content)} bytes of content, not ${DOC_AT.length}`);
      assert.ok(content.endsWith(DOC_END), 'the content does not end with the document\'s last line');
      return `${Buffer.byteLength(content)} bytes of content, ending with its last line`;
    }),
  },
  {
    name: "a token file or a cachedFetch JSON document that is not JSON fails with JSON.parse's own message, and one that starts with a byte order mark is read",
    run: async () => {
      const expected = parseMessage(NOT_JSON);
      const sameMessage = (tool, args) => async () => {
        const message = await toolError(tool, args);
        assert.equal(message, expected, `failed with "${message}", not JSON.parse's "${expected}"`);
        return `"${message}"`;
      };
      return eachRead([
        ['designesy_tokens_score, not JSON', sameMessage('designesy_tokens_score', { url: 'https://tokens-parse.example.com/not.json' })],
        ['designesy_agent_json (cachedFetch), not JSON', sameMessage('designesy_agent_json', {})],
        ['designesy_tokens_score, a byte order mark first', async () => {
          const p = await toolResult('designesy_tokens_score', { url: 'https://tokens-parse.example.com/bom.json' });
          assert.equal(p.total_tokens, 1, `${p.total_tokens} tokens, not 1`);
          return `score ${p.score}, ${p.total_tokens} token(s)`;
        }],
      ]);
    },
  },
  {
    name: 'designesy_tokens_score reads a token file that starts with two byte order marks as res.json() reads it',
    run: async () => {
      const key = 'tokens-parse.example.com/two-boms.json';
      // What res.json() gives for these bytes on this Node: a value, or JSON.parse's error.
      let want;
      try {
        want = { ok: true, value: await new Response(ROUTES[key].bytes).json() };
      } catch (e) {
        want = { ok: false, message: e.message };
      }
      const o = await toolOutcome('designesy_tokens_score', { url: `https://${key}` });
      if (want.ok) {
        assert.equal(o.failed, false, `failed with "${o.message}", where res.json() reads the file`);
        assert.equal(o.payload.total_tokens, 1, `${o.payload.total_tokens} tokens, not 1`);
        return `read, as res.json() reads it: score ${o.payload.score}, ${o.payload.total_tokens} token(s)`;
      }
      assert.equal(o.failed, true, `returned a result, where res.json() fails with "${want.message}"`);
      assert.equal(o.message, want.message, `failed with "${o.message}", not res.json()'s "${want.message}"`);
      return `failed as res.json() fails: "${o.message}"`;
    },
  },
  {
    name: 'designesy_tokens_score still reads a token file that answers',
    run: async () => {
      const { result, payload } = await h.callTool('designesy_tokens_score', { url: 'https://tokens-ok.example.com/tokens.json' });
      assert.notEqual(result.isError, true, `returned an error: ${payload && payload.error}`);
      assert.equal(typeof payload.score, 'number');
      return `score ${payload.score}, ${payload.total_tokens} token(s)`;
    },
  },
  {
    name: 'designesy_tokens_score still reads a token file whose server is quiet for 8 s before it answers',
    run: async () => {
      const t0 = performance.now();
      const { result, payload } = await h.callTool('designesy_tokens_score', { url: 'https://tokens-late.example.com/tokens.json' });
      const s = (performance.now() - t0) / 1000;
      assert.notEqual(result.isError, true, `returned an error after ${s.toFixed(2)} s: ${payload && payload.error}`);
      return `score ${payload.score} after ${s.toFixed(2)} s`;
    },
  },
  {
    name: 'designesy_llms_full_txt (cachedFetch) still reads a document that answers',
    run: async () => {
      const { result, payload } = await h.callTool('designesy_llms_full_txt', {});
      assert.notEqual(result.isError, true, `returned an error: ${payload && payload.error}`);
      assert.match(String(payload.content), /A published document that answers at once/);
      return `${String(payload.content).length} characters`;
    },
  },
  {
    name: `readiness r02: an llms.txt 1 MiB past the ${READINESS_LIMIT / MiB} MiB read limit is WARN, saying it was not read, never FAIL or PASS`,
    run: async () => eachRead([
      ['identity', () => readinessOverLimit('ready-llms.example.com', '/llms.txt', 'r02', 'llms.txt at https://ready-llms.example.com/llms.txt')],
      ['gzip that decodes past the limit', () => readinessOverLimit('ready-llms-gzip.example.com', '/llms.txt', 'r02', 'llms.txt at https://ready-llms-gzip.example.com/llms.txt')],
    ]),
  },
  {
    name: `readiness r02: an llms.txt reached through a 302 and 1 MiB past the ${READINESS_LIMIT / MiB} MiB read limit is WARN, and its read stops at the limit on the URL it lands on`,
    run: async () => {
      const landed = 'ready-hop-landed.example.com/llms.txt';
      seen.delete(landed);
      const said = checksAre(await readiness('https://ready-hop.example.com/'), {
        r02: ['WARN', notReadDetail('llms.txt at https://ready-hop.example.com/llms.txt')],
      });
      assert.ok(seen.get(landed), `no request reached ${landed}`);
      return `${said}; ${await stoppedAtLimit(landed, READINESS_LIMIT)}`;
    },
  },
  {
    name: `readiness r02: an llms.txt that answers 500 with a 20 MiB body is not found, as before, and the probe stops at the ${READINESS_LIMIT / MiB} MiB read limit of that body`,
    run: async () => {
      const key = 'ready-500.example.com/llms.txt';
      seen.delete(key);
      const said = checksAre(await readiness('https://ready-500.example.com/'), {});
      assert.ok(seen.get(key), `no request reached ${key}`);
      return `${said}; ${await stoppedAtLimit(key, READINESS_LIMIT)}`;
    },
  },
  {
    name: `readiness r02 follows a 302 whose body is 20 MiB once at most one socket read past the ${READINESS_LIMIT / MiB} MiB read limit of it has arrived, and reads the llms.txt it lands on`,
    run: async () => {
      const key = 'ready-302.example.com/llms.txt';
      const landed = 'ready-302-landed.example.com/llms.txt';
      seen.delete(key);
      sent.delete(landed);
      const brief = READY_FILES['ready-302-landed.example.com']['/llms.txt'].body;
      const said = checksAre(await readiness('https://ready-302.example.com/'), {
        r02: ['PASS', `/llms.txt returns ${brief.length} bytes of agent-facing brief`],
      });
      return `${said}; ${await hopAfterLimit(key, landed, READINESS_LIMIT)}`;
    },
  },
  {
    name: `readiness r08: a sitemap.xml 1 MiB past the ${READINESS_LIMIT / MiB} MiB read limit is WARN, saying it was not read, never FAIL or PASS`,
    run: async () => eachRead([
      ['identity', () => readinessOverLimit('ready-sitemap.example.com', '/sitemap.xml', 'r08', 'Sitemap at https://ready-sitemap.example.com/sitemap.xml')],
      ['gzip that decodes past the limit', () => readinessOverLimit('ready-sitemap-gzip.example.com', '/sitemap.xml', 'r08', 'Sitemap at https://ready-sitemap-gzip.example.com/sitemap.xml')],
    ]),
  },
  {
    name: `readiness r10: a home page 1 MiB past the ${READINESS_LIMIT / MiB} MiB read limit is WARN, saying it was not read, whatever its status`,
    run: async () => eachRead([
      ['identity', () => readinessOverLimit('ready-home.example.com', '/', 'r10', 'The page at https://ready-home.example.com/')],
      ['gzip that decodes past the limit', () => readinessOverLimit('ready-home-gzip.example.com', '/', 'r10', 'The page at https://ready-home-gzip.example.com/')],
      ['a 404 page', () => readinessOverLimit('ready-home-404.example.com', '/', 'r10', 'The page at https://ready-home-404.example.com/')],
    ]),
  },
  {
    name: `readiness r04: an MCP endpoint answering tools/list with 1 MiB past the ${READINESS_LIMIT / MiB} MiB read limit is WARN, saying it was not read`,
    run: async () => eachRead([
      ['identity', () => readinessOverLimit('ready-mcp.example.com', '/api/mcp', 'r04', 'The tools/list answer from /api/mcp')],
      ['gzip that decodes past the limit', () => readinessOverLimit('ready-mcp-gzip.example.com', '/api/mcp', 'r04', 'The tools/list answer from /api/mcp')],
    ]),
  },
  {
    name: 'readiness: each of the ten checks is WARN, saying its file was not read, when every file they read is past the read limit',
    run: async () => {
      const at = (p) => `https://ready-all.example.com${p}`;
      return checksAre(await readiness(at('/')), {
        r01: ['WARN', notReadDetail(`Token file at ${at('/tokens.json')}`)],
        r02: ['WARN', notReadDetail(`llms.txt at ${at('/llms.txt')}`)],
        r03: ['WARN', notReadDetail(`agent.json at ${at('/.well-known/agent.json')}`)],
        r04: ['WARN', notReadDetail('The tools/list answer from /api/mcp')],
        r05: ['WARN', notReadDetail(`DESIGN.md at ${at('/DESIGN.md')}`)],
        r06: ['WARN', notReadDetail(`Token file at ${at('/tokens.json')}`)],
        r07: ['WARN', notReadDetail(`Component schema at ${at('/components.json')}`)],
        r08: ['WARN', notReadDetail(`Sitemap at ${at('/sitemap.xml')}`)],
        r09: ['WARN', notReadDetail(`robots.txt at ${at('/robots.txt')}`)],
        r10: ['WARN', notReadDetail(`The page at ${at('/')}`)],
      });
    },
  },
  {
    name: "readiness r07: with no component schema, an /open.json past the read limit is WARN, saying it was not read",
    run: async () => checksAre(await readiness('https://ready-open.example.com/'), {
      r07: ['WARN', notReadDetail('https://ready-open.example.com/open.json')],
    }),
  },
  {
    name: `readiness: a check that tries several paths stops at a later path that answers past the ${READINESS_LIMIT / MiB} MiB read limit, and is WARN naming that path, never FAIL`,
    run: async () => {
      // [label, host, { check: [how its detail names the file, path] }].
      const sites = [
        ['the second path of each list', 'ready-second.example.com', {
          r01: ['Token file at ', '/design-tokens.json'],
          r02: ['llms.txt at ', '/.well-known/llms.txt'],
          r03: ['agent.json at ', '/agent.json'],
          r05: ['DESIGN.md at ', '/design.md'],
          r06: ['Token file at ', '/design-tokens.json'],
          r07: ['Component schema at ', '/contracts/components.json'],
        }],
        ['the third', 'ready-third.example.com', {
          r01: ['Token file at ', '/contracts/tokens.json'],
          r06: ['Token file at ', '/contracts/tokens.json'],
          r07: ['Component schema at ', '/component-schema.json'],
        }],
        ['the fourth', 'ready-fourth.example.com', {
          r01: ['Token file at ', '/export/tokens.json'],
          r06: ['Token file at ', '/export/tokens.json'],
        }],
        ["the second of r07's fallback, which r03 reads first", 'ready-fallback.example.com', {
          r03: ['agent.json at ', '/.well-known/agent.json'],
          r07: ['', '/.well-known/agent.json'],
        }],
      ];
      return eachRead(sites.map(([label, host, files]) => [label, async () => {
        const paced = Object.keys(READY_FILES[host]).filter((p) => READY_FILES[host][p].paced);
        for (const p of paced) seen.delete(`${host}${p}`);
        const expect = Object.fromEntries(Object.entries(files).map(([id, [subject, p]]) => [id, ['WARN', notReadDetail(`${subject}https://${host}${p}`)]]));
        const said = checksAre(await readiness(`https://${host}/`), expect);
        const stops = [];
        for (const p of paced) {
          assert.ok(seen.get(`${host}${p}`), `no request reached ${host}${p}`);
          stops.push(`${p}: ${await stoppedAtLimit(`${host}${p}`, READINESS_LIMIT)}`);
        }
        return [said, ...stops].join('; ');
      }]));
    },
  },
  {
    name: 'readiness r04: an MCP endpoint built with mcp-handler, which answers a tools/list POST with no body with 400, is PASS with its one tool, also through a 307; through a 302 it is sent a GET, which it answers 405',
    run: async () => {
      const key = 'ready-mcp-handler.example.com/api/mcp';
      const pass = ['PASS', 'MCP endpoint at /api/mcp responds to tools/list with 1 tool(s)'];
      // A scan of `host`: r04 as `r04`, and what the endpoint received.
      const scan = (host, r04) => async () => {
        asked.delete(key);
        const said = checksAre(await readiness(`https://${host}/`), { r04 });
        const a = asked.get(key);
        assert.ok(a, `no request reached ${key}`);
        return `${said}; the endpoint received a ${a.method} with ${a.body.length} body bytes`;
      };
      return eachRead([
        // The endpoint reads its request: one sent with no body is refused.
        ['a tools/list POST with no body', async () => {
          const resp = await resolution(safeFetch(`https://${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' } }));
          assert.equal(resp.status, 400, `HTTP ${resp.status}`);
          return `HTTP ${resp.status}`;
        }],
        ['readiness r04', scan('ready-mcp-handler.example.com', pass)],
        ['through a 307', scan('ready-mcp-307.example.com', pass)],
        ['through a 302', scan('ready-mcp-302.example.com', ['WARN', 'Endpoint exists but did not respond with a tool list (HTTP 405)'])],
      ]);
    },
  },
  {
    name: `a server that sends nothing for ${QUIET_S} s before it answers is read by each caller whose signal ends at ${CALLER_DEADLINE_S} s: readiness r02 is PASS, the score route scores the page and page-fetch reads it`,
    run: async () => {
      const timed = async (work) => {
        const t0 = performance.now();
        const out = await work();
        return { out, s: (performance.now() - t0) / 1000 };
      };
      return readsTogether([
        ['readiness r02', async () => {
          const brief = READY_FILES['ready-quiet.example.com']['/llms.txt'].body;
          const { out, s } = await timed(async () => checksAre(await readiness('https://ready-quiet.example.com/'), {
            r02: ['PASS', `/llms.txt returns ${brief.length} bytes of agent-facing brief`],
          }));
          return `${out}, after ${s.toFixed(2)} s`;
        }],
        ['the score route', async () => {
          const { out: r, s } = await timed(() => h.post('app/api/score/route.ts', { url: 'https://score-quiet.example.com/' }));
          assert.equal(r.status, 200, `HTTP ${r.status}: ${r.body && r.body.error}`);
          assert.notEqual(r.body.unreachable, true, `unreachable after ${s.toFixed(2)} s: ${r.body.unreachableDetail}`);
          assert.equal(typeof r.body.score, 'number', `score ${r.body.score}`);
          return `score ${r.body.score} ${r.body.grade}, after ${s.toFixed(2)} s`;
        }],
        ['page-fetch', async () => {
          const { out: page, s } = await timed(() => fetchPageResilient('https://page-quiet.example.com/'));
          assert.equal(page.html, PAGE, `${page.html.length} of ${PAGE.length} bytes of the page after ${s.toFixed(2)} s`);
          return `${page.html.length} bytes of the page, after ${s.toFixed(2)} s`;
        }],
      ]);
    },
  },
  {
    name: `the score route reports a page that sends its headers and then nothing as unreachable because the request timed out, after ${CALLER_DEADLINE_S} s on each of its two candidate URLs`,
    run: async () => {
      const t0 = performance.now();
      const r = await h.post('app/api/score/route.ts', { url: 'https://www.score-silent.example.com/' });
      const s = (performance.now() - t0) / 1000;
      assert.equal(r.status, 200, `HTTP ${r.status}: ${r.body && r.body.error}`);
      assert.equal(r.body.unreachable, true, `scored after ${s.toFixed(2)} s: ${r.body.score}`);
      assert.equal(r.body.unreachableReason, 'timeout', `${r.body.unreachableReason} after ${s.toFixed(2)} s: ${r.body.unreachableDetail}`);
      endedAt(s, 2 * CALLER_DEADLINE_S);
      return `${s.toFixed(2)} s, unreachable (${r.body.unreachableReason}): "${r.body.unreachableDetail}"`;
    },
  },
  {
    name: "every safeFetch call in the readiness route passes its READ_LIMIT, 4 MiB, as maxBodyBytes (a HEAD probe passes none)",
    run: async () => {
      const src = fs.readFileSync(path.join(APP, 'app/api/readiness/route.ts'), 'utf8').replace(/\r\n/g, '\n');
      const m = src.match(/^const READ_LIMIT = ([\d_ *]+);$/m);
      assert.ok(m, 'no READ_LIMIT in the readiness route');
      const bytes = m[1].split('*').reduce((p, x) => p * Number(x.trim().replace(/_/g, '')), 1);
      assert.equal(bytes, READINESS_LIMIT, `READ_LIMIT is ${bytes} bytes (${m[1]}), not ${READINESS_LIMIT}`);
      // Each call's init runs to the first "});" after it.
      const calls = [...src.matchAll(/\bsafeFetch\(/g)].map(({ index }) => src.slice(index, src.indexOf('});', index)));
      assert.equal(calls.length, 2, `${calls.length} safeFetch calls in the readiness route, expected 2 (probeUrl and r04)`);
      const without = calls.filter((c) => !/\bmaxBodyBytes: (?:method === 'GET' \? READ_LIMIT : undefined|READ_LIMIT)(?=\s*[,}])/.test(c));
      assert.equal(without.length, 0, `${without.length} of 2 safeFetch calls pass no READ_LIMIT as maxBodyBytes: ${without.map((c) => c.split('\n')[0]).join('; ')}`);
      return `READ_LIMIT ${m[1]}; 2 safeFetch calls, each passing it`;
    },
  },
  {
    name: "the readiness and report caches carry the read limit in their keys, so no result cached before it is read",
    run: async () => {
      const keys = [];
      for (const [route, fn] of [['app/api/readiness/route.ts', 'scoreReadinessUncached'], ['app/api/report/route.ts', 'runReportUncached']]) {
        const src = fs.readFileSync(path.join(APP, route), 'utf8');
        const at = src.indexOf(`unstable_cache(${fn}, [`);
        assert.ok(at >= 0, `no unstable_cache(${fn}, [...]) in ${route}`);
        const list = src.slice(at, src.indexOf(']', at));
        const parts = [...list.matchAll(/'([^']*)'/g)].map((x) => x[1]);
        assert.ok(parts.includes(CACHE_KEY_PART), `${route} caches ${fn} under [${parts.join(', ')}], with no '${CACHE_KEY_PART}'`);
        keys.push(`${route}: [${parts.join(', ')}]`);
      }
      return keys.join('; ');
    },
  },
  {
    name: `readiness reads an llms.txt, a sitemap, a home page and a tools/list answer of exactly the ${READINESS_LIMIT / MiB} MiB read limit whole, and scores them as before`,
    run: async () => eachRead([
      ['identity', async () => {
        const host = 'ready-at.example.com';
        const said = checksAre(await readiness(`https://${host}/`), {
          r02: ['PASS', `/llms.txt returns ${READINESS_LIMIT} bytes of agent-facing brief`],
          r04: ['PASS', 'MCP endpoint at /api/mcp responds to tools/list with 1 tool(s)'],
          r08: ['PASS', '/sitemap.xml found: site is crawlable'],
          r10: ['PASS', 'OG and Twitter card meta tags present'],
        });
        return `${said}; ${['/llms.txt', '/api/mcp', '/sitemap.xml', '/'].map((p) => `${p} ${receivedWhole(`${host}${p}`)}`).join(', ')} received`;
      }],
      ['gzip that decodes to exactly the limit', async () => {
        const said = checksAre(await readiness('https://ready-at-gzip.example.com/'), {
          r02: ['PASS', `/llms.txt returns ${READINESS_LIMIT} bytes of agent-facing brief`],
        });
        return `${said}; ${receivedWhole('ready-at-gzip.example.com/llms.txt')} of gzip received`;
      }],
    ]),
  },
  {
    name: 'readiness: a 404 whose body is 1 MiB past the read limit is not found, as before (llms.txt, sitemap.xml, robots.txt, MCP endpoint)',
    run: async () => {
      const said = checksAre(await readiness('https://ready-404.example.com/'), {});
      for (const p of ['/llms.txt', '/sitemap.xml', '/robots.txt', '/api/mcp']) assert.ok(seen.get(`ready-404.example.com${p}`), `no request reached ${p}`);
      return said;
    },
  },
  {
    name: 'readiness reads a body as resp.text() reads it: an llms.txt that starts with two byte order marks and holds bytes that are not UTF-8',
    run: async () => {
      const text = await new Response(READY_FILES['ready-bom.example.com']['/llms.txt'].bytes).text();
      return checksAre(await readiness('https://ready-bom.example.com/'), {
        r02: ['PASS', `/llms.txt returns ${text.length} bytes of agent-facing brief`],
      });
    },
  },
  {
    name: "readiness: an ordinary small site's checks, and those of a site with none of the files, are as before",
    run: async () => eachRead([
      ['a small site', async () => checksAre(await readiness('https://ready-small.example.com/'), SMALL_SITE)],
      ['a site with none of the files', async () => checksAre(await readiness('https://ready-empty.example.com/'), {})],
    ]),
  },
];

/** Run once every concurrent case has settled. */
const LAST = {
  name: 'nothing was thrown during the run where no caller could catch it',
  run: async () => {
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    assert.equal(uncaught.length, 0, `${uncaught.length}: ${uncaught.join('; ')}`);
    return 'none';
  },
};

/** Runs one case against the case deadline: its detail, or the error that failed it, and its time. */
async function runCase(c) {
  const t0 = performance.now();
  let timer;
  const deadline = new Promise((res) => { timer = setTimeout(() => res(null), CASE_DEADLINE_S * 1000); });
  let detail = null;
  let error = null;
  try {
    const r = await Promise.race([c.run().then((d) => ({ d })), deadline]);
    if (r === null) throw new Error(`still open at the ${CASE_DEADLINE_S} s case deadline: no bound`);
    detail = r.d;
  } catch (e) {
    error = e;
  } finally {
    clearTimeout(timer);
  }
  return { c, detail, error, s: (performance.now() - t0) / 1000 };
}

console.log(`Fetch bounds (${path.relative(process.cwd(), APP) || '.'}, node ${process.version}, margin ${MARGIN_S} s, case deadline ${CASE_DEADLINE_S} s)`);
casesStarted = true;
const results = await Promise.all(CONCURRENT.map(runCase));
results.push(await runCase(LAST));

const failures = [];
for (const { c, detail, error, s } of results) {
  const why = error ? String(error && error.message).split('\n')[0] : null;
  if (why) failures.push(c.name);
  console.log(`  ${why ? 'FAIL' : 'ok  '}  ${s.toFixed(2).padStart(6)} s  ${c.name}\n                   ${why || detail}`);
}

for (const s of [server, keepAliveServer]) {
  s.closeAllConnections();
  s.close();
}
const total = results.length;
console.log(`\n${total - failures.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`Fetch bounds: ${failures.length} case(s) failed.`);
  process.exit(1);
}
console.log('Fetch bounds: a body stops at its cap as it arrives, a read at its caller\'s deadline and no sooner and an MCP read at the route\'s deadline and its own byte limit, a readiness check whose file is past the read limit says so, a POST carries its body, and no read leaves a listener on its signal.');
process.exit(0);
