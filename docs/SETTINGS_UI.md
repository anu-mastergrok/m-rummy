# Settings — page 6

Source: the same local `m-rummy.fig`, Setting Modal **11:83159**, Info Layout
**11:82783**. Uses its #083827 green surface, #f2f5f2 outline/text, #d4f0e6 icon
circles and original 40px Info/Music/Cards artwork. The source back icon exactly
matches the existing 36px chat-back asset. Nodes/hashes/adaptations are recorded
in the design manifest.

Info opens existing room/rule information. Last Deal opens only the public
`history[0]` round/winner/penalty summaries from the server; no opponent cards are
exposed. It is unavailable before a completed round and updates when the first
result arrives, without rebuilding focused preference controls. Both subpanels
provide Back to settings. Music is marked unavailable because the application
has no audio playback; no decorative toggle claims otherwise.

The existing Spread out hand cards and Reduce motion preferences remain native
keyboard-accessible checkboxes, styled as switches. They apply immediately,
including offline, and persist on the browser. A polite status distinguishes
saved settings from visit-only changes if browser storage fails. Source ON/OFF
examples are not used as real game state. Styling is scoped to Settings/Last Deal;
chat, information and declaration panels retain their own layouts.

Responsive adaptation: the compact source menu expands to readable descriptions
and the existing display controls; platform fonts replace unbundled SF Pro/Inter.
The Last Deal score panel composes the existing score table. No backend API,
server timer, turn, scoring or audio behavior changes.

## Validation

Local JS syntax, four helper tests and source asset hashes/dimensions pass.
Browser additions cover four viewports, decoded original icons, scroll bounds,
persistence across reload, live Last Deal availability, escaped historical text,
no hidden-hand exposure, offline preferences/reduced motion, failed storage and
panel style isolation. Existing keyboard containment and reconnect/chat/game
regressions remain enabled. Screenshots and full CI/build results are recorded
in the pull request after review.
