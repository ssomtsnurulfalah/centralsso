import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = new URL('../frontend-next/', import.meta.url);
const names = ['package.json', 'package-lock.json', 'next.config.mjs', 'next-env.d.ts', 'postcss.config.mjs', 'tsconfig.json', 'vercel.json'];
async function walk(prefix) {
  for (const entry of await readdir(new URL(prefix, root), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Symlink in release');
    const name = prefix + entry.name;
    if (entry.isDirectory()) await walk(name + '/');
    else if (entry.isFile()) names.push(name);
  }
}
await walk('src/');
const files = [];
for (const file of names.sort()) {
  if (/\.env|\.pem$|\.key$|fixture|preload/i.test(file)) throw new Error('Private/test file in release');
  files.push({ file, data: await readFile(fileURLToPath(new URL(file, root)), 'utf8'), encoding: 'utf-8' });
}
const sha256 = createHash('sha256').update(JSON.stringify(files)).digest('hex');
console.log(JSON.stringify({ sha256, files }));
