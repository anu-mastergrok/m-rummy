# Table chat — page 5

Uses the same local `m-rummy.fig`, Message modal **11:82833** and Message Input
**11:82996**, with Side Message Menu components **11:82755** / **11:82765**.
The source #0e0d22 background, near-white outline, translucent suggestion surfaces,
original 36px back and 40px emoji/send vectors are bundled locally. Icon instance
geometry and local paint-style references were resolved before export. The asset
manifest records source nodes, hashes, colors and adaptations.

The existing native game dialog is styled as a responsive side drawer. Table
history remains private to the selected room and renders escaped player text.
Quick replies insert editable text; emoji choices replace the selected input
range or insert at its caret. Neither sends automatically. The 240-character
HTML input limit also applies to inserted suggestions; the counter follows the
current draft. Empty messages cannot be submitted. Original game actions and
card selections remain behind the native modal.

Reuse: existing `renderGamePanel`, `sendChat`, table-scoped drafts, pending and
connection guards, native Escape/focus containment, and server chat API. Drafts
stay synchronized with the sidebar. Failed sends restore the draft and re-enable
Send; text typed while a send is pending is retained. Incoming messages preserve
composer selection, emoji mode, focus and an older-history scroll position.
Newly opened history starts at the latest messages. Other game panels reset the
chat-specific style and keep their existing layouts.

Responsive adaptations: the real message stream is added above the source menu;
six sample strings become ordinary editable reply suggestions. The source emoji
keyboard image is a visual mockup, so eight labeled native emoji buttons provide
the interaction; rendering varies by platform. SF Pro Display isn't bundled.
This is a source-based adaptation, not a pixel-perfect reconstruction or a full
system emoji keyboard. No backend/game-rule changes are required.

## Validation

Local JS syntax, four existing helper tests, all manifest hashes and source SVG
sizes pass. Browser additions cover four supported viewport sizes, icon decoding
and geometry, escaped/long messages, quick replies, emoji insertion and selection,
length limits, incoming-message scroll/caret retention, pending/rejected sends,
no accidental sends, retained card selection, and style reset on other panels.
Existing reconnect/multi-table and keyboard-dialog regressions remain enabled.
CI screenshots cover the populated reply and emoji views. Full checks, release
builds and visual review are recorded in the pull request after CI.
