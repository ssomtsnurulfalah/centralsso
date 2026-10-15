# Central SSO V3.1

Panduan setup dan penggunaan aplikasi pengelolaan identitas terpusat berbasis Google Spreadsheet, Google Apps Script (GAS), Next.js dan Vercel.

Source aplikasi: **0.9.0** · Protokol API: **v1** · Skema database: **v1**.

> Dokumen ini dapat dijadikan README pada root repositori. Seluruh perintah dijalankan dari root source `central-sso`, kecuali dinyatakan lain. Nilai seperti `ID_SPREADSHEET_ANDA`, `ID_DEPLOYMENT_ANDA` dan domain contoh harus diganti. Tidak ada password atau secret operasional dalam dokumen ini.

## Daftar isi

1. [Tentang aplikasi](#tentang-aplikasi)
2. [Fitur dan hak akses](#fitur-dan-hak-akses)
3. [Persyaratan dan struktur proyek](#persyaratan-dan-struktur-proyek)
4. [Setup Google Spreadsheet dan GAS](#setup-google-spreadsheet-dan-gas)
5. [Membuat Super Admin pertama](#membuat-super-admin-pertama)
6. [Deploy backend GAS](#deploy-backend-gas)
7. [GitHub dan frontend Vercel](#github-dan-frontend-vercel)
8. [Pengembangan lokal](#pengembangan-lokal)
9. [Panduan penggunaan](#panduan-penggunaan)
10. [API dan integrasi](#api-dan-integrasi)
11. [Pengujian dan penerimaan](#pengujian-dan-penerimaan)
12. [Pemeliharaan dan keamanan](#pemeliharaan-dan-keamanan)
13. [Penanganan masalah](#penanganan-masalah)
14. [Dokumentasi dan referensi](#dokumentasi-dan-referensi)

## Tentang aplikasi

Central SSO menjadi pusat identitas pengguna, verifikasi password, status akun, registrasi aplikasi dan credential API. Administrator mengelola data melalui panel Next.js. Server Next.js berkomunikasi dengan GAS menggunakan request bertanda tangan HMAC; GAS mengakses database identitas pada Google Spreadsheet.

| Komponen | Tanggung jawab |
| --- | --- |
| Next.js App Router dan TypeScript | Antarmuka admin, API server, hashing/verifikasi password dan validasi respons |
| Google Apps Script V8 | Aturan identitas, sesi, akses, registry, log dan operasi database |
| Google Spreadsheet | Penyimpanan identitas, metadata, log dan state keamanan |
| Vercel | Hosting frontend serta API server Next.js |

Password di-hash menggunakan scrypt pada server Node. Shared secret tidak ditempatkan pada browser. Tidak ada akun default atau login demo. Proyek ini tidak menggunakan Supabase sebagai database identitas.

Central SSO tidak menyediakan aplikasi bisnis eksternal, role bisnis aplikasi lain, sesi aplikasi klien, OAuth/OIDC, MFA atau email reset otomatis. Empat API publik menjadi dasar integrasi server aplikasi lain pada masa depan.

**Status bukti paket Tahap 10:** 303 tes dan 31 skenario HTTPS lokal lulus; TypeScript/build lulus. Pengujian HTTPS tersebut memakai layanan Google/Spreadsheet test double. Deployment GAS/Spreadsheet asli, login/API live, browser, quota dan operasional belum diterima pada audit tersebut. Lihat `docs/FINAL_ACCEPTANCE_STAGE10.json` untuk status historis penyerahan; pengelola perlu memperbarui bukti setelah setup nyata selesai.

## Fitur dan hak akses

Fitur mencakup login/logout administrator, dashboard, manajemen pengguna, profil/password, reset sekali pakai, registrasi aplikasi, credential API, direktori pengguna, pemeriksaan status, Authentication Logs, Audit Logs dan pengaturan tampilan.

| Kemampuan | Super Admin | Admin | User |
| --- | --- | --- | --- |
| Login ke panel admin | Ya | Ya | Tidak |
| Mengelola akun dengan role user | Ya | Ya | Tidak |
| Mengelola Admin/Super Admin | Ya, dengan sesi segar | Tidak | Tidak |
| Mengubah profil/password sendiri melalui panel | Ya | Ya | Tidak |
| Menerbitkan token reset | Ya, dengan sesi segar | Tidak | Tidak |
| Mengelola aplikasi dan credential API | Ya | Tidak | Tidak |
| Membaca log dan pengaturan | Ya | Tidak | Tidak |
| Mengubah pengaturan tampilan | Ya, dengan sesi segar | Tidak | Tidak |

Sesi segar berarti dibuat maksimal 5 menit sebelumnya. Untuk memperbaruinya, keluar lalu login kembali. Batas sesi default adalah 8 jam absolut dan 30 menit tidak aktif. Credential, reset dan operasi sensitif lain diperiksa kembali di server/GAS. Super Admin aktif terakhir dilindungi dari perubahan yang menghilangkan seluruh pengelola aktif.

## Persyaratan dan struktur proyek

Siapkan akun Google yang dapat mengelola Spreadsheet dan Apps Script, akun GitHub, akun Vercel, Node.js **24+**, npm dan browser modern. OpenSSL diperlukan untuk runner HTTPS lokal. Contoh perintah terminal memakai Bash pada Linux/macOS atau Git Bash; sesuaikan izin file pada sistem operasi Anda.

| Path | Isi |
| --- | --- |
| `frontend-next/` | Source Next.js, konfigurasi, lockfile dan tes frontend |
| `backend-gas/src/` | 15 modul GAS |
| `backend-gas/appsscript.json` | Manifest GAS |
| `scripts/` | Generator konfigurasi/bootstrap dan runner pengujian |
| `tests/` | Tes backend, protokol, keamanan dan integrasi |
| `docs/` | Panduan, kontrak API, audit dan bukti pengujian |
| `package.json` | Perintah pengujian utama |
| `.gitignore` | Pengecualian cache, konfigurasi privat dan secret |

Folder `gas-release/` yang ada di luar `central-sso/` pada ZIP final adalah salinan 15 modul dan manifest untuk dipasang ke GAS. Gunakan satu bentuk source GAS saja; jangan memasang modul bersamaan dengan file gabungan `CentralSsoStage8.gs.txt` karena akan mendefinisikan fungsi dua kali.

## Setup Google Spreadsheet dan GAS

### 1. Buat database dan proyek GAS

1. Buat Spreadsheet baru untuk database identitas. Batasi akses edit kepada pengelola yang berwenang.
2. Ambil ID Spreadsheet dari URL: bagian di antara `/d/` dan `/edit`.
3. Buka [Google Apps Script](https://script.google.com/) dan buat proyek backend. Akun yang akan menjalankan backend harus memiliki akses ke Spreadsheet tersebut.
4. Pasang 15 modul dari `backend-gas/src/` atau `gas-release/`. Buat file script dengan nama modul masing-masing; editor dapat menambahkan ekstensi `.gs` otomatis.
5. Pada **Project Settings**, aktifkan tampilan manifest `appsscript.json`, lalu gunakan isi manifest paket. Hapus file contoh bila mendefinisikan fungsi yang bentrok.

Direktori GAS bersih juga dapat disiapkan melalui:

```bash
node scripts/prepare-gas-release.mjs release-output
```

Target `release-output` harus belum ada. Perintah ini menyiapkan file lokal; pemasangan/deployment ke akun Google masih perlu dilakukan.

### 2. Buat atau gunakan secret environment

Jika belum mempunyai secret untuk environment tersebut:

```bash
mkdir -p deployment-private
chmod 700 deployment-private
node scripts/prepare-server-secrets.mjs deployment-private/server-secrets.json
```

File output berisi `SSO_GATEWAY_KEY_ID`, `SSO_GATEWAY_SECRET` dan `SSO_RATE_LIMIT_SECRET`. Kedua secret adalah nilai acak berbeda, masing-masing 64 karakter hex lowercase. Generator tidak menimpa file lama. Pada Windows, batasi akses folder/file melalui pengaturan izin yang sesuai.

Jika secret telah dipasang dan digunakan, gunakan kembali nilainya untuk koneksi yang sama. Rotasi harus dikoordinasikan antara GAS dan frontend. Jangan menyalin secret ke README, GitHub, URL, screenshot umum atau log.

### 3. Isi Script Properties

Pada **Apps Script → Project Settings → Script Properties**, tambahkan:

| Property | Cara mengisi |
| --- | --- |
| `SSO_SPREADSHEET_ID` | ID Spreadsheet database, bukan URL lengkap |
| `SSO_ENVIRONMENT` | Isi sendiri: `development`, `staging` atau `production` |
| `SSO_GATEWAY_KEY_ID` | Key ID dari konfigurasi privat; nilai awal generator `gateway_v1` |
| `SSO_GATEWAY_SECRET` | Gateway secret dari konfigurasi privat |
| `SSO_RATE_LIMIT_SECRET` | Rate-limit secret yang berbeda dari gateway secret |

Mulai dengan **`staging`** untuk pengujian. Nilai `SSO_ENVIRONMENT` bukan token yang diterbitkan Google; ini label lingkungan yang Anda tentukan. Simpan properti tanpa tanda kutip/spasi tambahan. Gunakan Spreadsheet, proyek GAS, secret dan akun bootstrap terpisah untuk staging dan produksi.

### 4. Inisialisasi database

Pilih fungsi **`initializeDatabase`** pada editor GAS, lalu klik **Run**. Tinjau dan berikan izin Google pada akun pengelola. Periksa 12 sheet berikut:

`Users`, `Applications`, `ApplicationCredentials`, `AuthenticationLogs`, `AuditLogs`, `PasswordResetTokens`, `AuthenticationRateLimits`, `Settings`, `AdminSessions`, `ReplayNonces`, `AuthenticationChallenges` dan `OperationJournal`.

Initializer bersifat idempotent. Jangan menghapus sheet, header, identitas atau data lama untuk mengatasi error setup. Jika database sudah digunakan, lakukan backup dan diagnosis terlebih dahulu.

## Membuat Super Admin pertama

Bootstrap hanya berlaku saat **Users masih kosong**. Password awal default mengikuti policy 15–128 karakter. Jangan memasukkan password plaintext langsung ke kolom Spreadsheet.

1. Pada mesin tepercaya, buat file JSON privat `deployment-private/bootstrap-input.json` dengan empat field berikut. Ganti seluruh nilai contoh, termasuk password, sebelum menjalankan generator:

```json
{
  "username": "admin.utama",
  "full_name": "Nama Administrator",
  "email": "admin@example.org",
  "password": "GANTI_DENGAN_PASSWORD_PRIBADI_YANG_KUAT"
}
```

2. Batasi izin file dan hitung metadata KDF. Password dibaca dari stdin, bukan argumen perintah:

```bash
chmod 600 deployment-private/bootstrap-input.json
node scripts/prepare-bootstrap.mjs deployment-private/bootstrap-user.json < deployment-private/bootstrap-input.json
```

Output harus berupa file baru. File `bootstrap-user.json` memuat username, nama, email serta hash/salt/parameter scrypt; tidak memuat password plaintext. Output ini tetap sensitif.

3. Di Script Properties GAS, buat **`SSO_BOOTSTRAP_USER_JSON`**. Salin seluruh isi JSON dari `bootstrap-user.json` sebagai nilainya.
4. Jalankan fungsi **`bootstrapInitialSuperAdmin`** dari editor GAS. Akun dibuat dengan role `super_admin` dan status `active`.
5. Periksa akun tersedia dan property bootstrap terhapus setelah berhasil. Simpan password pada pengelola password, kemudian hapus file input plaintext sementara sesuai kebijakan penyimpanan organisasi. Lindungi atau hapus juga metadata bootstrap yang tidak diperlukan lagi.

Jangan commit kedua file bootstrap. Jangan menjalankan bootstrap ulang untuk database berisi pengguna. Jika seluruh Super Admin kehilangan akses, gunakan prosedur pemulihan yang ditinjau pengelola sistem, bukan mengosongkan Users.

## Deploy backend GAS

1. Pilih **Deploy → New deployment → Web app**.
2. Atur **Execute as: Me**, menggunakan akun pemilik/pengelola yang memiliki akses Spreadsheet.
3. Atur **Who has access: Anyone**, bila kebijakan Google/Workspace mengizinkan, agar server Vercel dapat menghubungi endpoint tanpa sesi Google.
4. Deploy, selesaikan otorisasi yang diminta, lalu salin **Web app URL** berakhiran `/exec`:

```text
https://script.google.com/macros/s/ID_DEPLOYMENT_ANDA/exec
```

Request aplikasi tetap memerlukan signature HMAC yang sah. Jika kebijakan akun melarang akses yang diperlukan, selesaikan kebijakan/arsitektur akses terlebih dahulu. Jangan memakai `/dev` atau cookie login Google sebagai pengganti konfigurasi transport.

Ketika URL GAS dibuka langsung di browser, respons penolakan seperti **“Gunakan API server yang diizinkan”** memang diharapkan karena GET tidak menyediakan operasi aplikasi. Respons itu belum membuktikan request bertanda tangan dapat berhasil.

Setelah mengubah kode GAS, buka **Deploy → Manage deployments → Edit → New version → Deploy** agar URL `/exec` menggunakan versi terbaru. Catat deployment ID, versi dan pemilik untuk penelusuran rilis.

## GitHub dan frontend Vercel

### 1. Unggah source ke repositori

Letakkan seluruh **isi folder `central-sso/`** sebagai root repositori: frontend, backend, scripts, tests, docs, package/config/lockfile dan README. Untuk source ini gunakan repositori yang terpisah dari sistem lama berbasis Supabase.

Jangan unggah `node_modules/`, `.next/`, `.vercel/`, `deployment-private/`, `release-output/`, `*.tsbuildinfo`, env privat, sertifikat/private key, `.clasp.json` atau `.clasprc.json`. Template `.env.example` tetap dapat diunggah karena tidak berisi secret operasional.

### 2. Impor frontend ke Vercel

Di [Vercel](https://vercel.com/), impor repositori yang benar dan gunakan:

| Pengaturan | Nilai |
| --- | --- |
| Framework | Next.js |
| Root Directory | `frontend-next` |
| Node.js | 24.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Default framework |

Root Directory tersebut berlaku untuk repositori penuh. Tentukan domain frontend resmi yang stabil untuk lingkungan terkait.

### 3. Hubungkan ke GAS melalui Environment Variables

Buka **Project → Settings → Environment Variables** dan tambahkan:

| Variable Vercel | Nilai | Hubungan dengan GAS |
| --- | --- | --- |
| `SSO_GAS_URL` | URL Web App HTTPS berakhiran `/exec` | Deployment environment yang sesuai |
| `SSO_GATEWAY_KEY_ID` | Key ID gateway | Harus sama persis dengan Script Properties |
| `SSO_GATEWAY_SECRET` | Secret gateway 64 hex lowercase | Harus sama persis dengan Script Properties |
| `SSO_APP_ORIGIN` | Misalnya `https://sso.example.org` | Origin frontend yang benar-benar dipakai browser |

`SSO_APP_ORIGIN` harus HTTPS, tanpa slash akhir, path `/login`, query atau fragment. Contoh: `https://sso.example.org`. `SSO_RATE_LIMIT_SECRET` dan `SSO_ENVIRONMENT` cukup di Script Properties GAS; frontend paket ini tidak memerlukannya sebagai env Vercel.

Simpan gateway secret sebagai secret server; jangan gunakan awalan `NEXT_PUBLIC_`. Pilih scope environment Vercel yang sesuai. Preview mempunyai origin tersendiri; jangan menghubungkan preview dengan secret/data produksi atau mengizinkan wildcard Origin. Gunakan domain staging stabil bila menguji panel secara berkala.

Setelah menambah/mengubah env, lakukan **Redeploy**. Deployment lama tidak otomatis memakai nilai baru. Jangan memasang `NODE_OPTIONS`, `SSO_TEST_FIXTURE` atau preload pengujian pada deployment sebenarnya.

### 4. Periksa koneksi

1. Buka origin yang sama persis dengan `SSO_APP_ORIGIN`, lalu `/login`.
2. Login memakai Super Admin hasil bootstrap, lalu periksa dashboard dan daftar pengguna.
3. Uji logout dan login ulang. Jika masuk gagal, periksa tabel penanganan masalah di bawah.
4. Pada staging, jalankan pengujian native, periksa data Spreadsheet dan browser sebelum menyatakan sistem diterima.

Status Vercel **READY** atau build berhasil tidak membuktikan secret cocok, database terhubung, login bekerja atau quota mencukupi.

## Pengembangan lokal

Pasang dependency frontend:

```bash
npm --prefix frontend-next ci
```

Buat salinan `frontend-next/.env.example` menjadi `frontend-next/.env.local`, lalu isi empat variable frontend. Gunakan GAS dan secret development/staging. Untuk server development lokal, origin dapat diisi `http://localhost:3000` sesuai alamat yang benar-benar digunakan.

```bash
cd frontend-next
npm run dev
```

Buka `http://localhost:3000`. Jangan commit `.env.local`. Cookie development memiliki nama/pengaturan tersendiri; pengujian cookie Secure dan perilaku produksi memerlukan HTTPS.

## Panduan penggunaan

### Login, dashboard dan logout

Login hanya tersedia bagi akun Admin/Super Admin aktif yang tidak diarsipkan. Dashboard menampilkan data sesuai cakupan role. Admin melihat pengguna role user; Super Admin juga melihat aplikasi dan ringkasan autentikasi. Gunakan tombol keluar saat selesai.

### Pengguna

- Cari akun melalui nama/username/email/ID sesuai pencarian panel, filter status dan pagination.
- Tambahkan akun dengan username unik, nama lengkap, email, role yang diizinkan, status dan password awal.
- Status `active` mengizinkan proses autentikasi; `inactive` dan `suspended` menolaknya.
- Perubahan identitas membatalkan sesi versi lama dan token reset aktif pengguna tersebut.
- Arsip mempertahankan ID dan sejarah, sekaligus menonaktifkan akun. Pemulihan arsip/penghapusan permanen belum tersedia pada panel.
- Jika terjadi konflik versi, muat ulang dan tinjau perubahan sebelum menyimpan kembali.

### Profil dan password

Ubah nama/email dan password sendiri melalui menu Profil. Username tidak diedit dari form profil. Setelah perubahan berhasil, lakukan login ulang. Default password baru 15–128 karakter, tanpa pemotongan atau penghapusan spasi otomatis.

### Reset password

Super Admin dengan sesi segar dapat menerbitkan token reset untuk pengguna yang tepat. Default masa berlaku 15 menit, ditampilkan sekali dan hanya dapat dipakai sekali. Sistem tidak mengirim email reset otomatis.

Setelah memverifikasi penerima, bagikan token melalui saluran privat. Penerima membuka `/reset-password`, memasukkan token pada form dan menetapkan password baru. Jangan menaruh token pada URL, tiket publik atau log. Token lama tidak berlaku setelah digunakan, kedaluwarsa atau identitas pengguna berubah.

### Aplikasi dan credential API

Super Admin mendaftarkan metadata aplikasi dengan URL HTTPS. Application ID dibuat sistem. Default aplikasi nonaktif dan akses API mati; aktifkan keduanya setelah disetujui sebelum menggunakan credential.

Pilih aplikasi, lalu terbitkan credential dengan nama, masa berlaku dan scope minimum. Secret ditampilkan sekali setelah operasi terkonfirmasi; simpan di pengelola secret server aplikasi penerima. Metadata/list tidak dapat menampilkan secret ulang.

Rotasi langsung mencabut credential lama, **tanpa masa overlap**. Koordinasikan perubahan server penerima agar gangguan terkendali. Jika secret hilang atau respons operasi tidak jelas, periksa metadata/jurnal terlebih dahulu. Tidak ada automatic retry mutasi; kegagalan respons tidak menjamin mutasi belum terjadi.

Cabut credential yang bocor/tidak dipakai. Menonaktifkan aplikasi/akses API menolak request berikutnya; tindakan itu tidak berarti seluruh metadata credential terhapus.

### Log dan pengaturan

Super Admin dapat membaca Authentication Logs/Audit Logs serta mengubah nama sistem, institusi dan zona waktu tampilan. Pilihan zona waktu: WIB, WITA, WIT dan UTC; database tetap menyimpan timestamp UTC. Pengaturan keamanan tidak diubah dari form tampilan. Jangan menyimpan password/token/secret dalam metadata log.

## API dan integrasi

| Kemampuan | POST endpoint | Scope |
| --- | --- | --- |
| authenticateUser | `/api/v1/auth/verify` | `auth:verify` |
| searchUsers | `/api/v1/directory/search` | `directory:read` |
| getUserById | `/api/v1/directory/get` | `directory:read` |
| getUserStatus | `/api/v1/users/status` | `user:status` |

API publik menggunakan `Content-Type: application/json`, envelope HMAC v1, timestamp dan nonce acak. Batas body publik 12 KiB. Payload base64url bukan enkripsi. Secret HMAC adalah string ASCII hex; jangan decode key menjadi byte sebelum HMAC karena hasil signature akan berbeda dari implementasi ini.

Credential aplikasi berbeda dari gateway secret. Pemanggilan dilakukan server-to-server; browser tidak menyimpan shared secret. Cookie panel dipakai pada `POST /api/panel` dengan pemeriksaan Origin, bukan untuk autentikasi API aplikasi eksternal.

API mengembalikan identitas/status minimal, bukan token sesi aplikasi eksternal atau role bisnis. Aplikasi masa depan menggunakan `sso_user_id` sebagai referensi, menerapkan izin/sesinya sendiri dan menetapkan kebijakan pemeriksaan ulang status. Tidak ada logout federasi atau webhook pencabutan sesi eksternal pada versi ini.

Kontrak lengkap berada di `docs/API_READINESS_STAGE10.md`, `API_AUTH_STAGE3.md`, `API_DIRECTORY_STAGE4.md`, `API_PANEL_STAGE6.md` dan `API_PANEL_STAGE7.md`. Detail onboarding masa depan ada di `docs/FUTURE_INTEGRATION.md`.

## Pengujian dan penerimaan

Dari root source:

```bash
npm test
npm --prefix frontend-next ci
npm --prefix frontend-next test
npm --prefix frontend-next run typecheck
npm --prefix frontend-next run build
# Tunggu build selesai sebelum runner HTTPS.
npm run --silent test:security:http
```

Hasil paket Tahap 10: 253 tes root + 50 frontend lulus, 31 skenario HTTPS lokal dan 4 langkah cleanup lulus, TypeScript/build lulus. Audit dependency melaporkan 0 advisory terdaftar saat pemeriksaan tersebut; hasil itu bukan jaminan keamanan berkelanjutan.

Untuk memeriksa format/presensi konfigurasi privat tanpa menampilkan nilainya:

```bash
node --env-file=deployment-private/staging.env scripts/check-deployment.mjs
```

File env disiapkan privat dengan empat variable frontend. Exit 2 berarti konfigurasi belum memenuhi pemeriksaan. Kelulusan preflight tidak membuktikan secret cocok dengan GAS.

Smoke test baca saja:

```bash
node scripts/verify-deployment.mjs https://DOMAIN_STAGING_ANDA
```

Untuk E2E staging asli, gunakan `scripts/test-live-panel.mjs` sesuai `docs/SETUP_STAGE7.md`. Runner memerlukan input stdin privat berisi `confirm_staging`, `base_url`, `username` dan `password`; ia menolak production sebelum mutasi. Cocokkan record dengan fungsi manual `verifyStage7IntegrationData` dari `backend-gas/manual-tests/Stage7ReadBack.gs`. Skrip manual itu bukan bagian deployment utama.

Penerimaan produksi memerlukan bukti GAS/Spreadsheet asli, kecocokan env, read-back data, pengujian browser/CSP/cookie, quota/latensi, backup/restore dan monitoring. Tes lokal tidak menggantikan langkah-langkah tersebut.

## Pemeliharaan dan keamanan

- Simpan secret pada Script Properties/pengelola secret server. Gunakan akses terbatas ke Spreadsheet dan backup karena memuat material identitas sensitif.
- Konfigurasikan time-driven trigger untuk `cleanupSecurityState` dan `cleanupExpiredClientSecrets` setelah diuji terhadap volume/quota nyata. Cleanup dibatasi maksimal 500 record per kategori/run; pantau backlog.
- Jangan menghapus identitas permanen, log atau OperationJournal/tombstone sebagai cleanup rutin. Jurnal `needs_reconciliation` memerlukan pemeriksaan pengelola.
- Source membatasi scan 20.000 baris per sheet. Pantau pertumbuhan dan rencanakan retensi/migrasi sebelum batas tercapai; ini bukan janji throughput Google.
- Tetapkan pemilik backup, retensi, latihan restore ke lingkungan terpisah dan rencana rollback frontend/GAS yang kompatibel dengan data.
- Pantau error, latensi, kegagalan trigger, pertumbuhan sheet, expiry credential dan operasi belum jelas. Dokumentasikan commit, versi GAS, deployment frontend dan origin setiap rilis.
- Jangan menonaktifkan Deployment Protection atau melonggarkan CSP/Origin hanya agar tes tampak lulus. Selesaikan akses akun/koneksi yang diperlukan.

## Penanganan masalah

| Gejala | Pemeriksaan/tindakan |
| --- | --- |
| Layanan GAS belum tersedia | Periksa empat env Vercel, URL `/exec`, akses Web App, izin Spreadsheet, versi deployment dan redeploy frontend |
| Signature/client ditolak | Cocokkan gateway key ID/secret persis; periksa credential aplikasi bila memakai API publik |
| Origin/akses ditolak saat submit | Pastikan domain browser sama persis dengan `SSO_APP_ORIGIN`; HTTPS, tanpa slash akhir/path |
| Login gagal walau frontend tampil | Pastikan bootstrap berhasil, akun aktif dan role admin/super_admin; periksa rate limit |
| Akses ditolak pada operasi sensitif | Periksa role lalu keluar/login kembali agar sesi segar |
| Konflik versi | Muat record terbaru dan tinjau perubahan; jangan mengirim ulang form lama otomatis |
| Terlalu banyak percobaan/429 | Hentikan retry berulang dan tunggu jendela pembatasan |
| Vercel mengalihkan ke login atau menolak 403 | Bedakan proteksi platform dari login aplikasi; perbaiki izin akun/team/proyek untuk verifikasi |
| Perubahan GAS belum terlihat | Deploy versi baru melalui Manage deployments; menyimpan editor saja tidak memperbarui `/exec` |
| Build lulus tetapi API gagal | Build tidak memerlukan koneksi GAS; periksa konfigurasi runtime dan log aman |
| Token reset kedaluwarsa/tidak berlaku | Minta Super Admin menerbitkan token baru setelah memverifikasi pengguna |
| Secret credential tidak dapat dilihat ulang | Periksa metadata/jurnal lalu lakukan rotasi/penerbitan yang terkontrol bila perlu |
| Timeout saat menyimpan | Periksa efek pada record/audit/jurnal sebelum tindakan berikutnya; catat operation/request ID tanpa rahasia |

## Dokumentasi dan referensi

Dokumen paket yang relevan:

| Dokumen | Kegunaan |
| --- | --- |
| `docs/ADMIN_GUIDE.md` | Panduan operator terperinci |
| `docs/DEPLOYMENT_GUIDE.md` | Urutan deployment dan operasional |
| `docs/DEPLOYMENT_STAGE9.md` | Detail konfigurasi GAS/Vercel |
| `docs/TEST_REPORT_STAGE10.md` | Hasil dan batas pengujian terakhir |
| `docs/FINAL_AUDIT_STAGE10.md` | Kontrol dan penghambat penerimaan |
| `docs/ACCEPTANCE_MATRIX_STAGE10.md` | Pemetaan 31 syarat selesai |
| `docs/FINAL_ACCEPTANCE_STAGE10.json` | Status terstruktur pada waktu penyerahan |
| `docs/SCHEMA.md` | Struktur database identitas |

Referensi resmi: [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web), [Apps Script Deployments](https://developers.google.com/apps-script/concepts/deployments), [Vercel Environment Variables](https://vercel.com/docs/environment-variables/managing-environment-variables) dan [Vercel Project Settings](https://vercel.com/docs/project-configuration/project-settings).

Pemilik proyek perlu menetapkan kontak dukungan, domain resmi, kebijakan akses/backup serta lisensi distribusi sebelum membagikan aplikasi kepada pengguna lain.
