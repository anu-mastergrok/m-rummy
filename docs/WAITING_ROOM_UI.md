# Waiting room UI milestone

The private-table lobby now has a dedicated responsive layout using the existing
product typography, green felt, native dialogs and command handlers. All six
seats appear, including self, host/friend/bot labels, advisory presence and empty
seat invitation buttons. A side panel exposes the room code and invite flow,
with password guidance, plus table-scoped chat.

Host deal controls require at least two players. Bot controls respect the six-seat
limit and share the existing pending/reconnection guards. Guests see host-waiting
copy. There is no public matchmaking queue, invented timer, auto-deal or new ready
state. Lobby-only styles stop applying when the server begins the round. Existing
live-play markup is preserved apart from extracting shared room chrome.

Figma target: TdUDKIqWOlKTXIEnFEW05x / 11:73650. The design-context request hit
the Starter-plan call limit on 5 November 2026. This milestone improves the
existing UI; exact Figma artwork, tokens and geometry remain unverified and are
not claimed as implemented. No substitute Figma artwork was introduced.

Validation: JavaScript syntax and four presentation helper tests pass locally.
The environment lacks PHP and blocks local Chromium sockets. GitHub Actions runs
full PHP/API and browser regression checks. Added waiting-room browser coverage
for solo-host deal guard, invite, pending add/remove bot, deal transition, guest
permissions, host transfer, escaped names, retained chat, reconnect and full-table
layout at 1920, 1024, 768 and 390px. CI publishes screenshots for visual review.

## Local-file design pass

The existing uploaded `m-rummy.fig` was decoded successfully (21,730 nodes,
83 embedded images). This removes the connector quota dependency for offline
inspection. Source SHA, nodes, properties and asset hashes are recorded in
`design/m-rummy-local-source.json`; `tools/figma` provides a reusable decoder.

The waiting room now uses the source #17162e background, #27245d panels,
original 1920 × 1080 table image, source avatar artwork, arrow and loading mark,
and the #5fffc7 → #109e56 green fill. The avatar, table and control layouts adapt
to supported viewports rather than copying the file's nested rotated coordinates.
The existing private-room controls and chat remain available. The source's
sample 02:45 timer is omitted; the bar represents actual occupied seats (out of
six) and does not imply a required six players or an automatic deal. The sixth
seat reuses a source default portrait because the reference shows five opponents.

This is a source-based responsive adaptation, not a pixel-perfect reconstruction:
SF Pro Display is not bundled, mobile layout is adapted, the source timer and
sample scores are not live capabilities, and the existing app navigation and
private-table controls remain. All shipped images are local. Asset decoding and
seat-bar semantics are covered by the browser suite.
