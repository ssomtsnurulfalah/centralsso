import { writeFile } from 'node:fs/promises';
import { secret } from '../frontend-next/src/lib/server/password.mjs';
try {
  if(!process.argv[2])throw new Error();
  await writeFile(process.argv[2],JSON.stringify({SSO_GATEWAY_KEY_ID:'gateway_v1',SSO_GATEWAY_SECRET:secret(),SSO_RATE_LIMIT_SECRET:secret()},null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log('Konfigurasi rahasia dibuat pada file privat. Jangan commit atau unggah file ini.');
}catch{console.error('Gagal membuat konfigurasi; gunakan path output baru.');process.exitCode=1;}
