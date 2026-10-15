import { mkdir, readdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const source = fileURLToPath(new URL('../backend-gas/', import.meta.url));
try {
  if (!process.argv[2]) throw new Error();
  const modules = (await readdir(path.join(source, 'src'))).filter(f => /^\d{2}_[A-Za-z]+\.gs$/.test(f)).sort();
  if (modules.length !== 15) throw new Error();
  const output = path.resolve(process.argv[2]);
  await mkdir(output); // Fail if target exists; never overwrite a linked GAS directory.
  await copyFile(path.join(source, 'appsscript.json'), path.join(output, 'appsscript.json'));
  for (const file of modules) await copyFile(path.join(source, 'src', file), path.join(output, file));
  console.log(JSON.stringify({ success: true, module_count: modules.length, deployment_performed: false }));
} catch {
  console.error('Gagal menyiapkan GAS: gunakan direktori output baru; periksa 15 modul sumber.');
  process.exitCode = 1;
}
