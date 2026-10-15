"use client";
import Link from "next/link";
import { Button, Notice } from "@/components/common";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <h1>Layanan belum tersedia</h1>
      <Notice error>
        Koneksi ke backend Central SSO belum dapat diverifikasi. Periksa
        konfigurasi GAS atau coba kembali.
      </Notice>
      <Button onClick={reset}>Coba kembali</Button>{" "}
      <Link href="/login">Kembali ke halaman masuk</Link>
    </main>
  );
}
