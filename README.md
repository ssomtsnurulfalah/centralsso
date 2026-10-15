# Central SSO V3.1 — Tahap 10

Paket kumulatif Tahap 2–10, source aplikasi 0.9.0, protokol HMAC v1 dan skema Spreadsheet v1. Arsitektur: Next.js server → gateway HMAC → GAS V8 → 12 sheet identitas.

**Audit, dokumentasi dan verifikasi lokal Tahap 10 selesai. Sistem belum diterima untuk produksi: deployment GAS/Spreadsheet asli, repositori baru, environment dan verifikasi native masih tertunda.**

## Hasil terbaru

- 303 tes lulus (253 root + 50 frontend), 0 gagal.
- 31 skenario HTTPS lokal dan 4 langkah cleanup lulus; Google/Spreadsheet pada runner adalah test double.
- TypeScript dan build produksi lulus; 11 route dinamis dan Proxy tercantum.
- npm audit produksi dan seluruh dependency: 0 advisory terdaftar saat pemeriksaan, bukan jaminan bebas kerentanan.
- Payload frontend 55 file cocok dengan hash yang dikirim Tahap 9. READY adalah laporan historis; pemeriksaan metadata terbaru ditolak 403. Belum ada login/API live yang diterima.

## Peta dokumen

| Dokumen dalam docs | Isi |
| --- | --- |
| TAHAP_10.md | Ringkasan dan peta penyerahan |
| FINAL_AUDIT_STAGE10.md | Kontrol, batas audit dan penghambat penerimaan |
| TEST_REPORT_STAGE10.md | Bukti eksekusi terbaru dan reproduksi |
| API_READINESS_STAGE10.md | Endpoint, signing, DTO/scopes/error dan kesiapan |
| ADMIN_GUIDE.md | Panduan operator panel |
| DEPLOYMENT_GUIDE.md | GAS, repo baru, Vercel, env dan operasional |
| FUTURE_INTEGRATION.md | Tanggung jawab integrasi aplikasi masa depan |
| ACCEPTANCE_MATRIX_STAGE10.md | Pemetaan 31 Definition of Done |
| FINAL_ACCEPTANCE_STAGE10.json | Status terstruktur; ready_for_production=false |

Dokumen dan bukti sebelumnya adalah riwayat. Status akhir mengacu pada Tahap 10.

## Verifikasi lokal

Node 24+, npm dan OpenSSL untuk runner HTTPS.

```bash
npm test
npm --prefix frontend-next ci
npm --prefix frontend-next test
npm --prefix frontend-next run typecheck
npm --prefix frontend-next run build
# Tunggu build selesai sebelum runner.
npm run --silent test:security:http
```

Untuk pengembangan frontend, buat env privat dari frontend-next/.env.example dan isi konfigurasi GAS yang benar, lalu jalankan npm run dev dari frontend-next. Tidak ada akun default atau login demo. Jangan membawa preload fixture, NODE_OPTIONS atau SSO_TEST_FIXTURE ke deployment nyata.

## Keadaan rilis

Pengguna memilih repositori baru; repo sso berbasis Supabase dan proyek Vercel central-sso lama tidak diubah. Source sebelumnya dikirim langsung ke proyek baru central-sso-gas tanpa commit GitHub. GAS/Spreadsheet, bootstrap, secret dan origin yang cocok belum diverifikasi.

Frontend Tahap 9: https://central-sso-o9gitilbd-amtsnurulfalah-2546.vercel.app. Deployment pertama diberi target production oleh platform tetapi belum terhubung ke GAS. Tidak ada deployment ulang pada Tahap 10. Pembacaan metadata Vercel terbaru mendapat 403; status terkini tidak berhasil dikonfirmasi ulang.

Backend: pasang 15 modul backend-gas/src beserta appsscript.json atau bentuk gabungan CentralSsoStage8.gs.txt, pilih satu. Backend tidak berubah sejak Tahap 8. Folder gas-release pada ZIP final hanya memuat 15 modul dan manifest.

ZIP memuat source/lockfile, tes, bukti dan panduan; tanpa secret deployment, env privat, sertifikat, node_modules atau cache build. SHA256SUMS memeriksa integritas berkas, bukan sertifikasi keamanan. Penutupan yang tersisa adalah deployment serta penerimaan native Central SSO. Tidak dibangun aplikasi Inventaris atau aplikasi eksternal lain.
