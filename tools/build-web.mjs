import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const entries = [
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js-pack',
  'vendor',
  'glb-pack',
  'image-pack',
  'music-pack',
];

for (const entry of entries) {
  await cp(path.join(root, entry), path.join(out, entry), { recursive: true });
}

await rm(path.join(out, 'image-pack', 'uploads'), { recursive: true, force: true });
await rm(path.join(out, 'image-pack', 'android-icons'), { recursive: true, force: true });

const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(path.join(out, 'version.json'), JSON.stringify({ version }) + '\n');

console.log('Web build ready in www/');
