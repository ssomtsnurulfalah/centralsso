// Input JSON lewat stdin; jangan menaruh password pada argumen shell.
import { writeFile } from 'node:fs/promises';
import { hashPassword } from '../frontend-next/src/lib/server/password.mjs';
try {
  const destination=process.argv[2];
  if(!destination)throw new Error('Output diperlukan.');
  let raw='';
  for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw new Error('Input terlalu besar.');}
  const input=JSON.parse(raw);
  if(Object.keys(input).sort().join(',')!=='email,full_name,password,username'||typeof input.username!=='string'||!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(input.username)||typeof input.full_name!=='string'||!input.full_name.trim()||typeof input.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))throw new Error('Input tidak valid.');
  const material=await hashPassword(input.password);
  await writeFile(destination,JSON.stringify({username:input.username,full_name:input.full_name,email:input.email,...material},null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log('Metadata bootstrap dibuat. Tidak ada password plaintext pada output.');
}catch{console.error('Bootstrap gagal. Periksa input, kebijakan password, dan file output yang harus belum ada.');process.exitCode=1;}
