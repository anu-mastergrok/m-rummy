# Table standings — page 8

Source: the same local `m-rummy.fig`, Leaderboard frame **11:65148**, Winner Layout
component **11:62149**. Reuses its #d8d9d9 surface, #27245d heading and #414141
footer. Original seat avatars use the existing `seatAvatar` component; the modal
close control reuses the original 40px info-close asset. No duplicate assets or
temporary Figma URLs are introduced.

The semantic table shows shared place, player, settled round penalty and total
penalty. `tableStandings` remains the ranking source: lower cumulative penalties
rank higher, with equal totals sharing a place. You/bot/dropped/round-winner labels
are explicit. The round winner is separate from cumulative rank. All text stays
escaped, and current player IDs keep the original seat-to-avatar mapping even
when ranking order changes.

While playing, round penalties are unsettled and opponent cards aren't rendered.
After server settlement, the existing public result hands are inspectable in a
collapsible section. It remains expanded across unrelated snapshots and is
removed on rematch. Live total/round changes refresh without losing close-button
focus. Table switching remains scoped to the selected room. Back to table closes
only this panel; no command, payout, rematch or automatic exit is triggered.

This is a responsive source-based adaptation. Cash balance/won-lost columns and
the source's sample three-second auto-close are omitted. The footer shows actual
round state and a public wild-rank label, rather than a sample face. There is no
global leaderboard API. Fonts use the existing system fallback, and extra rows
or revealed cards scroll within the native modal on shorter viewports.

## Validation

Local JS syntax, four helper tests and all source asset hashes pass. Six browser
regressions cover four viewports, six seats/ties/long escaped names, public-only
live standings, original image decoding and geometry, total/winner distinction,
revealed-hand retention/rematch clearing, focus-safe updates and table isolation.
Full CI/build results and screenshots are recorded in the pull request.
