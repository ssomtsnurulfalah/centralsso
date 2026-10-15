"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  LockKeyhole,
  Fingerprint,
  KeyRound,
} from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Button, Field, Input, Notice } from "./common";
export function AuthForm({ reset = false }: { reset?: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has("changed"))
      setNotice(
        "Perubahan berhasil disimpan. Silakan masuk dengan identitas terbaru.",
      );
    else if (q.has("expired"))
      setNotice("Sesi telah berakhir. Silakan masuk kembali.");
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ redirect: string }>(
        reset ? "reset.complete" : "login",
        reset
          ? { token: data.get("token"), password: data.get("password") }
          : { username: data.get("username"), password: data.get("password") },
      );
      form.reset();
      window.location.assign(result.redirect);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link className="brand" href="/login">
          <span className="brand-symbol">
            <Fingerprint size={25} />
          </span>
          <span>
            Central SSO<small>MTs Nurul Falah</small>
          </span>
        </Link>
        <div className="auth-story-content">
          <div className="eyebrow light">PUSAT IDENTITAS MADRASAH</div>
          <h1>
            Satu identitas.
            <br />
            Akses yang terkelola.
          </h1>
          <p>
            Kelola pengguna dan akses aplikasi dalam satu pusat administrasi
            yang aman dan teratur.
          </p>
          <div className="auth-tiles">
            <div>
              <ShieldCheck size={22} />
              <span>Identitas terpusat</span>
            </div>
            <div>
              <KeyRound size={22} />
              <span>Akses terkendali</span>
            </div>
            <div>
              <LockKeyhole size={22} />
              <span>Aktivitas tercatat</span>
            </div>
          </div>
        </div>
        <p className="auth-footer">
          Central SSO V3.1 <span>•</span> Administrasi institusi
        </p>
      </section>
      <section className="auth-main">
        <div className="auth-box">
          <span className="auth-icon">
            <LockKeyhole size={25} />
          </span>
          <div className="eyebrow">PORTAL ADMINISTRATOR</div>
          <h2>{reset ? "Atur password baru" : "Selamat datang kembali"}</h2>
          <p className="muted">
            {reset
              ? "Gunakan token reset yang diberikan Super Admin melalui saluran aman."
              : "Masuk untuk mengelola identitas dan akses institusi."}
          </p>
          {notice ? <Notice>{notice}</Notice> : null}
          {error ? <Notice error>{error}</Notice> : null}
          <form onSubmit={submit} className="form-stack">
            {reset ? (
              <Field
                label="Token reset"
                hint="Token hanya dapat digunakan satu kali sebelum kedaluwarsa."
              >
                <Input
                  name="token"
                  required
                  pattern="[a-f0-9]{64}"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            ) : (
              <Field label="Username">
                <Input
                  name="username"
                  required
                  minLength={3}
                  maxLength={64}
                  autoComplete="username"
                  placeholder="Masukkan username"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
            )}
            <Field
              label={reset ? "Password baru" : "Password"}
              hint={
                reset
                  ? "Ikuti kebijakan password institusi; minimum awal 15 karakter."
                  : undefined
              }
            >
              <span className="password-wrap">
                <Input
                  name="password"
                  type={visible ? "text" : "password"}
                  required
                  minLength={reset ? 15 : 1}
                  maxLength={1024}
                  autoComplete={reset ? "new-password" : "current-password"}
                  placeholder={
                    reset ? "Buat frasa sandi yang kuat" : "Masukkan password"
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setVisible(!visible)}
                  aria-label={
                    visible ? "Sembunyikan password" : "Tampilkan password"
                  }
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </Button>
              </span>
            </Field>
            <Button disabled={busy} type="submit" className="full">
              {busy
                ? "Memproses…"
                : reset
                  ? "Simpan password baru"
                  : "Masuk ke dashboard"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <div className="auth-help">
            {reset ? (
              <Link href="/login">Kembali ke halaman masuk</Link>
            ) : (
              <>
                Lupa password? Hubungi Super Admin untuk mendapatkan token
                reset. <Link href="/reset-password">Gunakan token reset</Link>
              </>
            )}
          </div>
          <div className="security-note">
            <ShieldCheck size={16} /> Khusus administrator yang diberi wewenang.
          </div>
        </div>
      </section>
    </main>
  );
}
