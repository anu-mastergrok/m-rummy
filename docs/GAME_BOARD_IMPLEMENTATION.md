# Game board implementation tracking

Source: M-Rummy_Dev_Implementation_Brief.md (5 November 2026), Figma file
TdUDKIqWOlKTXIEnFEW05x, Game Board page 11:60547.

## Audit and scope

The existing stack is dependency-free JavaScript/HTML/CSS with a PHP polling API.
Reuse its card renderer, server game engine, profile points, native dialogs and
responsive styles. Figma context and screenshot requests still return the Starter
plan call limit. Exact visual tokens/assets/layout cannot be verified; this work
implements the brief's supported interactions using existing components.

| Design nodes | Current implementation | Decision / acceptance |
| --- | --- | --- |
| 11:74043, 11:73650 | public/index.html loading; app.js boot/landing/renderRoom | Reuse entry and private waiting room; no public matchmaking service exists |
| 11:73776, 11:73864 | server/game.php rummy_start/rummy_public; app.js renderRoom/updateClock | Reuse immediate server deal and deadline; no invented countdown |
| Cards / actions | app.js card/groupView/action; server/bootstrap.php version guard | Extend pending/connection guard and robust local grouping; preserve unique card IDs |
| 11:74045, 11:75234 | app.js toast/poll | Extend durable connection status, resync before commands after network uncertainty |
| 11:75402, 11:65466 | server/game.php drop/declaration; app.js action | Dropped state exists; add declaration rejection dialog with retry guidance; no presence API |
| 11:74211 | app.js hand/result renderers | Add own-hand inspection; only show opponents' revealed result hands |
| 11:82833, 11:82996 | app.js chat form/sidebar | Reuse table-scoped chat inside native dialog; preserve draft across polls and failures |
| 11:83159 | existing responsive UI and reduced-motion CSS | Add real local display preferences only; exact Figma controls remain unknown |
| 11:65148 | public players' total penalty scores | Add table standings, lower penalties first; no global leaderboard endpoint |
| 11:65307 | room snapshot + existing rules dialog | Add table information from current snapshot |
| 11:65625 | No matching action or financial service | Deferred: ambiguous bet/declaration intent; no cash behavior introduced |
| 11:78780–11:80108 | bootstrap.php rummy_current, create/join guards | Deferred: engine explicitly permits one table per account; requires API/session/rules design |
| 11:84354–11:84853 | rules dialog | Add six-step tutorial using current engine rules and static examples |

## Engine contracts

- Private 13-card Indian rummy, 2–6 players; bots between rounds only.
- One table per account; version-checked commands, no automatic command replay.
- Polling every 1.2 seconds; serverTime/deadline supplied by rummy_public.
- 60-second human turns; bot deadlines differ. Recalculate using server clock offset.
- Declaration validates immediately and settles result; invalid declaration preserves
  the hand/turn. No 30-second opponent response phase exists.
- No away heartbeat, financial stakes, wallet, entry fee, pool mode or global rankings.
- Opponents' hands remain private until results. No backend rule changes in this work.

## Milestones

1. Audit and code/node mapping (this document).
2. Connection recovery, command pending guards, deadline behavior, local card state.
3. Shared game dialogs: chat, preferences, hand inspection, standings, information,
   and declaration rejection feedback.
4. Six-step tutorial, keyboard/responsive checks and regression coverage.

Each milestone is committed and pushed to feat/m-rummy-game-board-figma.
Reference-size visual acceptance and unsupported engine features remain explicitly
pending; this branch must not be described as a pixel-perfect Figma implementation.

### Milestone 2 validation

Added round-scoped local grouping with malformed/duplicate/stale card filtering,
server-offset deadline helpers, persistent reconnect/resync status, immediate
pending guards, and no automatic replay after an uncertain request. Returning
from background or a network change requires a fresh snapshot before commands.
Node syntax and three focused presentation tests pass. PHP is not installed in
the editing environment; the repository workflow supplies PHP for full regression.

### Milestone 3 validation

Added native table panels for own cards, revealed result hands, table penalty
standings (including ties), live table facts, local display preferences and chat.
Chat drafts survive polling/failures; all text is escaped. A rejected declaration
shows review/auto-group guidance without replaying the move. Native dialog labels,
Escape handling and focus restoration are included. Added seven deterministic
Chromium tests for privacy, pending guards, reconnect, chat, keyboard and four
viewport sizes; CI installs the pinned browser test dependency and runs them.
Local syntax/helper tests pass. Local Chromium cannot launch because this execution
environment disallows its socket; browser and PHP regression results are checked
through GitHub Actions.

### Milestone 4 validation

Added a reusable six-step tutorial covering welcome, pure/impure sequences, sets,
penalties and declaration rules. Static examples do not inherit live wild-card
markings. Back/next/finish/revisit and optional completion storage are supported.
CI's new keyboard checks exposed a dialog Tab-wrap escape; explicit Tab/Shift+Tab
wrapping now complements native modal behavior. Added tutorial and round/stale
snapshot regressions. Local JavaScript syntax and helper tests pass; final complete
workflow results are recorded below after the pushed milestone is checked.

## Verified delivery

[GitHub Actions run 42027142648](https://github.com/mastergrok-technologies/m-rummy/actions/runs/42027142648)
validated implementation commit a4b0c6b4361fe9d0db6eb39660a8c62cb0b04699:

- `npm run check`: JavaScript/PHP syntax and deployment shell checks pass.
- `npm test`: all presentation helper, existing PHP rules/account/deployment and
  HTTP multiplayer/reconnect regression checks pass.
- `npm run test:ui`: 9/9 Chromium tests pass, including 390×844, 768×1024,
  1024×768 and 1920×1080; keyboard modal containment, privacy, chat escaping,
  pending action guards, reconnect draft retention, tutorial navigation and
  round/stale-snapshot handling are covered.
- Hostinger upload ZIP and verified SSH release are both built successfully.
- Local and pushed source trees were compared and match.

This completes supported functional milestones. Exact Figma styling/assets,
reference-image comparison, multi-table play, a declaration response phase,
server presence, and the ambiguous bet modal are not implemented. They remain
blocked by missing design evidence or explicit engine capability gaps listed
above. No production merge or deployment is included in this branch delivery.
