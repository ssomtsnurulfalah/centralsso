"use client";
import { useDate } from "./preferences";
import { useState, type FormEvent } from "react";
import { Plus, Pencil, Archive, KeyRound } from "lucide-react";
import type { Identity, UserRecord } from "@/lib/panel-schema";
import { api, useData, errorMessage } from "@/lib/client";
import { operationId } from "@/lib/utils";
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
import {
  ActionModal,
  DataState,
  FilterBar,
  SecretModal,
  TableWrap,
} from "./panel-shared";
export function UsersPanel({ user }: { user: Identity }) {
  const date = useDate();

  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<UserRecord | "new" | null>(null),
    [action, setAction] = useState<{
      kind: "archive" | "reset";
      user: UserRecord;
      id: string;
    } | null>(null),
    [secret, setSecret] = useState<{
      resetToken: string;
      expires_at: string;
    } | null>(null),
    [message, setMessage] = useState("");
  const data = useData<{ items: UserRecord[]; pagination: Pagination }>(
    "users.list",
    { query, status, page },
  );
  return (
    <>
      <Card>
        <div className="card-heading">
          <div>
            <h2>Direktori pengguna</h2>
            <p>
              {user.global_role === "super_admin"
                ? "Seluruh identitas dan administrator pusat."
                : "Anda dapat mengelola akun dengan role Pengguna."}
            </p>
          </div>
          <Button onClick={() => setEdit("new")}>
            <Plus size={17} /> Tambah pengguna
          </Button>
        </div>
        {message ? <Notice>{message}</Notice> : null}
        <FilterBar
          onReload={data.reload}
          onSearch={(q) => {
            setQuery(q);
            setPage(1);
          }}
          placeholder="Cari nama, username, email, atau ID…"
        >
          <select
            aria-label="Filter status pengguna"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {[
              ["all", "Semua status"],
              ["active", "Aktif"],
              ["inactive", "Nonaktif"],
              ["suspended", "Ditangguhkan"],
              ["archived", "Diarsipkan"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </FilterBar>
        <DataState {...data}>
          {data.data?.items.length ? (
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Pengguna</th>
                    <th>Peran</th>
                    <th>Status</th>
                    <th>Login terakhir</th>
                    <th className="text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.items.map((r) => (
                    <tr key={r.user_id}>
                      <td>
                        <div className="user-cell">
                          <span className="avatar pale">
                            {r.full_name.slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <strong>{r.full_name}</strong>
                            <small>
                              @{r.username} • {r.email}
                            </small>
                            <code>{r.user_id}</code>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge value={r.global_role} />
                      </td>
                      <td>
                        <Badge value={r.archived_at ? "archived" : r.status} />
                      </td>
                      <td className="nowrap">{date(r.last_login)}</td>
                      <td>
                        <div className="row-actions">
                          {!r.archived_at ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEdit(r)}
                                aria-label={`Edit ${r.username}`}
                              >
                                <Pencil size={14} /> Edit
                              </Button>
                              {user.global_role === "super_admin" ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    setAction({
                                      kind: "reset",
                                      user: r,
                                      id: operationId(),
                                    })
                                  }
                                  aria-label={`Reset password ${r.username}`}
                                >
                                  <KeyRound size={16} />
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setAction({
                                    kind: "archive",
                                    user: r,
                                    id: operationId(),
                                  })
                                }
                                aria-label={`Arsipkan ${r.username}`}
                              >
                                <Archive size={16} />
                              </Button>
                            </>
                          ) : (
                            <small>Arsip permanen</small>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <Empty title="Tidak ada pengguna yang sesuai">
              Ubah pencarian atau tambahkan identitas baru.
            </Empty>
          )}
          <Pager value={data.data?.pagination} onChange={setPage} />
        </DataState>
      </Card>
      {edit ? (
        <UserEditor
          record={edit === "new" ? null : edit}
          actor={user}
          onClose={() => setEdit(null)}
          onSaved={(reauth) => {
            setEdit(null);
            if (reauth) {
              window.location.assign("/login?changed=1");
              return;
            }
            setMessage("Data pengguna berhasil disimpan.");
            data.reload();
          }}
        />
      ) : null}
      {action ? (
        <ActionModal
          key={action.id}
          title={
            action.kind === "archive"
              ? "Arsipkan pengguna?"
              : "Terbitkan token reset?"
          }
          description={
            action.kind === "archive"
              ? `Akun ${action.user.username} akan dinonaktifkan dan diarsipkan permanen. User ID dan riwayat tetap tersimpan. Seluruh sesi lama menjadi tidak valid.`
              : `Token reset untuk ${action.user.username} akan menggantikan token reset sebelumnya. Sampaikan secara pribadi melalui saluran aman; sistem tidak mengirim email otomatis.`
          }
          danger={action.kind === "archive"}
          button={
            action.kind === "archive" ? "Arsipkan pengguna" : "Terbitkan token"
          }
          onClose={() => setAction(null)}
          run={() =>
            action.kind === "archive"
              ? api("users.archive", {
                  user_id: action.user.user_id,
                  expected_version: action.user.identity_version,
                  operation_id: action.id,
                })
              : api("reset.issue", { user_id: action.user.user_id })
          }
          onDone={(r) => {
            const result = r as {
              reauthentication_required?: boolean;
              resetToken: string;
              expires_at: string;
            };
            setAction(null);
            if (result.reauthentication_required) {
              window.location.assign("/login?changed=1");
              return;
            }
            if (action.kind === "reset") setSecret(result);
            else {
              setMessage("Pengguna berhasil diarsipkan.");
              data.reload();
            }
          }}
        />
      ) : null}
      {secret ? (
        <SecretModal
          title="Token reset diterbitkan"
          secret={secret.resetToken}
          details={
            <p>
              Berlaku hingga {date(secret.expires_at)}. Gunakan pada halaman{" "}
              <code>/reset-password</code>.
            </p>
          }
          onClose={() => setSecret(null)}
        />
      ) : null}
    </>
  );
}
function UserEditor({
  record,
  actor,
  onClose,
  onSaved,
}: {
  record: UserRecord | null;
  actor: Identity;
  onClose: () => void;
  onSaved: (reauth: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [op] = useState(operationId);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const user = {
      username: d.get("username"),
      full_name: d.get("full_name"),
      email: d.get("email"),
      global_role: d.get("global_role") || "user",
      status: d.get("status"),
    };
    try {
      const r = await api<{ reauthentication_required?: boolean }>(
        record ? "users.update" : "users.create",
        record
          ? {
              user_id: record.user_id,
              expected_version: record.identity_version,
              patch: user,
              operation_id: op,
            }
          : { user, password: d.get("password"), operation_id: op },
      );
      onSaved(!!r.reauthentication_required);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={record ? "Edit pengguna" : "Tambah pengguna"}
      description={
        record
          ? "Perubahan identitas atau status akan membatalkan seluruh sesi lama pengguna."
          : "User ID dibuat otomatis dan tetap permanen."
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Nama lengkap">
            <Input
              name="full_name"
              defaultValue={record?.full_name}
              required
              maxLength={160}
              autoComplete="name"
            />
          </Field>
          <Field
            label="Username"
            hint="3–64 karakter: huruf kecil, angka, titik, garis bawah atau tanda minus."
          >
            <Input
              name="username"
              defaultValue={record?.username}
              required
              minLength={3}
              maxLength={64}
              pattern="[a-z0-9][a-z0-9._-]{2,63}"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Email">
            <Input
              name="email"
              type="email"
              defaultValue={record?.email}
              required
              maxLength={254}
              autoComplete="email"
            />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={record?.status || "active"}>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
              <option value="suspended">Ditangguhkan</option>
            </select>
          </Field>
          <Field
            label="Role global"
            hint="Role hanya berlaku untuk administrasi Central SSO."
          >
            <select
              name="global_role"
              defaultValue={record?.global_role || "user"}
              disabled={actor.global_role !== "super_admin"}
            >
              <option value="user">Pengguna</option>
              {actor.global_role === "super_admin" ? (
                <>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </>
              ) : null}
            </select>
          </Field>
          {!record ? (
            <Field
              label="Password awal"
              hint="Minimum awal 15 karakter. Gunakan frasa sandi yang unik."
            >
              <Input
                name="password"
                type="password"
                required
                minLength={15}
                maxLength={1024}
                autoComplete="new-password"
              />
            </Field>
          ) : null}
        </div>
        {record ? (
          <p className="record-id">
            User ID: <code>{record.user_id}</code> • Versi{" "}
            {record.identity_version}
          </p>
        ) : null}
        {error ? (
          <Notice error>
            {error} ID operasi: <code>{op}</code>. Muat ulang direktori sebelum
            mencoba kembali bila respons terputus.
          </Notice>
        ) : null}
        <div className="form-actions">
          <Button
            variant="outline"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Batal
          </Button>
          <Button disabled={busy}>
            {busy
              ? "Menyimpan…"
              : record
                ? "Simpan perubahan"
                : "Buat pengguna"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
