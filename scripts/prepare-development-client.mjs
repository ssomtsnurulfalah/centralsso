import { writeFile } from 'node:fs/promises';
import { secret } from '../frontend-next/src/lib/server/password.mjs';
try {
  if(!process.argv[2])throw new Error();
  const input={application_name:'Aplikasi Uji Autentikasi',application_url:'https://uji.example.sch.id',key_id:'test_'+secret().slice(0,16),secret:secret()};
  await writeFile(process.argv[2],JSON.stringify(input,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Konfigurasi client development dibuat. Bukan aplikasi eksternal.');
}catch{console.error('Gagal membuat file; pilih path output baru.');process.exitCode=1;}
