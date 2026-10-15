"use client";
import { usePreferences, useDate } from "./preferences";
import { useState, type FormEvent } from "react";
import {
  Users,
  AppWindow,
  ArrowUpRight,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { z } from "zod";
import { api, useData, errorMessage } from "@/lib/client";

import type { Identity, LogRecord, Setting } from "@/lib/panel-schema";
import { dashboard as dashboardSchema } from "@/lib/panel-schema";
import { Card } from "./ui/card";
import {
  Badge,
  Button,
  Empty,
  Field,
  Input,
  Modal,
  Notice,
  Pager,
  type Pagination,
} from "./common";
import { DataState, TableWrap, FilterBar } from "./panel-shared";
import { UsersPanel } from "./users-panel";
import { ApplicationsPanel } from "./applications-panel";
import { CredentialsPanel } from "./credentials-panel";
import { ProfilePanel } from "./profile-panel";
export function Panel({ section, user }: { section: string; user: Identity }) {
  switch (section) {
    case "users":
      return <UsersPanel user={user} />;
    case "applications":
      return <ApplicationsPanel />;
    case "credentials":
      return <CredentialsPanel />;
    case "logs":
      return <LogsPanel />;
    case "settings":
      return <SettingsPanel />;
    case "profile":
      return <ProfilePanel />;
    default:
      return <Dashboard user={user} />;
  }
}
function Dashboard({ user }: { user: Identity }) {
  const date = useDate();

  const result = useData<z.infer<typeof dashboardSchema>>("dashboard"),
    d = result.data;
  return (
    <DataState {...result}>
      <div className="welcome-banner">
        <div>
          <span className="eyebrow">RUANG KENDALI IDENTITAS</span>
          <h2>Halo, {user.full_name.split(" ")[0]}.</h2>
          <p>
            Identitas yang tertata, akses yang terjaga.
            <br />
            Pantau pengguna dan aktivitas dari satu tempat.
          </p>
          <Button asChild>
            <a href="/admin/users">
              Kelola pengguna <ArrowUpRight size={17} />
            </a>
          </Button>
        </div>
        <div className="banner-emblem" aria-hidden="true">
          <Users size={74} />
        </div>
      </div>
      <div className="stat-grid">
        {[
          {
            label: "Total pengguna",
            value: d?.users_total,
            icon: Users,
            note: "Akun di luar arsip",
          },
          {
            label: "Pengguna aktif",
            value: d?.users_active,
            icon: CheckCircle2,
            note: "Siap untuk autentikasi",
          },
          {
            label:
              user.global_role === "super_admin"
                ? "Aplikasi terdaftar"
                : "Pengguna diarsipkan",
            value:
              user.global_role === "super_admin"
                ? d?.applications_total
                : d?.users_archived,
            icon: AppWindow,
            note:
              user.global_role === "super_admin"
                ? "Seluruh registrasi aplikasi"
                : "Identitas tetap tersimpan",
          },
          {
            label: "Autentikasi gagal",
            value: d?.auth_failure_24h,
            icon: ShieldAlert,
            note:
              user.global_role === "super_admin"
                ? "Dalam 24 jam terakhir"
                : "Hanya tersedia bagi Super Admin",
          },
        ].map(({ label, value, icon: Icon, note }) => (
          <Card key={label} className="stat-card">
            <div>
              <span>{label}</span>
              <Icon size={19} />
            </div>
            <strong>
              {value === null || value === undefined
                ? "—"
                : value.toLocaleString("id-ID")}
            </strong>
            <small>{note}</small>
          </Card>
        ))}
      </div>
      <div className="dashboard-bottom">
        <Card>
          <div className="card-heading">
            <div>
              <h2>Aktivitas autentikasi terbaru</h2>
              <p>Enam aktivitas terakhir yang tercatat.</p>
            </div>
            {user.global_role === "super_admin" ? (
              <a href="/admin/logs">
                Lihat log <ArrowUpRight size={15} />
              </a>
            ) : null}
          </div>
          {user.global_role !== "super_admin" ? (
            <Empty title="Akses log dibatasi">
              Log global tersedia bagi Super Admin.
            </Empty>
          ) : d?.recent_logs.length ? (
            <LogTable items={d.recent_logs} kind="authentication" />
          ) : (
            <Empty title="Belum ada aktivitas">
              Log akan tampil setelah autentikasi berlangsung.
            </Empty>
          )}
        </Card>
        <Card className="quick-card">
          <h2>Pusat administrasi</h2>
          <p className="muted">Mulai dari tugas utama Anda.</p>
          {[
            {
              href: "/admin/users",
              label: "Direktori pengguna",
              detail: "Identitas, status, dan arsip",
            },
            {
              href: "/admin/profile",
              label: "Keamanan akun",
              detail: "Profil dan perubahan password",
            },
            ...(user.global_role === "super_admin"
              ? [
                  {
                    href: "/admin/credentials",
                    label: "Kredensial aplikasi",
                    detail: "Kunci API dan cakupan akses",
                  },
                ]
              : []),
          ].map((v) => (
            <a className="quick-link" href={v.href} key={v.href}>
              <div>
                <strong>{v.label}</strong>
                <small>{v.detail}</small>
              </div>
              <ArrowUpRight size={17} />
            </a>
          ))}
          <div className="freshness">
            <span className="version-dot" /> Diperbarui {date(d?.generated_at)}
          </div>
        </Card>
      </div>
    </DataState>
  );
}
function LogTable({ items, kind }: { items: LogRecord[]; kind: string }) {
  const date = useDate();

  return (
    <TableWrap>
      <table>
        <thead>
          <tr>
            <th>Waktu</th>
            <th>
              {kind === "audit" ? "Aksi / target" : "Identitas / aplikasi"}
            </th>
            <th>Hasil</th>
            <th>Referensi</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={r.log_id || r.audit_id || i}>
              <td className="nowrap">{date(r.timestamp)}</td>
              <td>
                <strong>
                  {kind === "audit"
                    ? r.action
                    : r.user_id || "Identitas tidak diketahui"}
                </strong>
                <small className="mono">
                  {kind === "audit"
                    ? `${r.target_type}: ${r.target_id}`
                    : r.application_id || "Portal administrator"}
                </small>
                {kind === "audit" ? (
                  <small>Aktor: {r.actor_user_id || "Sistem"}</small>
                ) : null}
              </td>
              <td>
                <Badge value={r.result} />
                {r.failure_reason_code ? (
                  <small>{r.failure_reason_code}</small>
                ) : null}
              </td>
              <td>
                <code>{r.request_id || r.audit_id}</code>
                {kind === "audit" ? (
                  <details>
                    <summary>Metadata</summary>
                    <pre className="metadata">{r.metadata}</pre>
                  </details>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
function LogsPanel() {
  const [kind, setKind] = useState("authentication"),
    [query, setQuery] = useState(""),
    [result, setResult] = useState("all"),
    [page, setPage] = useState(1);
  const data = useData<{ items: LogRecord[]; pagination: Pagination }>(
    "logs.list",
    { kind, filters: { query, result, page } },
  );
  return (
    <Card>
      <div className="card-heading">
        <div>
          <h2>Jejak aktivitas</h2>
          <p>
            Catatan hanya dapat dibaca dan tidak dapat dihapus melalui panel.
          </p>
        </div>
      </div>
      <div className="tabs" role="group" aria-label="Jenis log">
        {[
          { id: "authentication", label: "Autentikasi" },
          { id: "audit", label: "Audit administrasi" },
        ].map((t) => (
          <Button
            key={t.id}
            variant={kind === t.id ? "default" : "ghost"}
            onClick={() => {
              setKind(t.id);
              setPage(1);
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <FilterBar
        onReload={data.reload}
        onSearch={(q) => {
          setQuery(q);
          setPage(1);
        }}
        placeholder="Cari ID, aksi, atau alasan…"
      >
        <select
          aria-label="Filter hasil"
          value={result}
          onChange={(e) => {
            setResult(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Semua hasil</option>
          <option value="success">Berhasil</option>
          <option value="failure">Gagal</option>
        </select>
      </FilterBar>
      <DataState {...data}>
        {data.data?.items.length ? (
          <LogTable items={data.data.items} kind={kind} />
        ) : (
          <Empty title="Tidak ada log yang sesuai" />
        )}
        <Pager value={data.data?.pagination} onChange={setPage} />
      </DataState>
    </Card>
  );
}
function SettingsPanel() {
  const preferences = usePreferences();
  const result = useData<{ items: Setting[] }>("settings.get"),
    [edit, setEdit] = useState<Setting | null>(null),
    [message, setMessage] = useState("");
  return (
    <DataState {...result}>
      {message ? <Notice>{message}</Notice> : null}
      <Notice>
        Perubahan pengaturan tampilan memerlukan sesi baru berusia kurang dari 5
        menit. Kebijakan keamanan ditampilkan sebagai referensi; perubahan
        lanjut ditangani pada tahap integrasi dan pengujian.
      </Notice>
      <Card>
        <div className="card-heading">
          <div>
            <h2>Identitas & tampilan</h2>
            <p>Nama sistem, institusi, dan preferensi zona waktu.</p>
          </div>
        </div>
        <div className="settings-list">
          {result.data?.items
            .filter((s) =>
              ["system_name", "institution_name", "display_timezone"].includes(
                s.setting_key,
              ),
            )
            .map((s) => (
              <div className="setting-row" key={s.setting_key}>
                <div>
                  <strong>
                    {
                      {
                        system_name: "Nama sistem",
                        institution_name: "Nama institusi",
                        display_timezone: "Zona waktu",
                      }[s.setting_key]
                    }
                  </strong>
                  <small>{s.description}</small>
                </div>
                <span>{s.setting_value}</span>
                <Button variant="outline" size="sm" onClick={() => setEdit(s)}>
                  Ubah
                </Button>
              </div>
            ))}
        </div>
      </Card>
      <Card>
        <div className="card-heading">
          <div>
            <h2>Kebijakan keamanan</h2>
            <p>
              Nilai aktif dari backend GAS. Seluruh timestamp disimpan sebagai
              UTC.
            </p>
          </div>
          <Badge value="active" />
        </div>
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Pengaturan</th>
                <th>Nilai aktif</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {result.data?.items
                .filter(
                  (s) =>
                    ![
                      "system_name",
                      "institution_name",
                      "display_timezone",
                    ].includes(s.setting_key),
                )
                .map((s) => (
                  <tr key={s.setting_key}>
                    <td>
                      <code>{s.setting_key}</code>
                    </td>
                    <td>{s.setting_value}</td>
                    <td>{s.description}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
      {edit ? (
        <SettingEditor
          setting={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            setMessage("Pengaturan berhasil disimpan.");
            preferences.reload();
            result.reload();
          }}
        />
      ) : null}
    </DataState>
  );
}
function SettingEditor({
  setting,
  onClose,
  onSaved,
}: {
  setting: Setting;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("settings.update", {
        setting_key: setting.setting_key,
        expected_value: setting.setting_value,
        setting_value: new FormData(e.currentTarget).get("value"),
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Ubah pengaturan"
      description={setting.description}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} className="form-stack">
        <Field label="Nilai pengaturan">
          {setting.setting_key === "display_timezone" ? (
            <select name="value" defaultValue={setting.setting_value}>
              {["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "UTC"].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          ) : (
            <Input
              name="value"
              defaultValue={setting.setting_value}
              required
              maxLength={160}
            />
          )}
        </Field>
        <p className="muted">
          Nama institusi dan zona waktu panel diperbarui setelah nilai disimpan.
        </p>
        {error ? <Notice error>{error}</Notice> : null}
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Batal
          </Button>
          <Button disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan perubahan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
