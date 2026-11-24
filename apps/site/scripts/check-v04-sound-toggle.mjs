#!/usr/bin/env node
/**
 * v04, the sound control: the browser audit finds the sound control by its
 * mark or its name, opens the panel that hides it, clicks it once and judges
 * what it shows once it has settled.
 *
 * WHY THIS EXISTS
 * POST /api/score/audit runs v04 in a real browser when ENABLE_BROWSER_AUDIT
 * is set. It clicked the first [aria-pressed] or [data-sound-toggle] in the
 * document and passed only if aria-pressed changed and so did
 * localStorage["designesy:sound"]. On designesy.org the first match is the
 * Motion row of the senses menu, in a panel that is hidden until the menu
 * opens: the click waited 30 s for it to show, and v04 came back MANUAL with
 * the detail "browser launch failed: elementHandle.click: Timeout 30000ms
 * exceeded". On any other site the storage key is designesy.org's own, so a
 * toggle that works, the Mute button of the W3C ARIA Authoring Practices
 * button example
 * (https://www.w3.org/WAI/ARIA/apg/patterns/button/examples/button/) among
 * them, failed with "aria-pressed flip=true, storage update=false". A page
 * whose only pressed buttons were a Bold toggle or a checklist failed the
 * same way. app/api/score/audit/route.ts says what v04 does now.
 *
 * HOW IT MEASURES
 * The real route, loaded through scripts/lib/route-harness.js with
 * ENABLE_BROWSER_AUDIT on, is sent one POST per case, and the case reads the
 * v04 the route answers. Everything around the browser is stood in for:
 * every name resolves to one public address, so the URL guard lets the
 * address through; PageSpeed Insights answers 404, so v21 is MANUAL at once;
 * the route's browser is launched through playwright-core's connectOverCDP
 * (CDP_ENDPOINT is set to an address nothing listens on), which the harness
 * answers with the gate's browser; and app/lib/browser-guard.ts passes every
 * context through unguarded (check-audit-ssrf.js measures the guard). The
 * pages are this file's own fixtures, below, each served at its own address.
 * The route runs v02 on the same browser first; this gate reads only v04,
 * whose context is the one 1280 pixels wide, and a case's fault is given to
 * that context. Besides v04's status and detail, a case fails when a
 * fixture's script throws, when the route leaves a promise to reject with no
 * handler, when v04 does not close the context it opened, when v04's
 * context, the one 1280 pixels wide, is not 800 high, or when v04's item and
 * category are not the ones app/lib/check-definitions.ts gives v04, whose
 * item must be the contract's wording, word for word. A context v04 opens at
 * another width is not taken for v04's, so its case fails on the page clock
 * with the stand-in, and in Chrome only where its fault was meant for v04.
 *
 * The browser is one of two:
 *   - The stand-in, the default, which CI and the build run: no browser
 *     process. Each page is parsed with htmlparser2, and the route's page
 *     functions and the fixture's own script run in a node:vm context whose
 *     document is a small DOM over that tree: attributes, text, comments,
 *     the hidden attribute, inline style, CSS selectors through css-select,
 *     click listeners with bubbling, localStorage per origin (which a page's
 *     script may replace, as those of cases 30 and 35 do), and a clock that
 *     moves only when the check waits. A page function gets its source
 *     text, as a browser does, so one that reads the route's module scope
 *     fails here too. An element's box is 100 by 20 pixels, with a side of
 *     0 where its inline width or height is 0, and none when it or an
 *     element above it has the hidden attribute or an inline display:none;
 *     it is visible when its box has no empty side and its inline or
 *     inherited visibility is not hidden. A click waits, on that clock, for
 *     its target to be visible and enabled (no disabled attribute on a form
 *     control, no aria-disabled="true" above it), as Playwright's does, and
 *     fails with Playwright's timeout message; a wait for an element to be
 *     visible waits the same way, and one for it to be attached holds at
 *     once. A wait for a page function polls on that clock, every 16 ms
 *     unless the route says otherwise, as Playwright's polls on animation
 *     frames. A load runs the page's scripts at once, then waits, on v04's
 *     page only, for the fixture's load or network-idle time, and fails with
 *     Playwright's message past its timeout. A fixed wait lets the calls
 *     already sent finish before its time passes, as a real one does.
 *   - A real Chrome or Chromium (--channel <name>, or --chromium <path>;
 *     local, not in CI), driven by this directory's own playwright-core
 *     whichever apps/site --app names: every request a context makes is
 *     answered from the fixtures by context.route(), so nothing leaves the
 *     machine. A request that a fixture marks slow is answered late, or
 *     never, in v04's context only.
 *
 * With the stand-in each case also gives how long v04's page waited on that
 * clock, which moves only while the route waits: for a page to load, for a
 * target to be ready, for the state or the stored value to move, or for the
 * hold after they moved. It must match too, so a wait that grows, shrinks or
 * goes is caught even when the verdict stays. Chrome keeps real time, so
 * there it is not judged.
 *
 * WHAT THE STAND-IN DOES NOT COVER
 * Layout and CSS: a box's size is fixed, and only the hidden attribute and
 * inline display, visibility, width and height change what is seen, never a
 * stylesheet. Hit testing: an element under another one still takes the
 * click. Playwright's stability wait, its retry timing, and its real
 * selector and accessible-name engines (main's :has-text() is read as a
 * case-insensitive substring of the text). Real time: its clock moves only
 * when the route waits, never while a page works. Navigation after a click,
 * network traffic (a load's times come from the fixture), shadow DOM and
 * frames. A real browser run covers these; the route's own name rule is its
 * own and runs the same in both.
 *
 * Neither browser runs the site's client code: case 1's markup is the
 * component's, but what a click on it does is the page script's. Nor the
 * route as next build bundles it: the harness compiles the TypeScript
 * source.
 *
 * CASES (v04 status and detail, exactly; the address sets the scope unless
 * a case gives one)
 *   1. designesy.org's senses menu, its markup rendered from
 *      app/lib/senses-menu.tsx inside the top bar's own elements (the header
 *      with id="topbar", and after the menu the drawer's trigger): a trigger
 *      with aria-expanded="false" whose aria-controls names a hidden panel
 *      holding the Motion row, then the Sound row (data-sound-toggle, its
 *      hint aria-hidden) and Dark mode; on the page, a visible checklist row
 *      that names the sound control. The page's script writes
 *      designesy:sound as the sound preference hook does. PASS: the panel is
 *      opened, the Sound row clicked.
 *   2. The W3C example's pattern, written for this gate: a link with
 *      role="button", aria-pressed and the text Mute, and no storage.
 *      PASS (universal).
 *   3. Case 2's page with scope=contract: FAIL, designesy:sound did not move.
 *   4. A Bold (its text split by an empty comment, as React's server output
 *      splits two text nodes), an Italic, a Volume and an unnamed toggle
 *      (aria-pressed), and two radios that say "Sound cues" (button
 *      role="radio" aria-checked): SKIP (universal).
 *   5. Case 4's page with scope=contract: WARN.
 *   6. No pressed or checked control at all: SKIP (universal).
 *   7. Case 6's page with scope=contract: WARN.
 *   8. A sound toggle that does not move, named by a long aria-label over an
 *      icon: FAIL, its name cut to 80 characters.
 *   9. A switch (role="switch", aria-checked) named by aria-labelledby
 *      "Audio", two levels inside a hidden settings panel that a Settings
 *      button (aria-expanded, aria-controls) opens, after a Menu button for
 *      another panel whose aria-controls ends in a space: PASS on
 *      aria-checked, the Menu button not clicked.
 *  10. Sound buttons that cannot be seen (under visibility:hidden, with no
 *      width, with no height), then a visible icon button named only by
 *      title="Unmute " (with a trailing space): PASS on the visible one.
 *  11. A sound button in a hidden panel whose only aria-expanded trigger is
 *      itself hidden, beside a visible button with aria-controls and no
 *      aria-expanded: MANUAL, nothing opens it, nothing clicked.
 *  12. A disabled sound button whose text runs over three lines, an access
 *      key underlined inside its last word: MANUAL, it did not take a click
 *      in 3000 ms.
 *  13. A page that does not load (connection refused): MANUAL, the page did
 *      not load.
 *  14. A sound toggle, aria-label "Effects " over the text "Sound effects",
 *      that changes 1050 ms after the click: PASS.
 *  15. A More button that marks itself expanded but never shows its panel:
 *      MANUAL, clicking More did not show the control.
 *  16. On designesy.org, a data-sound-toggle button with no pressed or
 *      checked state, in a part of the page that nothing opens: FAIL, as
 *      the state is looked for before any opener.
 *  17. Case 2's page, the browser failing to open v04's page: MANUAL, the
 *      browser could not open a page.
 *  18. Case 2's page, the page failing at v04's first page function: MANUAL,
 *      the check stopped.
 *  19. The browser fails to launch: the route answers 502, "Browser audit
 *      failed for ..." (the route's own answer, before any check runs).
 *  20. On designesy.org, a toggle that flips at once and writes
 *      designesy:sound 1000 ms later, over "false" stored before: PASS once
 *      the stored value follows.
 *  21. A Sound button in a hidden part of an open menu, whose only trigger
 *      says aria-expanded="true": MANUAL, nothing opens it (clicking that
 *      trigger would close the menu).
 *  22. A trigger whose aria-controls names two hidden panels, one id to a
 *      line, the Mute button (title "Shortcut: M") in the second: PASS,
 *      named "Mute".
 *  23. An icon toggle named "Interface Sound" by an aria-labelledby of two
 *      ids, one to a line, and "Toggle" by aria-label: PASS, named
 *      "Interface Sound".
 *  24. Case 2's page, the page failing while v04 waits for the state to
 *      move: MANUAL, the check stopped.
 *  25. A Sound toggle that turns on and back off 300 ms later, as an
 *      optimistic toggle that rolls back does: FAIL, it went back.
 *  26. On designesy.org, a toggle that stays on while designesy:sound, which
 *      held "false" before the click, is put back to "false" 300 ms after it
 *      is written: FAIL, the stored value went back.
 *  27. A Menu button that is itself a pressed control (aria-pressed with
 *      aria-expanded), not named for sound, opening the panel that holds the
 *      Sound button: PASS on the Sound button. The Menu button is clicked to
 *      open the panel, and is never taken for the sound control.
 *  28. The only opener of a hidden Sound button is disabled: MANUAL, its
 *      click waited 3000 ms and did not show the control.
 *  29. Case 2's page, v04's context failing as it closes: the route still
 *      answers, with case 2's PASS.
 *  30. On designesy.org, storage that throws, as where a browser blocks it
 *      (the page's script makes it throw): FAIL, designesy:sound did not
 *      change (null).
 *  31. Case 8's page with scope=contract: FAIL, the state did not move, after
 *      2000 ms, as the state is waited for before designesy:sound.
 *  32. A page that never goes network-idle (a request it makes is never
 *      answered): PASS, after 8000 ms and then its load.
 *  33. A page whose load event comes 9000 ms after it starts (an image takes
 *      that long): MANUAL, the page did not load, after two waits of 8000 ms.
 *  34. The browser audit off: MANUAL, and no page opened.
 *  35. A page that watches its storage: each read of localStorage flips its
 *      Sound toggle. PASS (universal), as v04 does not read designesy:sound
 *      there.
 *  36. Case 35's page with scope=contract: FAIL, the state did not change,
 *      as v04 reads the state, then designesy:sound, whose read flips the
 *      toggle, and then clicks.
 *  37. Case 2's page, v04's page.evaluate failing, as on a page that goes
 *      elsewhere when its storage is read: PASS (universal), as v04 makes no
 *      such call there.
 *  38. A More button whose aria-controls names the hidden sound button
 *      itself, which its click shows, the button named in exactly 80
 *      characters: PASS, the name shown whole.
 *  39. A toggle with both aria-pressed and aria-checked whose click moves
 *      aria-pressed only, named in 81 characters: PASS on aria-pressed, its
 *      name cut to 80 characters.
 *  40. Case 2's page, v04's context failing to open a page: MANUAL, the
 *      browser could not open a page, and v04 still closes that context.
 *  41. A settings panel that sets its hidden Sound button's aria-pressed to
 *      "true" the first time it opens, as a panel that shows a stored
 *      preference does: PASS, true→false, as the state is read once the
 *      panel is open.
 *  42. On designesy.org, a toggle that turns on, goes back off 300 ms later
 *      and writes designesy:sound 1000 ms after the click: FAIL, it went
 *      back, read after the whole 2000 ms wait for designesy:sound and the
 *      hold.
 *  43. A Sound switch (role="switch", aria-checked) that moves 1050 ms after
 *      the click: PASS on aria-checked, after 1600 ms.
 *  44. Case 42's toggle as a switch, on aria-checked: FAIL, it went back,
 *      after the same waits.
 *  45. A More button whose aria-controls names the hint beside a hidden
 *      Sound button, which holds neither the button nor an element above
 *      it, though its click would show both: MANUAL, nothing opens it.
 *
 * PROVING IT CAN FAIL
 * --app <dir> loads the route, and the senses menu, from another apps/site
 * directory. Against main before this change, 43 of the 45 cases fail, all
 * but 19 and 34, which main answers the same way, with the stand-in and with
 * Chrome alike. Twenty-three fail on the status: case 1 is MANUAL, "browser
 * launch failed: elementHandle.click: Timeout 30000ms exceeded", after 30 s
 * waiting for the hidden Motion row; case 2 is FAIL, "aria-pressed
 * flip=true, storage update=false"; cases 4 and 5 are FAIL on the Bold
 * toggle; case 9 is SKIP; cases 10, 16, 22, 38 and 41 are MANUAL after the
 * same wait; case 14 is FAIL, read 500 ms after the click, before the state
 * moved, and so are case 35, whose toggle main's own storage read flips
 * back, and case 43, whose switch main reads by aria-pressed; cases 20, 23,
 * 32 and 39 are FAIL on storage, and case 27 on the Menu button, the first
 * pressed control; cases 18 and 24 are FAIL, as main never runs the page
 * function or the wait that fails there; and cases 29, 30 and 37 are
 * MANUAL, on the context's close and on storage. The other twenty fail on
 * the detail alone, ten of them on "browser launch failed".
 *
 * Each of these single edits, to the route unless it says otherwise, fails
 * the cases in brackets, measured with the stand-in (353 edits, 353 caught;
 * "clock" marks a kill on the page clock alone, the verdicts unchanged).
 * They take in every two neighbouring statements in v04's functions in the
 * other order, each argument of its waits and reads changed, and what its
 * waits compare:
 *   - Finding the control: data-sound-toggle not looked for (1, 16); or
 *     looked for under another name (1, 16); names looked for first (1); the
 *     marked pool taken when empty (> 0 loosened to >= 0) (32 cases); one
 *     marked control not enough (> 1) (1, 16); the first one taken, visible
 *     or not (10); a hidden one never taken (12 cases); or the second one
 *     taken (pool[1]) (12 cases); the control's || null dropped (4, 5, 6,
 *     7); its first || made && (13 cases); the named list made before the
 *     list it filters (38 cases); the pool made before the named list (36
 *     cases); the control taken before the pool is made (38 cases); the
 *     hidden test made before the control is taken (38 cases);
 *     visibility:hidden counted as visible (10); visibility compared with
 *     'collapse' (10); the visibility test flipped (30 cases); an element
 *     with no box counted as visible (12 cases); the width test dropped
 *     (10); or loosened to >= 0 (10); the height test dropped (10); or
 *     loosened to >= 0 (10); the two joined by || (10); shown's box read
 *     after its test (34 cases); role ignored on a <button> (4, 5); the role
 *     attribute not read (2, 3, 4, 5, 24, 29, 37); or the type attribute
 *     read for it (2, 3, 4, 5, 24, 29, 37); the <button> test flipped (26
 *     cases); or made with 'button' in lower case (26 cases); role="switch"
 *     not a control (9, 43, 44); or read as 'checkbox' (9, 43, 44);
 *     role="button" not a control (31 cases); role="button" on anything but
 *     a <button> not a control (2, 3, 24, 29, 37); every role a control (4,
 *     5); the two roles joined by && (34 cases); isToggle's return dropped
 *     (34 cases); or made before its role is read (35 cases); aria-checked
 *     not looked for (9, 43, 44); aria-pressed not looked for (30 cases);
 *     the role filter dropped (4, 5); the name not read beside the text (8,
 *     9, 10, 23, 31, 38, 39); the text not read beside the name (14); or the
 *     two joined by && (8, 9, 10, 14, 23, 31, 38, 39); sound left out of the
 *     words (19 cases); audio (9); or mute (10 cases); volume added to them
 *     (4, 5); the words matched in one case only (29 cases); the probe given
 *     the word 'sound' alone (11 cases); or '' (every name says sound) (4,
 *     5, 27).
 *   - The name: aria-labelledby not read (9, 23); or dropped from the chain
 *     (9, 23); read by its first id only (23); or split at single spaces
 *     only (23); its id test's branches swapped (9, 23); an id's missing
 *     element not passed over (35 cases); its labels joined with no space
 *     (23); each label replacing the one before (23); aria-labelledby's ||
 *     '' dropped (35 cases); its trim dropped (9, 23); the chain's first ||
 *     made && (8, 9, 14, 23, 31, 38, 39); a label's element read after its
 *     test (36 cases); the label declared after its loop (9, 23); the chain
 *     read before the labels are gathered (9, 23); nameOf's return made
 *     before the name (36 cases); aria-label read before aria-labelledby
 *     (23); aria-label not read (8, 14, 31, 38, 39); its || '' dropped (31
 *     cases); its trim dropped (14); the content read before aria-label
 *     (14); the content not read (25 cases); its trim dropped (1, 2, 3, 29,
 *     37); title read before the content (22); title not read (10); its ||
 *     '' dropped (4, 5); its trim dropped (10); white space not collapsed
 *     (12); collapsed once only (no g flag) (12); only spaces collapsed
 *     (12); white space removed (8, 12, 23, 31, 38, 39); nameOf's return
 *     dropped (34 cases); text nodes not read (25 cases); the text-node test
 *     flipped (25 cases); or made on type 8 (comments) (25 cases); a comment
 *     read as an element (4, 5); the element test made on type 9 (25 cases);
 *     aria-hidden text kept (1); aria-hidden="false" text taken out instead
 *     (1); the hidden attribute read for aria-hidden (1); the aria-hidden
 *     test flipped (25 cases); content's two tests swapped (4, 5); or joined
 *     by && (1, 4, 5); the line that skips both dropped (1); the child loop
 *     loosened to <= (31 cases); or started at 1 (25 cases); each child
 *     replacing the text before (1, 2, 3, 12, 29, 37); the text started with
 *     a space (12); content's return dropped (31 cases); content's text-node
 *     line made after its element line (25 cases); its text declared after
 *     its loop (31 cases); or its return made before the loop (25 cases);
 *     the name not cut (8, 31, 39); or cut only past 90 characters (39); cut
 *     at 80 (>= 80) (38); the cut test flipped (33 cases); the name cut with
 *     its trailing space (8, 31); cut at 78 characters (39); or at 80 (8,
 *     31, 39); marked with three dots (8, 31, 39); quoted's JSON dropped (33
 *     cases); or its branches swapped (33 cases); the found-by words swapped
 *     (33 cases); found's marked test loosened to >= 0 (31 cases); found's
 *     branches swapped (33 cases); the name's control test dropped (4, 5, 6,
 *     7); in app/lib/senses-menu.tsx, the Sound row not marked (1).
 *   - Opening: the hidden test never true (11 cases); flipped (33 cases); or
 *     its null test dropped (4, 5, 6, 7); or flipped (15 cases); no trigger
 *     looked for (1, 9, 15, 22, 27, 28, 38, 41); the trigger need not be
 *     visible (11); need not have aria-expanded (11, 21); or may have it
 *     "true" (21); only a trigger with "true" (9 cases); aria-controls read
 *     from aria-owns (1, 9, 15, 22, 27, 28, 38, 41); aria-controls read as
 *     one id (22); or by its first id only (22); or split at single spaces
 *     only (22); any trigger taken (>= -1) (9, 45); a match at index 0
 *     refused (> 0) (1, 9, 15, 27, 28, 38, 41); the walk's id test dropped
 *     (9); or flipped (1, 9, 15, 22, 27, 28, 38, 41); the walk starting at
 *     the control's parent (38); or two levels up (1, 15, 22, 27, 28, 38,
 *     41); the walk going on past the first element a trigger names (1);
 *     only the control itself tried (1, 9, 15, 22, 27, 28, 41); the walk's
 *     end test dropped (11, 16, 21, 45); or its && made || (1, 11, 16, 21,
 *     45); the trigger list made after the walk (12 cases); the walk's id
 *     read after its test (12 cases); the opener declared after its search
 *     (12 cases); the opener's name read with no opener (30 cases); its
 *     branches swapped (32 cases); the hidden branch never taken (11 cases);
 *     or always (22 cases); a hidden control with no trigger clicked anyway
 *     (11, 21, 45); the no-opener test flipped (11 cases); or its return
 *     dropped (11, 21, 45); or its detail in its earlier words (11, 21, 45);
 *     the trigger clicked before the no-opener test (11, 21, 45); the
 *     trigger's click dropped (1, 9, 22, 27, 28, 38, 41); left at the
 *     default timeout (28); or not awaited (28); the control not waited for
 *     after its trigger (15); or waited for as attached (15); that wait left
 *     at the default timeout (15); or not awaited (15); or made on the
 *     trigger (15); the control waited for before its trigger is clicked (1,
 *     9, 22, 27, 28, 38, 41); a trigger that fails left to the catch-all
 *     (15, 28); or that catch's return dropped (15, 28).
 *   - Clicking: a control with no state clicked anyway (16); the no-state
 *     return dropped (16); the no-state test flipped (34 cases); or made
 *     after the opener (16); or before the control's words are built (16);
 *     aria-pressed not read as the state (30 cases); aria-checked never the
 *     state (9, 43, 44); aria-checked looked for first (39); the
 *     aria-pressed line's control test dropped (4, 5, 6, 7); or made after
 *     its test (4, 5, 6, 7); the aria-checked line's dropped (4, 5, 6, 7);
 *     the click's timeout left at the default (12); or 2000 ms (12, 15, 28);
 *     the click not awaited (12); a click that fails left to the catch-all
 *     (12); or that catch's return dropped (12); the state's first read not
 *     awaited (26 cases); or made after the click (21 cases); or before the
 *     opener (41); or made on aria-pressed, whatever the state (9, 43, 44);
 *     the stored value read before the click on every site (35, 37); with
 *     universal only (20, 26, 35, 36, 37); or never (20, 26, 36); not
 *     awaited (1, 3, 20, 26, 30, 42, 44); after the click (1, 26); or before
 *     the state (36); or under another key (20, 26); the first wait made
 *     before the click (25 cases).
 *   - Waiting: no wait for the state (10 cases); a wait of 500 ms (10
 *     cases); or 3000 ms (3, 8, 30, 31, 36, 42, 44, clock); the wait's
 *     timeout left at the default (3, 8, 30, 31, 36, 42, 44, clock); its
 *     polling left at the default (14, 20, 43, clock); 50 ms (14, 43,
 *     clock); or 200 ms (14, 43, clock); the wait not awaited (3, 8, 24, 30,
 *     31, 36, 42, 44); its return true dropped (23 cases); a move reported
 *     as none (23 cases); its catch dropped (3, 8, 30, 31, 36, 42, 44);
 *     every error in it taken as a timeout (24); or every Error (&& made ||)
 *     (24); its return true made before the wait (11 cases); its rethrow
 *     made before its timeout test (3, 8, 30, 31, 36, 42, 44); the two
 *     values it sends the page swapped (3, 8, 14, 31, 36, 42, 43, 44); or
 *     its key left out (3, 20, 30, 42, 44); its timeout given as
 *     V04_PRESS_MS (3, 8, 30, 31, 36, 42, 44, clock); a timeout thrown (3,
 *     8, 30, 31, 36, 42, 44); or one named 'Error' taken for it (3, 8, 24,
 *     30, 31, 36, 42, 44); or taken as a move (3, 8, 30, 31, 36); the
 *     timeout test flipped (3, 8, 24, 30, 31, 36, 42, 44); the rethrow
 *     dropped (24); the first wait comparing the state with null (8, 14, 31,
 *     36, 43); or with the stored value (8, 14, 31, 36, 43); or asking for
 *     designesy:sound too (3, 30, 42, 44); or given designesy:sound and null
 *     (20 cases); or made on the opener (20 cases); or on aria-pressed,
 *     whatever the state (43); or on aria-checked (8, 14, 31, 36); or not
 *     awaited (8, 24, 31, 36); or its test flipped (26 cases); a state that
 *     never moved going on to the hold (8, 31, 36); that FAIL return dropped
 *     (8, 31, 36); designesy:sound not waited for (3, 20, 26, 30, 42, 44);
 *     waited for on every site (16 cases); or whenever the state moved (&&
 *     made ||) (21 cases); or against null (20); or against the state (3,
 *     42, 44); or given '' for its key (3, 20, 30, 42, 44); the second wait
 *     comparing the state with null (42, 44, clock); or with the stored
 *     value (42, 44, clock); or made on the opener (3, 20, 26, 30, 42, 44);
 *     or on aria-pressed (44, clock); or on aria-checked (42, clock); that
 *     wait not awaited (3, 30); the two waits swapped (31, 36, 42, 44);
 *     soundMoved's state test flipped (26 cases); or dropped (8, 14, 31, 36,
 *     42, 43, 44); or made after the key test (8, 14, 31, 36, 43); or
 *     comparing with the stored value (8, 14, 31, 36, 42, 43, 44); or
 *     reading aria-pressed (43, 44); the stored value ignored (3, 20, 30,
 *     42, 44); the no-key return dropped (23 cases); the key test flipped
 *     (23 cases); the storage comparison flipped (1, 3, 20, 26, 42, 44); or
 *     its return dropped (1, 20, 26); or comparing with the state (3, 42,
 *     44); or made before the key test (23 cases); sessionStorage read there
 *     (1, 20, 26); a storage error taken as a move (30); or not caught (30).
 *   - The hold: none (23 cases); 0 ms (23 cases); 200 ms (23 cases); 300 ms
 *     (23 cases, clock); or 1000 ms (23 cases, clock); not awaited (25, 26);
 *     made before designesy:sound is waited for (20, 26); the state read
 *     before it (25); or the stored value (26, 35, 37).
 *   - Judging: the state's second read not awaited (23 cases); or made on
 *     aria-pressed (9, 43, 44); the went-back test flipped (23 cases); or
 *     its return dropped (25, 42, 44); or made before the second read (23
 *     cases); the state compared with itself (20 cases); a state that went
 *     back reported as one that did not move (25, 42, 44); the universal
 *     test flipped (20 cases); or its PASS return dropped (15 cases); or
 *     made before its words (15 cases); designesy:sound judged on every site
 *     (15 cases); or read there before the PASS (37); judged on none (3, 26,
 *     30); or under another key (1, 3, 20, 26, 30); the stored value's
 *     second read not awaited (1, 3, 20, 26, 30); or made under another key
 *     (1, 20, 26); or made after the stored-value test (1, 3, 20, 26, 30);
 *     the stored-value test flipped (1, 3, 20, 26, 30); or its FAIL return
 *     dropped (3, 26, 30); the stored value compared with itself (1, 20); a
 *     stored value that went back reported as one that did not move (3, 26,
 *     30); or shown without its JSON (26); or that FAIL made before its
 *     words (3, 26, 30); the contract PASS return dropped (1, 20); or its
 *     values shown without JSON (1, 20); or made before the stored-value
 *     test (3, 26, 30); storedSound's catch dropped (30); or answering ''
 *     (30); or its return dropped (1, 3, 20, 26, 42, 44); or sessionStorage
 *     read (1, 20, 26, 36); the absence verdicts swapped (4, 5, 6, 7); or
 *     made before their words (4, 5, 6, 7); the no-control test flipped (38
 *     cases); or its return dropped (4, 5, 6, 7); the count of pressed
 *     controls taken from the named ones (4, 5); or the marked ones (4, 5);
 *     the state declared after it is set (33 cases); the probe's return made
 *     before the state is set (33 cases); the probe's return dropped (38
 *     cases); the probe not awaited (39 cases); its info (38 cases); info's
 *     value (38 cases); the control (38 cases); or the opener (38 cases);
 *     the probe's info read before the probe is made (39 cases); v04's id
 *     changed (44 cases); its item (44 cases); or its category (44 cases).
 *   - Loading and failures: the no-browser return dropped (34); the first
 *     stage named load (17, 40); or named so before the page opens (40); a
 *     page 600 pixels high (43 cases); or 1024 wide (43 cases); or no size
 *     asked for (43 cases); opening a page reported as a launch failure (17,
 *     40); loading (13, 33); or the check (18, 24); the first two stage
 *     labels swapped (13, 17, 33, 40); the stage test flipped (13, 17, 18,
 *     24, 33, 40); or the load-stage test (13, 18, 24, 33); the load stage
 *     never entered (13, 33); or the check stage (18, 24); the load stage
 *     entered after the load (13, 33); the check stage entered before it
 *     (13, 33); or after the check (18, 24); the context not awaited (43
 *     cases); or the page (42 cases); the page opened before the context (43
 *     cases); the context declared after the try that opens it (43 cases);
 *     the network-idle load not awaited (13, 32, 33); or the load after it
 *     (13, 33); the load after it dropped (32, 33); the two loads swapped
 *     (32, clock); the network-idle load left at the default timeout (32,
 *     33); or 5000 ms (32, 33, clock); or waiting for load (32, clock); the
 *     load after it left at the default timeout (33); or 10000 ms (33); or
 *     waiting for domcontentloaded (33); the contract test flipped (28
 *     cases); the check not awaited (18, 24); or its return dropped (37
 *     cases); the catch dropped (13, 17, 18, 24, 33, 40); or its return (13,
 *     17, 18, 24, 33, 40); or that return made before its words (13, 17, 18,
 *     24, 33, 40); the finally dropped (42 cases); the close's catch dropped
 *     (29); or its optional chain (17); an error's second line taken (9
 *     cases); or its whole message (12, 15, 28, 33); its name kept
 *     (String(e)) (9 cases); or firstLine's branches swapped (9 cases).
 *
 * These 59 single edits change nothing v04 reports, so no case can fail
 * them. Some change which of the DOM's methods v04 calls, which a page could
 * see only by replacing those methods, and nothing here says which ones it
 * calls; the rest change nothing at all. In content(), a text node's || ''
 * (a text node's value is never null); in nameOf(), the empty-id test (no
 * element has the empty string for its ID, in a browser or here), a
 * label's || '' (an element's textContent is never null) and the label
 * started with a space (it is trimmed before it is used); the text's || ''
 * beside the name (the same), and the text tested before the name (each
 * test only reads); the selector for pressed and checked controls in the
 * other order (querySelectorAll gives document order); isToggle's two
 * roles, shown's visibility test, the opener search's two tests or the
 * walk's two tests, each in the other order (both sides only read, and
 * neither throws); the opener search's control test, its hidden test and
 * its && made || (an opener is clicked, and named, only for a hidden
 * control, and a hidden control is never null); [aria-controls] in the
 * trigger selector (an element without it names no id, and every id tried
 * is not empty) and its || '' (each trigger has the attribute); the
 * opener's || null (undefined goes on with the walk and gives no handle, as
 * null does); the control test on found (with no control it is not
 * reported); the Error test in settled(), and its two tests in the other
 * order (Playwright rejects with an Error); either half of the
 * browser-and-enabled test, its || made &&, and its two sides in the other
 * order (the route passes a browser exactly when the audit is on); the
 * await on the context's close (the close still starts and its failure is
 * still caught, and the route closes the browser next); each of the 16 ===
 * or !== in the new code loosened to == or != (each compares two strings,
 * two numbers, two values that are each a string or null, or an element or
 * null with null, which is never undefined); in the first wait, the stored
 * value given in place of null (with no key, soundMoved returns before it
 * reads the stored value); soundMoved's storage read naming designesy:sound
 * itself (that line runs only with that key); and these neighbouring
 * statements in the other order, as neither reads what the other sets and
 * neither changes the page: in soundControlProbe, the definitions of sound
 * and shown, shown and content, content and nameOf, nameOf and isToggle,
 * isToggle and marked, and marked and toggles (each defines a function or
 * reads the page), hidden and the opener's declaration, and the opener
 * search and the state's declaration; in content(), its text's declaration
 * and its element test; in clickSoundControl, the reads of the probe's info
 * and control, or of its control and opener (each reads a property of the
 * object the probe returned, which has no getters), the opener's read and
 * the no-control test (with no control the probe found no opener, and that
 * branch reads none), that test and the control's words (quoted() of an
 * empty name throws nothing, and that branch does not read them), and the
 * went-back test and the moved words; and in checkSoundToggle, the
 * no-browser test and the stage's declaration, or that and the context's.
 *
 * Usage:  node scripts/check-v04-sound-toggle.mjs [--app <dir>] [--channel <name> | --chromium <path>]
 * Exits 1 on any failure.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'htmlparser2';
import { selectAll, selectOne, is as matchesSelector } from 'css-select';
import { Text } from 'domhandler';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const APP = path.resolve(opt('--app') || path.join(HERE, '..'));
const CHANNEL = opt('--channel');
const CHROMIUM = opt('--chromium');
const require = createRequire(import.meta.url);
const { createHarness } = require('./lib/route-harness.js');
const ROUTE = 'app/api/score/audit/route.ts';

// The route takes its browser from connectOverCDP when CDP_ENDPOINT is set;
// the harness answers that call, and nothing listens at this address.
process.env.ENABLE_BROWSER_AUDIT = '1';
process.env.CDP_ENDPOINT = 'ws://127.0.0.1:9/devtools/browser/stand-in';
delete process.env.CDP_HEADERS_JSON;
delete process.env.PSI_API_KEY;

const PUBLIC_V4 = '93.184.215.14';

// ── The fixtures ─────────────────────────────────────────────────────────────
// Each page's script uses only what the stand-in offers, such as
// getElementById, querySelector(All), addEventListener('click') and the
// event's currentTarget, get/setAttribute, hidden, textContent, localStorage
// and setTimeout.

const page = (title, body, script = '') =>
  `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body>\n${body}\n${script ? `<script>\n${script}\n</script>\n` : ''}</body>\n</html>\n`;

/** A click listener that flips the pressed or checked state named by `attr` on element `id`. */
const flip = (id, attr = 'aria-pressed') =>
  `document.getElementById('${id}').addEventListener('click', function () {\n  var el = document.getElementById('${id}');\n  el.setAttribute('${attr}', el.getAttribute('${attr}') === 'true' ? 'false' : 'true');\n});`;

/**
 * Case 1's page: the senses menu as app/lib/senses-menu.tsx renders it on the
 * server (React's renderToStaticMarkup, the markup a first load gets), inside
 * the top bar's own elements as app/lib/topbar.tsx renders them (the header
 * with id="topbar", then the menu trigger after the senses menu, whose
 * aria-controls names the closed drawer), and on the page a pause toggle and
 * a checklist row that names the sound control, as /contracts has. The script
 * stands in for the menu's client code: the trigger shows and hides the panel
 * it names, each row flips its aria-pressed, and the Sound row stores its new
 * state under designesy:sound and changes its hint, as the sound preference
 * hook (app/lib/use-sound.tsx) does.
 */
const sensesPage = (menu) =>
  page(
    'Senses',
    `<header class="topbar" id="topbar">
<div class="topbar-inner">
<div class="topbar-right">
${menu}
<button type="button" class="nav-trigger" aria-label="Open menu" aria-expanded="false" aria-controls="site-menu"><span class="nav-trigger-bar"></span></button>
</div>
</div>
</header>
<div id="site-menu" class="nav-drawer" role="dialog" aria-modal="true" aria-label="Menu" hidden></div>
<main>
  <button type="button" class="motion-toggle-row" id="pause" aria-pressed="false">Pause animations</button>
  <div role="list">
    <div role="listitem"><button type="button" class="check-cell" id="check" aria-pressed="false">Sound control is named by its visible Sound label and exposes aria-pressed</button></div>
  </div>
</main>`,
    `var trigger = document.querySelector('.senses-trigger');
var panel = document.getElementById(trigger.getAttribute('aria-controls'));
trigger.addEventListener('click', function () {
  var open = trigger.getAttribute('aria-expanded') !== 'true';
  trigger.setAttribute('aria-expanded', String(open));
  panel.hidden = !open;
});
var rows = document.querySelectorAll('.senses-row');
for (var i = 0; i < rows.length; i++) {
  rows[i].addEventListener('click', function (event) {
    var row = event.currentTarget;
    row.setAttribute('aria-pressed', row.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  });
}
var sound = document.querySelector('.senses-row--sound');
sound.addEventListener('click', function () {
  var on = sound.getAttribute('aria-pressed') === 'true';
  sound.querySelector('.senses-row-hint').textContent = on ? 'Soft cues on press and toggle' : 'Muted';
  try {
    localStorage.setItem('designesy:sound', String(on));
  } catch (e) {}
});
${flip('pause')}
${flip('check')}`,
  );

const MUTE_LINK = page(
  'Mute link',
  `<main>
  <p>Two buttons: one prints, one mutes.</p>
  <div id="print" role="button" tabindex="0">Print</div>
  <a id="mute" role="button" tabindex="0" aria-pressed="false">
    Mute
    <svg aria-hidden="true" focusable="false" width="16" height="16"></svg>
  </a>
</main>`,
  flip('mute'),
);

// Bold's text is split by an empty comment, as React's server output splits
// two text nodes; the Pin toggle has no name at all.
const TOOLBAR = page(
  'Editor',
  `<div role="toolbar" aria-label="Text formatting">
  <button type="button" id="bold" aria-pressed="false">B<!-- -->old</button>
  <button type="button" id="italic" aria-pressed="true">Italic</button>
</div>
<div role="toolbar" aria-label="Player">
  <button type="button" id="volume" aria-pressed="false">Volume</button>
  <button type="button" id="pin" aria-pressed="false" style="width: 32px; height: 32px"><svg aria-hidden="true" focusable="false" width="16" height="16"></svg></button>
</div>
<div role="radiogroup" aria-label="Cue set">
  <button type="button" role="radio" id="soft" aria-checked="true">Sound cues: soft</button>
  <button type="button" role="radio" id="bright" aria-checked="false">Sound cues: bright</button>
</div>`,
  `${flip('bold')}
${flip('italic')}
${flip('volume')}
${flip('pin')}
['soft', 'bright'].forEach(function (id) {
  document.getElementById(id).addEventListener('click', function () {
    document.getElementById('soft').setAttribute('aria-checked', String(id === 'soft'));
    document.getElementById('bright').setAttribute('aria-checked', String(id === 'bright'));
  });
});`,
);

const PLAIN = page(
  'Notes',
  `<main>
  <h1>Notes</h1>
  <p>A page with no toggle.</p>
  <form><label>Email <input type="email" name="email"></label> <button type="submit">Subscribe</button></form>
</main>`,
);

const BROKEN = page(
  'Player',
  `<main>
  <button type="button" id="mute" aria-pressed="false" aria-label="Mute the interface sounds on this page, including the hover, press, toggle and confirmation cues"><span aria-hidden="true">&#9680;</span></button>
</main>`,
  `document.getElementById('mute').addEventListener('click', function () {
  document.getElementById('mute').setAttribute('data-clicked', 'true');
});`,
);

// The Menu button comes first, and its aria-controls ends in a space, as a
// template can leave it.
const SETTINGS = page(
  'Settings',
  `<button type="button" id="nav" aria-expanded="false" aria-controls="site-nav ">Menu</button>
<nav id="site-nav" hidden><a href="/">Home</a></nav>
<button type="button" id="more" aria-expanded="false" aria-controls="settings">Settings</button>
<section id="settings" hidden>
  <div class="field">
    <span id="audio-label">Audio</span>
    <button type="button" role="switch" id="audio" aria-checked="false" aria-labelledby="audio-label" style="width: 44px; height: 24px"></button>
  </div>
</section>`,
  `[['nav', 'site-nav'], ['more', 'settings']].forEach(function (pair) {
  var button = document.getElementById(pair[0]);
  button.addEventListener('click', function () {
    var open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    document.getElementById(pair[1]).hidden = !open;
  });
});
${flip('audio', 'aria-checked')}`,
);

// Three Sound buttons that cannot be seen (under visibility:hidden, no width,
// no height), then the icon a visitor sees, whose title ends in a space.
const TWO = page(
  'Two buttons',
  `<div style="visibility: hidden"><button type="button" id="old" aria-pressed="false">Sound</button></div>
<button type="button" id="narrow" aria-pressed="false" style="width: 0; padding: 0; border: 0; overflow: hidden">Sound</button>
<button type="button" id="flat" aria-pressed="false" style="height: 0; padding: 0; border: 0; overflow: hidden">Sound</button>
<button type="button" id="icon" aria-pressed="false" title="Unmute " style="width: 32px; height: 32px"><svg aria-hidden="true" focusable="false" width="16" height="16"></svg></button>`,
  `${flip('old')}
${flip('narrow')}
${flip('flat')}
${flip('icon')}`,
);

const STUCK = page(
  'Drawer',
  `<div hidden><button type="button" id="more" aria-expanded="false" aria-controls="drawer">More</button></div>
<button type="button" id="tab" aria-controls="drawer">Drawer</button>
<div id="drawer" hidden><button type="button" id="snd" aria-pressed="false">Sound</button></div>`,
  `${flip('snd')}`,
);

/** A disabled sound button whose text runs over three lines, its last word with an underlined access key in the middle. */
const DISABLED = page(
  'Disabled',
  `<button type="button" id="snd" aria-pressed="false" disabled>Sound
      cues
      o<u>f</u>f</button>`,
  `${flip('snd')}`,
);

const LATE = page(
  'Late',
  `<button type="button" id="fx" aria-pressed="false" aria-label="Effects ">Sound effects</button>`,
  `document.getElementById('fx').addEventListener('click', function () {
  setTimeout(function () {
    var fx = document.getElementById('fx');
    fx.setAttribute('aria-pressed', fx.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  }, 1050);
});`,
);

const DEAD = page(
  'Dead opener',
  `<button type="button" id="more" aria-expanded="false" aria-controls="panel">More</button>
<div id="panel" hidden><button type="button" id="snd" aria-pressed="false">Mute</button></div>`,
  `document.getElementById('more').addEventListener('click', function () {
  document.getElementById('more').setAttribute('aria-expanded', 'true');
});
${flip('snd')}`,
);

/** A marked sound button with no pressed or checked state, in a part of the page that nothing opens. */
const NO_STATE = page('No state', `<div hidden><button type="button" id="snd" data-sound-toggle="">Sound</button></div>`, flip('snd'));

/** A returning visitor's stored preference, and a toggle that writes the new one 1000 ms after it flips. */
const SLOW_STORE = page(
  'Slow store',
  `<button type="button" id="snd" aria-pressed="false">Sound</button>`,
  `try {
  if (localStorage.getItem('designesy:sound') === null) localStorage.setItem('designesy:sound', 'false');
} catch (e) {}
var snd = document.getElementById('snd');
snd.addEventListener('click', function () {
  var on = snd.getAttribute('aria-pressed') !== 'true';
  snd.setAttribute('aria-pressed', String(on));
  setTimeout(function () {
    try {
      localStorage.setItem('designesy:sound', String(on));
    } catch (e) {}
  }, 1000);
});`,
);

/** An open menu whose trigger says so, with the sound button in a part of it that is hidden. */
const OPEN_MENU = page(
  'Open menu',
  `<button type="button" id="menu" aria-expanded="true" aria-controls="menu-panel">Menu</button>
<div id="menu-panel">
  <p>Display</p>
  <div id="menu-extra" hidden><button type="button" id="snd" aria-pressed="false">Sound</button></div>
</div>`,
  `var menu = document.getElementById('menu');
menu.addEventListener('click', function () {
  var open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  document.getElementById('menu-panel').hidden = !open;
});
${flip('snd')}`,
);

/** A trigger whose aria-controls names two panels, one id to a line; the sound button is in the second. */
const TWO_PANELS = page(
  'Two panels',
  `<button type="button" id="prefs" aria-expanded="false" aria-controls="prefs-general
prefs-sound">Preferences</button>
<div id="prefs-general" hidden><p>General</p></div>
<div id="prefs-sound" hidden><button type="button" id="snd" aria-pressed="false" title="Shortcut: M">Mute</button></div>`,
  `var prefs = document.getElementById('prefs');
prefs.addEventListener('click', function () {
  var open = prefs.getAttribute('aria-expanded') !== 'true';
  prefs.setAttribute('aria-expanded', String(open));
  document.getElementById('prefs-general').hidden = !open;
  document.getElementById('prefs-sound').hidden = !open;
});
${flip('snd')}`,
);

/** A toggle named by an aria-labelledby of two ids, one to a line, and by aria-label. */
const LABELLED = page(
  'Labelled',
  `<div class="row"><span id="snd-row">Interface</span> <span id="snd-label">Sound</span> <button type="button" id="snd" aria-pressed="false" aria-labelledby="snd-row
snd-label" aria-label="Toggle" style="width: 44px; height: 24px"></button></div>`,
  flip('snd'),
);

/** A returning visitor's stored preference, and a toggle that stays on while that preference is put back 300 ms after the new one is written. */
const STORE_ROLLBACK = page(
  'Store rollback',
  `<button type="button" id="snd" aria-pressed="false">Sound</button>`,
  `try {
  if (localStorage.getItem('designesy:sound') === null) localStorage.setItem('designesy:sound', 'false');
} catch (e) {}
var snd = document.getElementById('snd');
snd.addEventListener('click', function () {
  var on = snd.getAttribute('aria-pressed') !== 'true';
  snd.setAttribute('aria-pressed', String(on));
  try {
    localStorage.setItem('designesy:sound', String(on));
  } catch (e) {}
  setTimeout(function () {
    try {
      localStorage.setItem('designesy:sound', 'false');
    } catch (e) {}
  }, 300);
});`,
);

/** An optimistic toggle that rolls back: on at once, off again 300 ms later. */
const ROLLBACK = page(
  'Rollback',
  `<button type="button" id="snd" aria-pressed="false">Sound</button>`,
  `var snd = document.getElementById('snd');
snd.addEventListener('click', function () {
  snd.setAttribute('aria-pressed', 'true');
  setTimeout(function () {
    snd.setAttribute('aria-pressed', 'false');
  }, 300);
});`,
);

/** A Menu button that is a pressed control itself, not named for sound, and opens the panel that holds the Sound button. */
const PRESSED_OPENER = page(
  'Pressed menu',
  `<button type="button" id="menu" aria-pressed="false" aria-expanded="false" aria-controls="menu-panel">Menu</button>
<div id="menu-panel" hidden><button type="button" id="snd" aria-pressed="false">Sound</button></div>`,
  `var menu = document.getElementById('menu');
menu.addEventListener('click', function () {
  var open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-pressed', String(open));
  document.getElementById('menu-panel').hidden = !open;
});
${flip('snd')}`,
);

/** A disabled More button, the only opener of the panel that holds the Sound button. */
const LOCKED = page(
  'Locked opener',
  `<button type="button" id="more" aria-expanded="false" aria-controls="panel" disabled>More</button>
<div id="panel" hidden><button type="button" id="snd" aria-pressed="false">Sound</button></div>`,
  `var more = document.getElementById('more');
more.addEventListener('click', function () {
  more.setAttribute('aria-expanded', 'true');
  document.getElementById('panel').hidden = false;
});
${flip('snd')}`,
);

/** Storage that throws, as a browser that blocks it does, and a toggle that tries to store its state. */
const NO_STORAGE = page(
  'No storage',
  `<button type="button" id="snd" aria-pressed="false">Sound</button>`,
  `Object.defineProperty(window, 'localStorage', {
  configurable: true,
  get: function () {
    throw new Error("Failed to read the 'localStorage' property from 'Window': Access is denied for this document.");
  },
});
var snd = document.getElementById('snd');
snd.addEventListener('click', function () {
  var on = snd.getAttribute('aria-pressed') !== 'true';
  snd.setAttribute('aria-pressed', String(on));
  try {
    localStorage.setItem('designesy:sound', String(on));
  } catch (e) {}
});`,
);

/** A page that never goes network-idle: a request it starts is never answered. */
const BUSY = page(
  'Busy',
  `<button type="button" id="snd" aria-pressed="false">Mute</button>`,
  `fetch('/poll').catch(function () {});
${flip('snd')}`,
);

/** A page whose load event comes 9 s after it starts: an image takes that long. */
const SLOW = page(
  'Slow',
  `<img src="/slow.png" alt="" width="1" height="1">
<button type="button" id="snd" aria-pressed="false">Mute</button>`,
  flip('snd'),
);

/** A page that watches its storage: each read of localStorage flips its Sound toggle, so a read shows in the toggle's state. */
const WATCHED = page(
  'Watched storage',
  `<button type="button" id="snd" aria-pressed="false">Sound</button>`,
  `var store = window.localStorage;
var snd = document.getElementById('snd');
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  get: function () {
    snd.setAttribute('aria-pressed', snd.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    return store;
  },
});
${flip('snd')}`,
);

/** A More button whose aria-controls names the hidden sound button itself, which its click shows; the button's name is 80 characters. */
const SELF_NAMED = page(
  'Self-named',
  `<button type="button" id="more" aria-expanded="false" aria-controls="snd">More</button>
<button type="button" id="snd" aria-pressed="false" aria-label="Sound for this editor: key clicks, toggles, alerts and the timer, all on or off." hidden><svg aria-hidden="true" focusable="false" width="16" height="16"></svg></button>`,
  `var more = document.getElementById('more');
more.addEventListener('click', function () {
  var open = more.getAttribute('aria-expanded') !== 'true';
  more.setAttribute('aria-expanded', String(open));
  document.getElementById('snd').hidden = !open;
});
${flip('snd')}`,
);

/** A toggle with both aria-pressed and aria-checked, whose click moves aria-pressed only; its name is 81 characters. */
const BOTH = page(
  'Both states',
  `<button type="button" id="snd" aria-pressed="false" aria-checked="true" aria-label="Mute the interface cues of this page: press, hover, toggle, confirm, error tones."><svg aria-hidden="true" focusable="false" width="16" height="16"></svg></button>`,
  flip('snd'),
);

/** A settings panel that shows the stored preference, sound on, only once it first opens. */
const LAZY = page(
  'Lazy panel',
  `<button type="button" id="more" aria-expanded="false" aria-controls="panel">Settings</button>
<div id="panel" hidden><button type="button" id="snd" aria-pressed="false">Sound</button></div>`,
  `var more = document.getElementById('more');
var snd = document.getElementById('snd');
var synced = false;
more.addEventListener('click', function () {
  var open = more.getAttribute('aria-expanded') !== 'true';
  more.setAttribute('aria-expanded', String(open));
  document.getElementById('panel').hidden = !open;
  if (open && !synced) {
    synced = true;
    snd.setAttribute('aria-pressed', 'true');
  }
});
${flip('snd')}`,
);

/** A toggle that turns on, goes back off 300 ms later, and writes designesy:sound 1000 ms after the click. */
const LATE_ROLLBACK = page(
  'Late rollback',
  `<button type="button" id="snd" aria-pressed="false">Sound</button>`,
  `var snd = document.getElementById('snd');
snd.addEventListener('click', function () {
  snd.setAttribute('aria-pressed', 'true');
  setTimeout(function () {
    snd.setAttribute('aria-pressed', 'false');
  }, 300);
  setTimeout(function () {
    try {
      localStorage.setItem('designesy:sound', 'true');
    } catch (e) {}
  }, 1000);
});`,
);

/** A Sound switch (role="switch", aria-checked) whose state moves 1050 ms after the click. */
const SLOW_SWITCH = page(
  'Slow switch',
  `<button type="button" role="switch" id="snd" aria-checked="false">Sound</button>`,
  `document.getElementById('snd').addEventListener('click', function () {
  setTimeout(function () {
    var snd = document.getElementById('snd');
    snd.setAttribute('aria-checked', snd.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
  }, 1050);
});`,
);

/** LATE_ROLLBACK's toggle as a switch: aria-checked on at once, off again 300 ms later, and designesy:sound written 1000 ms after the click. */
const SWITCH_ROLLBACK = page(
  'Switch rollback',
  `<button type="button" role="switch" id="snd" aria-checked="false">Sound</button>`,
  `var snd = document.getElementById('snd');
snd.addEventListener('click', function () {
  snd.setAttribute('aria-checked', 'true');
  setTimeout(function () {
    snd.setAttribute('aria-checked', 'false');
  }, 300);
  setTimeout(function () {
    try {
      localStorage.setItem('designesy:sound', 'true');
    } catch (e) {}
  }, 1000);
});`,
);

/** A More button whose aria-controls names the hint beside the hidden Sound button, which holds neither the button nor an element above it; its click would show both. */
const NEIGHBOUR = page(
  'Neighbour',
  `<button type="button" id="more" aria-expanded="false" aria-controls="snd-hint">More</button>
<p id="snd-hint" hidden>Soft cues on press and toggle.</p>
<button type="button" id="snd" aria-pressed="false" hidden>Sound</button>`,
  `var more = document.getElementById('more');
more.addEventListener('click', function () {
  var open = more.getAttribute('aria-expanded') !== 'true';
  more.setAttribute('aria-expanded', String(open));
  document.getElementById('snd-hint').hidden = !open;
  document.getElementById('snd').hidden = !open;
});
${flip('snd')}`,
);

/** Every address a case uses, and what it answers (case 1's page is filled in once the menu is rendered). */
const SITE = {
  'https://www.designesy.org/': { html: '' },
  'https://apg.example/button/': { html: MUTE_LINK },
  'https://toolbar.example/': { html: TOOLBAR },
  'https://plain.example/': { html: PLAIN },
  'https://broken.example/': { html: BROKEN },
  'https://settings.example/': { html: SETTINGS },
  'https://two.example/': { html: TWO },
  'https://stuck.example/': { html: STUCK },
  'https://disabled.example/': { html: DISABLED },
  'https://offline.example/': { offline: true },
  'https://late.example/': { html: LATE },
  'https://dead.example/': { html: DEAD },
  'https://www.designesy.org/no-state': { html: NO_STATE },
  'https://www.designesy.org/slow-store': { html: SLOW_STORE },
  'https://open-menu.example/': { html: OPEN_MENU },
  'https://two-panels.example/': { html: TWO_PANELS },
  'https://labelled.example/': { html: LABELLED },
  'https://rollback.example/': { html: ROLLBACK },
  'https://www.designesy.org/store-rollback': { html: STORE_ROLLBACK },
  'https://pressed-menu.example/': { html: PRESSED_OPENER },
  'https://locked.example/': { html: LOCKED },
  'https://www.designesy.org/no-storage': { html: NO_STORAGE },
  // For v04's page only: `idle` is when the page goes network-idle, `load`
  // when its load event fires (both 0 unless given); a `wait` entry is a
  // request the page makes, which Chrome answers after that long (Infinity:
  // never) and the stand-in reads through those two times.
  'https://busy.example/': { html: BUSY, idle: Infinity },
  'https://busy.example/poll': { wait: Infinity },
  'https://slow.example/': { html: SLOW, load: 9000 },
  'https://slow.example/slow.png': { wait: 9000 },
  'https://watched.example/': { html: WATCHED },
  'https://self-named.example/': { html: SELF_NAMED },
  'https://both.example/': { html: BOTH },
  'https://lazy.example/': { html: LAZY },
  'https://www.designesy.org/late-rollback': { html: LATE_ROLLBACK },
  'https://slow-switch.example/': { html: SLOW_SWITCH },
  'https://www.designesy.org/switch-rollback': { html: SWITCH_ROLLBACK },
  'https://neighbour.example/': { html: NEIGHBOUR },
};

const NONE = 'no sound control on the page (buttons and switches with a pressed or checked state:';
const OPTIONAL = 'skipped: scope=universal, sound is optional';
const NO_OPENER = 'is hidden, and no visible element with aria-expanded="false" controls it or an element that holds it, so it was not clicked';

/**
 * The faults a case can give v04's page: the method that fails, and
 * Playwright's message. The others are given where they happen: `context`
 * fails v04's newContext, `page` its newPage and `close` the context's close
 * (in browserFor), and `launch` the route's browser (in main()).
 */
const FAULTS = {
  evaluate: ['evaluateHandle', 'page.evaluateHandle: Execution context was destroyed, most likely because of a navigation'],
  settle: ['waitForFunction', 'page.waitForFunction: Target page, context or browser has been closed'],
  // page.evaluate is how v04 reads the stored preference: a page that goes
  // somewhere else as soon as its storage is read would fail it this way.
  read: ['evaluate', 'page.evaluate: Execution context was destroyed, most likely because of a navigation'],
};

// `clock` is the time v04's page waited on the stand-in's clock (null: v04 opened no page).
const CASES = [
  {
    title: "designesy.org's senses menu: opened, the Sound row clicked",
    url: 'https://www.designesy.org/',
    expect: ['PASS', 'the sound control "Sound" (found by data-sound-toggle): aria-pressed false→true, designesy:sound null→"true"'],
    clock: 500,
  },
  {
    title: 'a role="button" link named Mute, no storage (universal)',
    url: 'https://apg.example/button/',
    expect: ['PASS', 'the sound control "Mute" (found by its name): aria-pressed false→true'],
    clock: 500,
  },
  {
    title: 'the same page under scope=contract: designesy:sound must move',
    url: 'https://apg.example/button/',
    scope: 'contract',
    expect: ['FAIL', 'the sound control "Mute" (found by its name): aria-pressed false→true, but designesy:sound did not change (null)'],
    clock: 2500,
  },
  {
    title: 'only Bold, Italic, Volume, an unnamed toggle and two "Sound cues" radios (universal)',
    url: 'https://toolbar.example/',
    expect: ['SKIP', `${NONE} 4, none named for sound); ${OPTIONAL}`],
    clock: 0,
  },
  {
    title: 'the same page under scope=contract',
    url: 'https://toolbar.example/',
    scope: 'contract',
    expect: ['WARN', `${NONE} 4, none named for sound)`],
    clock: 0,
  },
  {
    title: 'no pressed or checked control (universal)',
    url: 'https://plain.example/',
    expect: ['SKIP', `${NONE} 0, none named for sound); ${OPTIONAL}`],
    clock: 0,
  },
  {
    title: 'the same page under scope=contract',
    url: 'https://plain.example/',
    scope: 'contract',
    expect: ['WARN', `${NONE} 0, none named for sound)`],
    clock: 0,
  },
  {
    title: 'a sound toggle that does not move',
    url: 'https://broken.example/',
    expect: ['FAIL', 'the sound control "Mute the interface sounds on this page, including the hover, press, toggle and…" (found by its name) did not change aria-pressed when clicked (it stayed false)'],
    clock: 2000,
  },
  {
    title: 'an Audio switch two levels inside a closed settings panel, after a Menu button for another panel',
    url: 'https://settings.example/',
    expect: ['PASS', 'the sound control "Audio" (found by its name): aria-checked false→true'],
    clock: 500,
  },
  {
    title: 'Sound buttons that cannot be seen, then a visible Unmute icon',
    url: 'https://two.example/',
    expect: ['PASS', 'the sound control "Unmute" (found by its name): aria-pressed false→true'],
    clock: 500,
  },
  {
    title: 'a hidden Sound button that nothing visible opens',
    url: 'https://stuck.example/',
    expect: ['MANUAL', `the sound control "Sound" (found by its name) ${NO_OPENER}`],
    clock: 0,
  },
  {
    title: 'a disabled Sound button',
    url: 'https://disabled.example/',
    expect: ['MANUAL', 'the sound control "Sound cues off" (found by its name) did not take a click within 3000 ms: elementHandle.click: Timeout 3000ms exceeded.'],
    clock: 3000,
  },
  {
    title: 'a page that does not load',
    url: 'https://offline.example/',
    expect: ['MANUAL', 'the page did not load: page.goto: net::ERR_CONNECTION_REFUSED at https://offline.example/'],
    clock: 0,
  },
  {
    title: 'a sound toggle that moves 1050 ms after the click',
    url: 'https://late.example/',
    expect: ['PASS', 'the sound control "Effects" (found by its name): aria-pressed false→true'],
    clock: 1600,
  },
  {
    title: 'a More button that never shows its panel',
    url: 'https://dead.example/',
    expect: ['MANUAL', 'the sound control "Mute" (found by its name) is hidden, and clicking "More" did not show it: elementHandle.waitForElementState: Timeout 3000ms exceeded.'],
    clock: 3000,
  },
  {
    title: 'a data-sound-toggle button with no state, in a part of the page nothing opens, on designesy.org',
    url: 'https://www.designesy.org/no-state',
    expect: ['FAIL', 'the sound control "Sound" (found by data-sound-toggle) has neither aria-pressed nor aria-checked'],
    clock: 0,
  },
  {
    title: "the browser fails to open v04's page",
    url: 'https://apg.example/button/',
    fault: 'context',
    expect: ['MANUAL', 'the browser could not open a page: browser.newContext: Target page, context or browser has been closed'],
    clock: null,
  },
  {
    title: "the page fails at v04's first page function",
    url: 'https://apg.example/button/',
    fault: 'evaluate',
    expect: ['MANUAL', 'the check stopped: page.evaluateHandle: Execution context was destroyed, most likely because of a navigation'],
    clock: 0,
  },
  {
    title: 'the browser fails to launch: the route answers 502',
    url: 'https://apg.example/button/',
    fault: 'launch',
    expect502: 'Browser audit failed for https://apg.example/button/: browserType.connectOverCDP: connect ECONNREFUSED 127.0.0.1:9',
    clock: null,
  },
  {
    title: 'on designesy.org, designesy:sound written 1000 ms after the flip, over a stored value',
    url: 'https://www.designesy.org/slow-store',
    expect: ['PASS', 'the sound control "Sound" (found by its name): aria-pressed false→true, designesy:sound "false"→"true"'],
    clock: 1500,
  },
  {
    title: 'a hidden Sound button in an open menu whose trigger says aria-expanded="true"',
    url: 'https://open-menu.example/',
    expect: ['MANUAL', `the sound control "Sound" (found by its name) ${NO_OPENER}`],
    clock: 0,
  },
  {
    title: 'a trigger whose aria-controls names two panels on two lines, the Mute button (title "Shortcut: M") in the second',
    url: 'https://two-panels.example/',
    expect: ['PASS', 'the sound control "Mute" (found by its name): aria-pressed false→true'],
    clock: 500,
  },
  {
    title: 'a toggle named "Interface Sound" by an aria-labelledby of two ids on two lines and "Toggle" by aria-label',
    url: 'https://labelled.example/',
    expect: ['PASS', 'the sound control "Interface Sound" (found by its name): aria-pressed false→true'],
    clock: 500,
  },
  {
    title: 'the page fails while v04 waits for the state to move',
    url: 'https://apg.example/button/',
    fault: 'settle',
    expect: ['MANUAL', 'the check stopped: page.waitForFunction: Target page, context or browser has been closed'],
    clock: 0,
  },
  {
    title: 'a sound toggle that turns on and back off 300 ms later',
    url: 'https://rollback.example/',
    expect: ['FAIL', 'the sound control "Sound" (found by its name) changed aria-pressed when clicked, then went back to false'],
    clock: 500,
  },
  {
    title: 'on designesy.org, a toggle that stays on, its designesy:sound put back to "false" 300 ms after it is written',
    url: 'https://www.designesy.org/store-rollback',
    expect: ['FAIL', 'the sound control "Sound" (found by its name): aria-pressed false→true, but designesy:sound changed, then went back to "false"'],
    clock: 500,
  },
  {
    title: 'a pressed Menu button, not named for sound, opens the panel that holds the Sound button',
    url: 'https://pressed-menu.example/',
    expect: ['PASS', 'the sound control "Sound" (found by its name): aria-pressed false→true'],
    clock: 500,
  },
  {
    title: 'the only opener of the hidden Sound button is disabled',
    url: 'https://locked.example/',
    expect: ['MANUAL', 'the sound control "Sound" (found by its name) is hidden, and clicking "More" did not show it: elementHandle.click: Timeout 3000ms exceeded.'],
    clock: 3000,
  },
  {
    title: "case 2's page, v04's context failing as it closes: the route still answers",
    url: 'https://apg.example/button/',
    fault: 'close',
    expect: ['PASS', 'the sound control "Mute" (found by its name): aria-pressed false→true'],
    clock: 500,
  },
  {
    title: 'on designesy.org, storage that throws',
    url: 'https://www.designesy.org/no-storage',
    expect: ['FAIL', 'the sound control "Sound" (found by its name): aria-pressed false→true, but designesy:sound did not change (null)'],
    clock: 2500,
  },
  {
    title: "case 8's page under scope=contract: the state is waited for first",
    url: 'https://broken.example/',
    scope: 'contract',
    expect: ['FAIL', 'the sound control "Mute the interface sounds on this page, including the hover, press, toggle and…" (found by its name) did not change aria-pressed when clicked (it stayed false)'],
    clock: 2000,
  },
  {
    title: 'a page that never goes network-idle: v04 waits 8000 ms, then for its load',
    url: 'https://busy.example/',
    expect: ['PASS', 'the sound control "Mute" (found by its name): aria-pressed false→true'],
    clock: 8500,
  },
  {
    title: 'a page whose load takes 9000 ms: MANUAL after two waits of 8000 ms',
    url: 'https://slow.example/',
    expect: ['MANUAL', 'the page did not load: page.goto: Timeout 8000ms exceeded.'],
    clock: 16000,
  },
  {
    title: 'the browser audit off: no page opened',
    url: 'https://apg.example/button/',
    env: { ENABLE_BROWSER_AUDIT: '0' },
    expect: ['MANUAL', 'this check needs a live browser session, which this deployment does not run, so no result is reported rather than a guessed one'],
    clock: null,
  },
  {
    title: 'a page that watches its storage, each read flipping its toggle (universal): designesy:sound is not read',
    url: 'https://watched.example/',
    expect: ['PASS', 'the sound control "Sound" (found by its name): aria-pressed false→true'],
    clock: 500,
  },
  {
    title: 'the same page under scope=contract: the state is read, then designesy:sound, then the click',
    url: 'https://watched.example/',
    scope: 'contract',
    expect: ['FAIL', 'the sound control "Sound" (found by its name) did not change aria-pressed when clicked (it stayed false)'],
    clock: 2000,
  },
  {
    title: "case 2's page, v04's page.evaluate failing (universal): v04 makes no such call there",
    url: 'https://apg.example/button/',
    fault: 'read',
    expect: ['PASS', 'the sound control "Mute" (found by its name): aria-pressed false→true'],
    clock: 500,
  },
  {
    title: 'a More button whose aria-controls names the hidden sound button itself opens it; the name is 80 characters',
    url: 'https://self-named.example/',
    expect: ['PASS', 'the sound control "Sound for this editor: key clicks, toggles, alerts and the timer, all on or off." (found by its name): aria-pressed false→true'],
    clock: 500,
  },
  {
    title: 'a toggle with both aria-pressed and aria-checked, named in 81 characters: judged on aria-pressed, the name cut',
    url: 'https://both.example/',
    expect: ['PASS', 'the sound control "Mute the interface cues of this page: press, hover, toggle, confirm, error tone…" (found by its name): aria-pressed false→true'],
    clock: 500,
  },
  {
    title: "case 2's page, v04's context failing to open a page in it",
    url: 'https://apg.example/button/',
    fault: 'page',
    expect: ['MANUAL', 'the browser could not open a page: browserContext.newPage: Target page, context or browser has been closed'],
    clock: null,
  },
  {
    title: 'a settings panel that shows the preference, sound on, once it opens: the state is read after it opens',
    url: 'https://lazy.example/',
    expect: ['PASS', 'the sound control "Sound" (found by its name): aria-pressed true→false'],
    clock: 500,
  },
  {
    title: 'on designesy.org, a toggle that goes back at 300 ms, its designesy:sound written at 1000 ms',
    url: 'https://www.designesy.org/late-rollback',
    expect: ['FAIL', 'the sound control "Sound" (found by its name) changed aria-pressed when clicked, then went back to false'],
    clock: 2500,
  },
  {
    title: 'a Sound switch whose aria-checked moves 1050 ms after the click',
    url: 'https://slow-switch.example/',
    expect: ['PASS', 'the sound control "Sound" (found by its name): aria-checked false→true'],
    clock: 1600,
  },
  {
    title: "on designesy.org, case 42's toggle as a switch, its aria-checked going back at 300 ms",
    url: 'https://www.designesy.org/switch-rollback',
    expect: ['FAIL', 'the sound control "Sound" (found by its name) changed aria-checked when clicked, then went back to false'],
    clock: 2500,
  },
  {
    title: 'a More button whose aria-controls names the hint beside the hidden Sound button, not the button or an element that holds it',
    url: 'https://neighbour.example/',
    expect: ['MANUAL', `the sound control "Sound" (found by its name) ${NO_OPENER}`],
    clock: 0,
  },
];

// ── The stand-in browser ─────────────────────────────────────────────────────

class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

const ELEMENT_TYPES = new Set(['tag', 'script', 'style']);
const isElement = (node) => Boolean(node) && ELEMENT_TYPES.has(node.type);
const NOT_RENDERED = new Set(['head', 'script', 'style', 'template', 'title', 'meta']);

function inlineStyle(node) {
  const out = {};
  for (const decl of String(node.attribs.style || '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim().toLowerCase();
  }
  return out;
}

/** Laid out at all: no hidden attribute and no inline display:none on it or above it. */
function rendered(node) {
  for (let n = node; isElement(n); n = n.parent) {
    if (NOT_RENDERED.has(n.name)) return false;
    if (Object.prototype.hasOwnProperty.call(n.attribs, 'hidden')) return false;
    if (inlineStyle(n).display === 'none') return false;
  }
  return true;
}

/** Inline visibility, inherited from the nearest element that sets it. */
function visibilityOf(node) {
  for (let n = node; isElement(n); n = n.parent) {
    const v = inlineStyle(n).visibility;
    if (v) return v;
  }
  return 'visible';
}

/** Its box: 100 by 20 pixels when rendered, 0 on a side whose inline size is 0, and 0 by 0 when not rendered. */
function boxOf(node) {
  if (!rendered(node)) return { width: 0, height: 0 };
  const style = inlineStyle(node);
  const side = (value, size) => (value !== undefined && parseFloat(value) === 0 ? 0 : size);
  return { width: side(style.width, 100), height: side(style.height, 20) };
}

/** Visible as Playwright reads it: a box with no empty side, and visibility not hidden. */
function visible(node) {
  const box = boxOf(node);
  return box.width > 0 && box.height > 0 && visibilityOf(node) !== 'hidden';
}

/** Enabled as Playwright reads it: no disabled form control, no aria-disabled="true" on it or above it. */
function enabled(node) {
  if (['button', 'input', 'select', 'textarea'].includes(node.name) && Object.prototype.hasOwnProperty.call(node.attribs, 'disabled')) return false;
  for (let n = node; isElement(n); n = n.parent) if (n.attribs['aria-disabled'] === 'true') return false;
  return true;
}

function textOf(node) {
  if (node.type === 'text') return node.data;
  if (node.type === 'comment' || node.type === 'directive') return '';
  return (node.children || []).map(textOf).join('');
}

/** One loaded document: the parsed tree, its click listeners and the objects page code sees. */
class StandinDom {
  constructor(html, errors) {
    this.root = parseDocument(html);
    this.errors = errors;
    this.shims = new WeakMap();
    this.listeners = new WeakMap();
    const dom = this;
    this.document = {
      nodeType: 9,
      get documentElement() {
        return dom.wrap(selectOne('html', dom.root));
      },
      get body() {
        return dom.wrap(selectOne('body', dom.root));
      },
      // As in a browser, no element has the empty string for its ID.
      getElementById(id) {
        if (String(id) === '') return null;
        return dom.wrap(selectAll('[id]', dom.root).find((n) => n.attribs.id === String(id)) || null);
      },
      querySelector(selector) {
        return dom.wrap(selectOne(selector, dom.root));
      },
      querySelectorAll(selector) {
        return selectAll(selector, dom.root).map((n) => dom.wrap(n));
      },
      addEventListener(type, fn) {
        dom.listen(dom.root, type, fn);
      },
    };
  }

  wrap(node) {
    if (!node) return null;
    if (node.type === 'root') return this.document;
    let shim = this.shims.get(node);
    if (!shim) {
      shim = isElement(node) ? new StandinElement(this, node) : new StandinNode(node);
      this.shims.set(node, shim);
    }
    return shim;
  }

  listen(node, type, fn) {
    const byType = this.listeners.get(node) || {};
    (byType[type] = byType[type] || []).push(fn);
    this.listeners.set(node, byType);
  }

  /** A click, as the browser sends one: to the target, then each element above it. */
  click(node) {
    const event = {
      type: 'click',
      bubbles: true,
      target: this.wrap(node),
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
    };
    for (let n = node; n; n = n.parent) {
      event.currentTarget = this.wrap(n);
      for (const fn of [...((this.listeners.get(n) || {}).click || [])]) {
        try {
          fn.call(event.currentTarget, event);
        } catch (e) {
          this.errors.push(e);
        }
      }
      if (event.stopped) break;
    }
  }
}

class StandinNode {
  constructor(node) {
    this.node = node;
  }
  get nodeType() {
    return this.node.type === 'text' ? 3 : 8;
  }
  get nodeValue() {
    return this.node.type === 'text' ? this.node.data : null;
  }
  get textContent() {
    return textOf(this.node);
  }
  get childNodes() {
    return [];
  }
}

class StandinElement {
  constructor(dom, node) {
    this.dom = dom;
    this.node = node;
  }
  get nodeType() {
    return 1;
  }
  get tagName() {
    return this.node.name.toUpperCase();
  }
  get id() {
    return this.node.attribs.id || '';
  }
  getAttribute(name) {
    const key = String(name).toLowerCase();
    return Object.prototype.hasOwnProperty.call(this.node.attribs, key) ? this.node.attribs[key] : null;
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.node.attribs, String(name).toLowerCase());
  }
  setAttribute(name, value) {
    this.node.attribs[String(name).toLowerCase()] = String(value);
  }
  removeAttribute(name) {
    delete this.node.attribs[String(name).toLowerCase()];
  }
  get hidden() {
    return this.hasAttribute('hidden');
  }
  set hidden(on) {
    if (on) this.setAttribute('hidden', '');
    else this.removeAttribute('hidden');
  }
  get parentElement() {
    return isElement(this.node.parent) ? this.dom.wrap(this.node.parent) : null;
  }
  get childNodes() {
    return this.node.children.map((c) => this.dom.wrap(c));
  }
  get textContent() {
    return textOf(this.node);
  }
  set textContent(value) {
    const text = new Text(String(value));
    for (const c of this.node.children) c.parent = null;
    text.parent = this.node;
    this.node.children = [text];
  }
  addEventListener(type, fn) {
    this.dom.listen(this.node, type, fn);
  }
  querySelectorAll(selector) {
    return selectAll(selector, this.node.children).map((n) => this.dom.wrap(n));
  }
  querySelector(selector) {
    return this.dom.wrap(selectOne(selector, this.node.children));
  }
  matches(selector) {
    return matchesSelector(this.node, selector);
  }
  getBoundingClientRect() {
    const { width, height } = boxOf(this.node);
    return { x: 0, y: 0, top: 0, left: 0, width, height, right: width, bottom: height };
  }
  // v02 reads these on <html>: the stand-in page never overflows.
  get scrollWidth() {
    return 1280;
  }
  get clientWidth() {
    return 1280;
  }
}

class StandinStorage {
  constructor(map) {
    this.map = map;
  }
  getItem(key) {
    return this.map.has(String(key)) ? this.map.get(String(key)) : null;
  }
  setItem(key, value) {
    this.map.set(String(key), String(value));
  }
  removeItem(key) {
    this.map.delete(String(key));
  }
}

/** Copy a value out of a page, as Playwright serialises it. */
function copyOut(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof StandinElement || value instanceof StandinNode) return {};
  if (Array.isArray(value)) return value.map(copyOut);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copyOut(v)]));
}

/** Hand a value to a page function: a handle becomes its node. */
function copyIn(value) {
  if (value instanceof StandinHandle) return value.value;
  if (Array.isArray(value)) return value.map(copyIn);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copyIn(v)]));
  }
  return value;
}

class StandinPage {
  constructor(context) {
    this.context = context;
    this.errors = context.errors;
    this.now = 0;
    this.timers = [];
    this.nextTimer = 1;
    this.dom = null;
    this.vm = null;
    // Set on v04's page: only there does a fixture's idle or load time apply.
    this.v04 = false;
  }

  /**
   * Load a fixture, as Playwright's goto does: the document's scripts run at
   * once, then it waits on the clock for the event it was asked for (load,
   * or network-idle), failing with Playwright's timeout message when that
   * comes later than the timeout.
   */
  async goto(url, { waitUntil = 'load', timeout = 30000 } = {}) {
    const fixture = SITE[url];
    if (!fixture || !fixture.html) throw new Error(`page.goto: net::${fixture ? 'ERR_CONNECTION_REFUSED' : 'ERR_NAME_NOT_RESOLVED'} at ${url}`);
    this.load(url, fixture);
    const load = (this.v04 && fixture.load) || 0;
    const idle = this.v04 ? Math.max(load, fixture.idle || 0) : 0;
    const need = waitUntil === 'networkidle' ? idle : waitUntil === 'load' ? load : 0;
    if (need > timeout) {
      this.advance(timeout);
      throw new TimeoutError(`page.goto: Timeout ${timeout}ms exceeded.\nCall log:\n  - navigating to "${url}", waiting until "${waitUntil}"`);
    }
    this.advance(need);
    return { status: () => 200 };
  }

  load(url, fixture) {
    this.timers = [];
    const origin = new URL(url).origin;
    if (!this.context.storage.has(origin)) this.context.storage.set(origin, new Map());
    this.dom = new StandinDom(fixture.html, this.errors);
    const sandbox = {
      document: this.dom.document,
      localStorage: new StandinStorage(this.context.storage.get(origin)),
      getComputedStyle: (el) => ({ visibility: visibilityOf(el.node), display: rendered(el.node) ? 'block' : 'none' }),
      setTimeout: (fn, ms = 0) => {
        const id = this.nextTimer++;
        this.timers.push({ id, due: this.now + Math.max(0, Number(ms) || 0), fn });
        return id;
      },
      clearTimeout: (id) => {
        this.timers = this.timers.filter((t) => t.id !== id);
      },
      // A request a page starts is never answered here; a fixture's idle or
      // load time says what it holds up.
      fetch: () => new Promise(() => {}),
      console: { log() {}, warn() {}, error() {} },
    };
    this.vm = vm.createContext(sandbox);
    vm.runInContext('var window = globalThis, self = globalThis;', this.vm);
    for (const script of selectAll('script', this.dom.root)) {
      try {
        vm.runInContext(textOf(script), this.vm, { filename: url });
      } catch (e) {
        this.errors.push(e);
      }
    }
  }

  /** Move the clock on by `ms`, running each timer that comes due. */
  advance(ms) {
    const end = this.now + ms;
    for (;;) {
      const due = this.timers.filter((t) => t.due <= end).sort((a, b) => a.due - b.due)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.now = due.due;
      try {
        due.fn();
      } catch (e) {
        this.errors.push(e);
      }
    }
    this.now = end;
  }

  run(method, fn, arg) {
    let compiled;
    try {
      compiled = vm.runInContext(`(${fn.toString()})`, this.vm);
    } catch (e) {
      throw new Error(`${method}: SyntaxError: ${e.message}`);
    }
    try {
      return compiled(copyIn(arg));
    } catch (e) {
      throw new Error(`${method}: ${e && e.name}: ${e && e.message}`);
    }
  }

  async evaluate(fn, arg) {
    return copyOut(this.run('page.evaluate', fn, arg));
  }

  async evaluateHandle(fn, arg) {
    return handleFor(this, this.run('page.evaluateHandle', fn, arg));
  }

  /** Playwright's defaults: 30 s, and polling on animation frames, every 16 ms here. */
  async waitForFunction(fn, arg, { timeout = 30000, polling = 'raf' } = {}) {
    const step = typeof polling === 'number' ? polling : 16;
    for (let waited = 0; ; waited += step) {
      const value = this.run('page.waitForFunction', fn, arg);
      if (value) return handleFor(this, value);
      if (waited >= timeout) throw new TimeoutError(`page.waitForFunction: Timeout ${timeout}ms exceeded.`);
      this.advance(step);
    }
  }

  /** A real wait ends after the quick calls sent while it runs, so it yields to them before the clock moves. */
  async waitForTimeout(ms) {
    await new Promise((resolve) => setImmediate(resolve));
    this.advance(ms);
  }

  /** page.$ for the CSS selectors main's v04 used, and :has-text() as a case-insensitive substring. */
  async $(selector) {
    const m = /^(.*):has-text\("(.*)"\)$/.exec(selector);
    const css = m ? m[1] : selector;
    const found = selectAll(css, this.dom.root).find((n) => !m || textOf(n).replace(/\s+/g, ' ').toLowerCase().includes(m[2].toLowerCase()));
    return found ? handleFor(this, this.dom.wrap(found)) : null;
  }

  /** Wait on the clock, as Playwright's actions do, until `ready` holds or the timeout ends. */
  wait(method, timeout, ready, why) {
    for (let waited = 0; ; waited += 100) {
      if (ready()) return;
      if (waited >= timeout) throw new TimeoutError(`${method}: Timeout ${timeout}ms exceeded.\nCall log:\n  - ${why()}`);
      this.advance(100);
    }
  }

  async close() {}
}

class StandinHandle {
  constructor(page, value) {
    this.page = page;
    this.value = value;
  }
  async getProperty(name) {
    return handleFor(this.page, this.value == null ? undefined : this.value[name]);
  }
  asElement() {
    return null;
  }
  async jsonValue() {
    return copyOut(this.value);
  }
  async dispose() {}
}

class StandinElementHandle extends StandinHandle {
  asElement() {
    return this;
  }
  async getAttribute(name) {
    return this.value.getAttribute(name);
  }
  async isVisible() {
    return visible(this.value.node);
  }
  async click({ timeout = 30000 } = {}) {
    const node = this.value.node;
    this.page.wait('elementHandle.click', timeout, () => visible(node) && enabled(node), () => `element is not ${visible(node) ? 'enabled' : 'visible'}`);
    this.page.dom.click(node);
  }
  /** 'visible' waits on the clock, as a click does; 'attached' holds at once, as every element a page function returns is in the document. */
  async waitForElementState(state, { timeout = 30000 } = {}) {
    assert.ok(state === 'visible' || state === 'attached', `the stand-in waits for 'visible' or 'attached' only, not ${state}`);
    if (state === 'attached') return;
    const node = this.value.node;
    this.page.wait('elementHandle.waitForElementState', timeout, () => visible(node), () => 'element is not visible');
  }
}

const handleFor = (page, value) => (value instanceof StandinElement ? new StandinElementHandle(page, value) : new StandinHandle(page, value));

class StandinBrowser {
  async newContext() {
    const storage = new Map();
    const errors = [];
    const context = {
      storage,
      errors,
      async newPage() {
        return new StandinPage(context);
      },
      async close() {},
    };
    return context;
  }
  async close() {}
}

// ── The browser the route gets ───────────────────────────────────────────────

/**
 * Answer every request of a real browser context from the fixtures. A `wait`
 * entry is answered after that long, or never, in v04's context only, so
 * v02's pages load at once.
 */
async function serveFixtures(context, v04) {
  await context.route('**/*', (route) => {
    const fixture = SITE[route.request().url()];
    if (!fixture) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not a fixture' });
    if (fixture.offline) return route.abort('connectionrefused');
    if (fixture.wait !== undefined) {
      if (!v04) return route.fulfill({ status: 204 });
      if (fixture.wait === Infinity) return undefined;
      setTimeout(() => route.fulfill({ status: 204 }).catch(() => {}), fixture.wait);
      return undefined;
    }
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture.html });
  });
}

/**
 * What the route's connectOverCDP returns for one request: the gate's browser,
 * with the case's fault, if any, on v04's context, the one 1280 pixels wide
 * (v02's are narrower). It records the size v04 asked for, and whether v04
 * closed the context it opened. Closing it leaves the gate's browser open.
 */
function browserFor(base, real, c, record) {
  return {
    async newContext(options) {
      const v04 = Boolean(options && options.viewport && options.viewport.width === 1280);
      if (v04) record.v04Viewport = { ...options.viewport };
      if (v04 && c.fault === 'context') throw new Error('browser.newContext: Target page, context or browser has been closed');
      const context = await base.newContext(options);
      if (v04) record.v04Opened = true;
      if (real) await serveFixtures(context, v04);
      return {
        async newPage() {
          if (v04 && c.fault === 'page') throw new Error('browserContext.newPage: Target page, context or browser has been closed');
          const p = await context.newPage();
          if (real) p.on('pageerror', (e) => record.errors.push(e));
          else record.contexts.push(context);
          if (v04) {
            record.v04Page = p;
            if (!real) p.v04 = true;
          }
          const fault = v04 && FAULTS[c.fault];
          if (!fault) return p;
          const [method, message] = fault;
          return new Proxy(p, {
            get(target, key) {
              if (key === method) {
                return async () => {
                  throw new Error(message);
                };
              }
              const v = Reflect.get(target, key, target);
              return typeof v === 'function' ? v.bind(target) : v;
            },
          });
        },
        async close() {
          if (v04) record.v04Closed = true;
          await context.close();
          if (v04 && c.fault === 'close') throw new Error('browserContext.close: Target page, context or browser has been closed');
        },
      };
    },
    async close() {},
  };
}

// ── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  const real = Boolean(CHANNEL || CHROMIUM);
  let base = new StandinBrowser();
  let browser = 'the stand-in';
  if (real) {
    // The gate's own playwright-core drives the browser, whichever apps/site
    // --app loads: the route does not load it here, as the harness answers it.
    const driver = path.dirname(require.resolve('playwright-core', { paths: [HERE, APP] }));
    const { chromium } = require(driver);
    base = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM, headless: true } : { channel: CHANNEL, headless: true });
    browser = `real (${CHROMIUM || `channel ${CHANNEL}`} ${base.version()}, playwright-core ${require(path.join(driver, 'package.json')).version})`;
  }
  console.log(`v04 sound control: ${path.relative(process.cwd(), path.join(APP, ROUTE)) || ROUTE}, browser: ${browser}`);

  let current = null;
  const connect = async () => {
    if (current.case.fault === 'launch') throw new Error('browserType.connectOverCDP: connect ECONNREFUSED 127.0.0.1:9');
    return browserFor(base, real, current.case, current);
  };
  const h = createHarness({
    app: APP,
    lookup: async () => [{ address: PUBLIC_V4, family: 4 }],
    stubs: {
      'playwright-core': { chromium: { connectOverCDP: connect, launch: connect } },
      '@sparticuz/chromium': { args: [], executablePath: async () => 'stand-in', setGraphicsMode: false },
      // The senses menu's sound hook imports cuelume; rendering on the server
      // calls none of it, and its toggle cue's length is read at load.
      cuelume: { play() {}, setEnabled() {} },
      'cuelume/themes': { THEMES: { default: { toggle: { layers: [] } } } },
    },
    overrides: {
      'app/lib/browser-guard.ts': (guard) => ({
        ...guard,
        guardBrowser: async (browser, _isAllowed, close) => ({
          newContext: (options = {}) => browser.newContext({ ...options, serviceWorkers: 'block' }),
          close,
        }),
      }),
    },
  });

  // Case 1's page carries the senses menu as the site renders it.
  const React = require(require.resolve('react', { paths: [APP, HERE] }));
  const { renderToStaticMarkup } = require(require.resolve('react-dom/server', { paths: [APP, HERE] }));
  const { SensesMenu } = h.load('app/lib/senses-menu.tsx');
  SITE['https://www.designesy.org/'].html = sensesPage(renderToStaticMarkup(React.createElement(SensesMenu)));

  // Every v04 answer carries the check registry's own item and category for
  // v04, and that item is the contract's wording, word for word.
  const V04_DEF = h.load('app/lib/check-definitions.ts').CHECKS.find((x) => x.id === 'v04');
  const { verification } = h.load('app/lib/design-system-contract.ts').designSystemContract;
  assert.ok(verification.includes(V04_DEF.item), `v04's registry item is not the contract's wording: ${V04_DEF.item}`);

  // A promise the route leaves to reject with no handler fails the case it
  // happens in: a step it sent off and did not wait for.
  const unhandled = [];
  process.on('unhandledRejection', (reason) => unhandled.push(reason));

  const failures = [];
  try {
    for (const [i, c] of CASES.entries()) {
      const n = i + 1;
      current = { case: c, errors: [], contexts: [] };
      unhandled.length = 0;
      const body = c.scope ? { url: c.url, scope: c.scope } : { url: c.url };
      const saved = {};
      for (const [k, v] of Object.entries(c.env || {})) {
        saved[k] = process.env[k];
        process.env[k] = v;
      }
      const t0 = Date.now();
      let line;
      try {
        let res;
        try {
          res = await h.post(ROUTE, body, { 'x-forwarded-for': `198.51.100.${n}` });
        } finally {
          for (const [k, v] of Object.entries(saved)) process.env[k] = v;
        }
        await new Promise((resolve) => setImmediate(resolve));
        const ms = Date.now() - t0;
        if (c.expect502) {
          assert.equal(res.status, 502, `status ${res.status}, body ${JSON.stringify(res.body)}`);
          assert.deepEqual(res.body, { ok: false, error: c.expect502 });
          line = `502 ${res.body.error}`;
        } else {
          assert.equal(res.status, 200, `status ${res.status}, body ${JSON.stringify(res.body)}`);
          const v04 = (res.body.checks || []).find((x) => x.id === 'v04');
          assert.ok(v04, `no v04 in ${JSON.stringify(res.body)}`);
          assert.deepEqual([v04.status, v04.detail], c.expect, `v04 is ${v04.status}: ${v04.detail}`);
          assert.deepEqual([v04.item, v04.category], [V04_DEF.item, V04_DEF.category], `v04's item and category are ${JSON.stringify([v04.item, v04.category])}`);
          line = `v04 ${v04.status}: ${v04.detail}`;
        }
        const pageErrors = [...current.errors, ...current.contexts.flatMap((x) => x.errors)];
        assert.equal(pageErrors.length, 0, `the fixture's script threw: ${pageErrors.map((e) => (e && e.message) || e).join('; ')}`);
        assert.equal(unhandled.length, 0, `a promise was left to reject with no handler: ${unhandled.map((e) => String((e && e.message) || e).split('\n')[0]).join('; ')}`);
        if (current.v04Viewport) assert.deepEqual(current.v04Viewport, { width: 1280, height: 800 }, `v04 asked for a page of ${current.v04Viewport.width} by ${current.v04Viewport.height}`);
        if (current.v04Opened) assert.ok(current.v04Closed, 'v04 did not close the context it opened');
        let clock = '';
        if (!real) {
          const waited = current.v04Page ? current.v04Page.now : null;
          const said = (t) => (t === null ? 'no page' : `${t} ms`);
          assert.equal(waited, c.clock, `v04's page clock is ${said(waited)}, not ${said(c.clock)}`);
          clock = `, page clock ${said(waited)}`;
        }
        console.log(`  ok    ${String(n).padStart(2)}  ${c.title} (${ms} ms${clock})\n          ${line}`);
      } catch (err) {
        failures.push(n);
        console.log(`  FAIL  ${String(n).padStart(2)}  ${c.title}\n          ${String((err && err.message) || err).split('\n').join('\n          ')}`);
        if (c.expect) console.log(`          expected v04 ${c.expect[0]}: ${c.expect[1]}`);
      }
    }
  } finally {
    if (real) await base.close();
  }

  console.log('');
  if (failures.length) {
    console.log(`v04 sound control: ${failures.length} of ${CASES.length} cases failed: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log(`v04 sound control: all ${CASES.length} cases passed`);
}

await main();
