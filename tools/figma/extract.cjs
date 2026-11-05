// Inspect a local .fig export without Figma API access. This is a development
// tool only; the PHP/browser application has no dependency on these packages.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const zlib = require('node:zlib');
const kiwi = require('kiwi-schema');
const fzstd = require('fzstd');
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node tools/figma/extract.cjs source.fig decoded.json');
const bytes = execFileSync('python3', ['-c', 'import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read("canvas.fig"))', input], { maxBuffer: 64 * 1024 * 1024 });
if (bytes.subarray(0, 8).toString() !== 'fig-kiwi') throw new Error('Unsupported Figma archive header');
const chunks = [];
for (let offset = 12; offset < bytes.length;) {
  if (offset + 4 > bytes.length) throw new Error('Truncated chunk header');
  const size = bytes.readUInt32LE(offset); offset += 4;
  if (offset + size > bytes.length) throw new Error('Truncated chunk');
  chunks.push(bytes.subarray(offset, offset + size)); offset += size;
}
if (chunks.length < 2) throw new Error('Missing Figma schema/message');
const inflate = chunk => chunk.readUInt32LE(0) === 0xfd2fb528 ? fzstd.decompress(chunk) : zlib.inflateRawSync(chunk);
const codec = kiwi.compileSchema(kiwi.decodeBinarySchema(inflate(chunks[0])));
const message = codec.decodeMessage(inflate(chunks[1]));
fs.writeFileSync(output, JSON.stringify(message, (_, value) => value instanceof Uint8Array ? { __bytes: Buffer.from(value).toString('base64') } : value));
console.log(`Decoded ${message.nodeChanges.length} nodes into ${output}`);
