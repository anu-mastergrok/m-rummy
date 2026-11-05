# Player presence

Functional coverage for Game Board user states (11:75402) using the existing UI.
Exact Figma styling remains pending design access.

## Semantics

Presence is advisory and does not pause deadlines, drop a player, settle a round,
or increment a game version. Clients piggyback updates on authorized `/api/tables`
polls using `client` (32 hex characters), `visible` (0 or 1) and `sequence` (an
increasing integer). Older/duplicate sequences are ignored. Clients without these
optional fields remain compatible.

Each document gets a fresh client ID. The server retains at most eight recently
seen documents per session and combines all unexpired sessions for a player:

- `online`: any visible client seen within 15 seconds.
- `away`: a client seen within 45 seconds, with no recent visible client.
- `offline`: no recent client and no legacy session with unreported presence.
- `unknown`: a valid older client/session has never reported presence.
- `bot`: a practice bot, independent of browser heartbeats.

A hidden document does not override another visible tab/device. Presence describes
connection/activity for the account across joined tables; it does not claim focus
on this particular table. Background throttling/network loss can move a player
through away to offline. These are status hints, not proof of disconnection.

Only the status enum is added to players in authorized room snapshots. Heartbeat
IDs, sequences, timestamps, session credentials and other-table memberships are
not published. No new schema migration or endpoint is required.

## Milestones

1. Bounded server heartbeats, multi-device aggregation and deterministic PHP tests.
2. Client visibility reporting and seat/own-hand status badges that update without
   replacing cards or losing chat focus on every heartbeat.
3. HTTP privacy/version compatibility and browser reconnect/background regression.

## Validation progress

The server milestone passed six deterministic presence tests and all existing
PHP/HTTP/browser/release checks:
https://github.com/mastergrok-technologies/m-rummy/actions/runs/42031394157

Client updates add labelled badges to opponent seats and the own-hand header.
Presence-only snapshots update those nodes while preserving card DOM, selections,
chat input and cursor. Losing the local connection shows “Reconnecting” for self
and “Status unknown” for other humans until an authoritative resync. Bot badges
remain explicit. Visibility changes report hidden/foreground state through the
existing poll; refresh creates a distinct document ID.

New browser coverage checks presence transitions at an unchanged game version,
DOM/focus retention, heartbeat identity/order, visibility changes, reload and
network loss/recovery. HTTP checks verify status enums, private metadata omission,
malformed update rejection, unchanged game versions and multi-device aggregation.
