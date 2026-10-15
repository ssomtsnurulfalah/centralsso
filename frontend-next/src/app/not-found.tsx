import Link from "next/link";
export default function Page() {
  return (
    <main className="standalone">
      <h1>Halaman tidak ditemukan</h1>
      <p>Periksa alamat atau kembali ke dashboard.</p>
      <Link href="/admin">Kembali ke dashboard</Link>
    </main>
  );
}
