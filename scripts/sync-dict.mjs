// Copies kuromoji's gzipped dictionary into public/dict so WXT publishes it at /dict/.
import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules/@sglkc/kuromoji/dict');
const to = join(root, 'public/dict');

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true, force: true });

const files = await readdir(to);
console.log(`[sync-dict] ${files.length} files in public/dict`);
