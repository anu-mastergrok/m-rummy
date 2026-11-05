# Active game board UI — page 3

Source: the same uploaded `m-rummy.fig`, frame **11:73864** (Cards Deal).
Source hashes, node mapping and adaptations are in
[the asset manifest](design/m-rummy-local-source.json).

The active round now continues the waiting room's purple surfaces, original
wood/felt table image and original seat avatars. Opponents show their live total
penalties, public card counts, advisory presence and a textual current-turn badge.
The hand shows the local player's portrait/penalty total, clearer group controls,
selected-card outline, and source-colored green Declare/red Discard controls.
Their original vector icons resolve component-instance geometry and paint data.
Bots retain an explicit practice marker. Player text remains escaped.

Reuse: `renderRoom`, `card`, existing grouping/selection, native dialogs, table
switcher, presence badges, `remainingSeconds` and all existing command guards.
`seatAvatar` is shared with the waiting room so the same occupied seat keeps its
artwork when the host deals. The server remains authoritative for permissions,
turns, deadlines, card privacy and penalties. No API, game rules or deployment
configuration changes are required.

This is a responsive source-based adaptation. Existing dynamically rendered card
faces and patterned deck remain; the source sample cards/Stars deck and cash
summary are not used. The source font is not bundled. The offline reference
renderer cannot accurately compose the file's rotated nested card components,
so this milestone does not claim pixel-perfect reference parity. The game deals
immediately, so no match-start countdown or fake dealing delay is introduced.

## Verification

JavaScript syntax and four existing presentation helper tests pass locally.
Added four browser regressions for six-player boards at 390×844, 768×1024,
1024×768 and 1920×1080. They decode every visible image, check source icon
geometry, public penalties, hidden opponent cards, no page overflow, seat/action
bounds, live turn changes and a complete draw/select/discard flow. Screenshots
are published with the existing CI artifact. Existing waiting-room, pending,
reconnect, multi-table, chat, tutorial and game rule checks remain in the suite.

PHP is absent locally and Chromium cannot launch because socket creation is
restricted. Full validation and screenshot review must therefore run in GitHub
Actions after the branch is pushed; these are pending until a successful run is
recorded here.

Next UI pages: connection/user-state overlays, then chat/settings/information
panels and tutorial styling. A server match countdown and declaration-response
phase remain outside current engine capabilities.
