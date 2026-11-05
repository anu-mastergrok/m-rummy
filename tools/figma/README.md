# Inspect the local Figma export

The uploaded `m-rummy.fig` is a ZIP with `canvas.fig` (Kiwi schema/message),
`meta.json`, a thumbnail and 83 embedded image files. The schema ships inside the
export; do not guess a schema or parse the binary with text searches.

Install inspection dependencies separately from the application:

```sh
npm install --prefix tools/figma --package-lock=false
node tools/figma/extract.cjs /path/to/m-rummy.fig /tmp/rummy-decoded.json
```

Python 3 and Node are required. The decoder reads only `canvas.fig` from the
archive, handles raw deflate and Zstandard, and preserves binary path/image
references in JSON as base64. This does not call Figma or change the input file.
The .fig file and decoded document should stay outside this repository.

`docs/design/m-rummy-local-source.json` records source SHA-256, frame properties,
source nodes for shipped assets, and the remaining game-screen inventory. Use
node `guid` and `parentIndex` to reconstruct hierarchy. `symbolData` references
component roots; `overrideKey`, `symbolOverrides` and `derivedSymbolData` govern
instance overrides. Resolve those before using any new component.

The game screens are 1080 × 1920 frames rotated −90°, with content counter-rotated
inside them. Their effective canvas bounds are landscape 1920 × 1080. Compose
matrices; do not copy local x/y values directly into production CSS. `Game_table`
is hidden in the matchmaking frame; its visible table is an embedded image fill.

Images are stored under `images/<hex hash>` in the ZIP. Vector command blobs use
one command byte (0 close, 1 move, 2 line, 3 quadratic, 4 cubic), followed by
little-endian float32 coordinates. Honor visibility, paint opacity, gradient
transforms, masks and clip bounds. The runtime uses original image bytes and
SVG exports of source vector shapes, never a flattened screen as its UI.

Text uses SF Pro Display in this frame. No font binaries are included. The UI
uses the platform/system fallback stack and keeps live player text selectable.
Local third-party renderers can mishandle this file's nested transforms and
instance exports; validate every exported asset and compare the rendered UI.
