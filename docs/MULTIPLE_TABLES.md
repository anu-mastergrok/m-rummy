# Multiple tables implementation

Extends the functional scope of Game Board section 11:78780 using the existing
private, free-play engine. This is not a claim of exact Figma visual fidelity.

## Contract

- An account may occupy at most three tables, including waiting/finished tables.
  The limit is enforced under the existing exclusive storage lock.
- Existing `/api/room` and command contracts remain compatible. Session responses
  add `rooms` and `tableLimit`; the original `room` field remains a fallback.
- `GET /api/tables?code=CODE` advances all of the caller's joined tables and returns
  public per-table metadata plus an authorized private snapshot for the selected
  table only. Unknown/unjoined selected tables return `active: null`; other players'
  membership, hands, passwords and session data are never included in summaries.
- Each table keeps its existing independent version, hand, round, deadline, chat and
  reward settlement. Polling never replays a command or changes the selected table.
- A table's deadline continues while inactive. As before, server timeouts advance
  on a connected player's request, not a background PHP process.
- Leaving remains allowed only between rounds. A dropped player still occupies
  their seat until that round ends. No financial behavior or rule changes.

## Milestones

1. API membership/cap, aggregate authorized polling, privacy/isolation/timeout tests,
   Apache route and local module-serving fix.
2. Client table switcher, add/create/join flow, table-local UI state and recovery.
3. Browser/integration regression, responsive/keyboard verification and release checks.

## Progress

The backend milestone passed the full workflow, including four new PHP multi-table
tests, HTTP route/module checks and the existing nine browser regressions:
https://github.com/mastergrok-technologies/m-rummy/actions/runs/42029660673

The client now renders a scrollable table rail with waiting, playing, own-turn,
watching and finished statuses. Card groups/selections and chat drafts are scoped
to table/round. Switching retrieves a new authorized snapshot and is blocked while
a command is pending. Adding a table uses a modal create/join form; leaving or
expiration opens a table picker instead of silently choosing another active game.
The selected table is recovered from the URL/browser hint when still joined.

Client milestone workflow passed all 14 browser regressions plus the full PHP/HTTP
suite and both release builds:
https://github.com/mastergrok-technologies/m-rummy/actions/runs/42030198062

The final regression milestone adds HTTP restart coverage for all memberships and
an intentionally delayed aggregate poll. A client request epoch discards poll
results started before a command/navigation/authentication change, so late metadata
cannot undo newer turn badges or table membership. The previous same-table version
check continues to protect hand snapshots. No production deployment is triggered
by these feature-branch pushes.
