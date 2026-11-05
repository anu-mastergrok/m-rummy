# Game information — page 7

Source: the same local `m-rummy.fig`, Game Info frame **11:65307**, Modal component
**11:62103**. Uses the #d8d9d9 surface, dark green labels, original gradient title
plate **11:62143** and original 40px close artwork **11:62148**. Title artwork
scales proportionally as a decorative background. Nodes/hashes/adaptations are
recorded in the design manifest.

The three-column source facts become a responsive semantic definition list,
with two columns on narrow displays. Current room code, phase, players, privacy
and round come from the selected table snapshot. The remaining facts describe
the existing PHP engine: private 13-card Indian rummy, 2 decks with 1 printed
joker each, 60-second human turns, first/middle drops of 20/40, an 80-point round
penalty cap, and no extra time. Stakes remain free play. Declaration guidance and
advisory-presence/timer explanations compose the existing information content.

The source's pool-rummy, prize, 101-point, 30-second, extra-time and 2-jokers-per-
deck sample values are not application rules. No matching backend behavior is
introduced. Fonts use the current system fallback; value contrast is darkened
for readability. The existing native modal retains Escape, keyboard containment,
live refresh and Back to settings navigation. Other panel styles remain scoped.

## Validation

Local JS syntax, four helper tests and all source asset hashes pass. Six browser
regressions cover four viewports, supported rules, original artwork loading and
40px icon geometry, no cards or draw controls, keyboard containment, live facts
without focus loss, Settings return navigation, and table-scoped waiting/privacy
state. Full CI/build outcomes and screenshot review are recorded in the PR.
