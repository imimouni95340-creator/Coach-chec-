// Copies the Stockfish WebAssembly engine out of node_modules into public/,
// so Vite serves it as a static asset and the service worker can precache it
// for offline play. Run automatically before `dev` and `build`.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const from = join(root, 'node_modules', 'stockfish.js');
const to = join(root, 'public', 'engine');

// stockfish.wasm.js is the loader/worker; stockfish.wasm is the engine itself.
// The package also ships stockfish.js, a 1.6 MB asm.js fallback, which we
// deliberately do NOT copy: stockfish.wasm.js never references it (its only
// mention is a URL in a comment), and every browser able to run this app
// supports WebAssembly. Skipping it more than halves the offline install.
const files = ['stockfish.wasm.js', 'stockfish.wasm'];

mkdirSync(to, { recursive: true });
for (const file of files) {
  copyFileSync(join(from, file), join(to, file));
}
console.log(`[copy-engine] ${files.length} engine files -> public/engine/`);
