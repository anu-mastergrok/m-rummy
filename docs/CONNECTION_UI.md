# Connection and player-state UI — page 4

Uses the same local `m-rummy.fig`: Internet Lost frame **11:75234** and Different
States of User frame **11:75402**. Source nodes, colors and asset hashes are
recorded in `docs/design/m-rummy-local-source.json`.

The reconnect notice uses the original 86px wifi-cancel artwork, resolved 56px
loading component, pale #f2f5f2 surface, orange #d64326 warning title and blue
#00236a progress copy. It appears above the board in normal document flow;
players can still inspect/group their hand and keep chat drafts while commands
are disabled by the existing recovery guard. Both automatic retry and Reconnect
now fetch an authoritative table snapshot. Pending checks disable retry, and
repeated clicks cannot send concurrent polls or replay a move. Successful resync
hides the notice. The existing server deadline continues to run.

Away, not-responding and unknown labels get distinct readable surfaces in both
waiting and active seats. Only existing presence badges/seat attributes change
on heartbeat updates; cards, selected groups and chat inputs are retained.
Rejected declarations use the source user-feedback palette in the existing
native dialog. The rejection copy and validation remain server supplied/escaped;
no extra penalty or declaration-response phase is introduced. Settings/chat
panels clear the declaration-specific class when opened.

This is a responsive source-based adaptation, not a pixel-perfect reconstruction:
the notice doesn't obscure live cards, text explains actual recovery semantics,
the source typo “Wronge Declare!” is corrected by the existing descriptive dialog,
and presence is advisory rather than an automatic forfeit. Existing native-dialog
keyboard behavior is reused. Reduced-motion preferences disable the spinner.

## Validation

Local JavaScript syntax and the four presentation helper tests pass. New browser
coverage checks mobile/desktop notice and asset dimensions, disabled commands,
selection/draft retention, guarded retry/resync with no replay, presence-only DOM
retention, and declaration/settings style isolation. Screenshots are emitted by
the existing UI suite. Full PHP/API/browser checks, release builds and visual
review are recorded in the pull request after CI.
