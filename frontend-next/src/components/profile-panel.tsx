"use client";
import { useDate } from "./preferences";
import { useState, type FormEvent } from "react";
import { LockKeyhole, UserRound } from "lucide-react";
import type { UserRecord } from "@/lib/panel-schema";
import { api, useData, errorMessage } from "@/lib/client";
import { operationId } from "@/lib/utils";
import { Card } from "./ui/card";
import { Badge, Button, Field, Input, Notice } from "./common";
import { DataState } from "./panel-shared";
export function ProfilePanel() {
  const data = useData<{ user: UserRecord }>("profile.get");
  return (
    <DataState {...data}>
      {data.data ? <ProfileForm user={data.data.user} /> : null}
    </DataState>
  );
}
function ProfileForm({ user }: { user: UserRecord }) {
  const date = useDate();

  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [op] = useState(operationId);
  async function submit(
    e: FormEvent<HTMLFormElement>,
    kind: "profile" | "password",
  ) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setError("");
    if (kind === "password" && d.get("password") !== d.get("confirm")) {
      setError("Konfirmasi password belum sama.");
      return;
    }
    setBusy(kind);
    try {
      await api(
        kind === "profile" ? "profile.update" : "password.change",
        kind === "profile"
          ? {
              patch: { full_name: d.get("name"), email: d.get("email") },
              expected_version: user.identity_version,
              operation_id: op,
            }
          : { password: d.get("password") },
      );
      window.location.assign("/login?changed=1");
    } catch (e) {
      setError(errorMessage(e));
      setBusy("");
    }
  }
  return (
    <>
      <div className="profile-summary">
        <span className="avatar large">
          {user.full_name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h2>{user.full_name}</h2>
          <p>@{user.username}</p>
          <Badge value={user.global_role} />
        </div>
        <div className="profile-reference">
          <small>IDENTITAS PERMANEN</small>
          <code>{user.user_id}</code>
        </div>
      </div>
      {error ? <Notice error>{error}</Notice> : null}
      <div className="profile-grid">
        <Card className="form-card">
          <div className="section-icon">
            <UserRound size={21} />
          </div>
          <h2>Informasi profil</h2>
          <p className="muted">
            Pembaruan profil memerlukan login kembali pada seluruh sesi.
          </p>
          <form className="form-stack" onSubmit={(e) => submit(e, "profile")}>
            <Field label="Nama lengkap">
              <Input
                name="name"
                required
                maxLength={160}
                defaultValue={user.full_name}
                autoComplete="name"
              />
            </Field>
            <Field label="Email">
              <Input
                name="email"
                type="email"
                required
                maxLength={254}
                defaultValue={user.email}
                autoComplete="email"
              />
            </Field>
            <Field label="Username">
              <Input value={user.username} disabled readOnly />
            </Field>
            <Button disabled={!!busy}>
              {busy === "profile"
                ? "Menyimpan…"
                : "Simpan profil & masuk ulang"}
            </Button>
          </form>
        </Card>
        <Card className="form-card">
          <div className="section-icon">
            <LockKeyhole size={21} />
          </div>
          <h2>Keamanan password</h2>
          <p className="muted">
            Masuk ulang sebelum mengubah password bila sesi berusia lebih dari 5
            menit.
          </p>
          <form className="form-stack" onSubmit={(e) => submit(e, "password")}>
            <Field
              label="Password baru"
              hint="Ikuti kebijakan institusi; minimum awal 15 karakter."
            >
              <Input
                type="password"
                name="password"
                required
                minLength={15}
                maxLength={1024}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Konfirmasi password baru">
              <Input
                type="password"
                name="confirm"
                required
                minLength={15}
                maxLength={1024}
                autoComplete="new-password"
              />
            </Field>
            <Notice>
              Seluruh sesi lama langsung tidak valid setelah password berhasil
              diganti.
            </Notice>
            <Button disabled={!!busy}>
              {busy === "password"
                ? "Mengubah…"
                : "Ubah password & masuk ulang"}
            </Button>
          </form>
        </Card>
      </div>
      <p className="muted profile-dates">
        Dibuat {date(user.created_at)} • Login terakhir {date(user.last_login)}{" "}
        • Password diperbarui {date(user.password_changed_at)}
      </p>
    </>
  );
}
