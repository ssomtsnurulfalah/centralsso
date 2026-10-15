"use client";
import { useDate } from "./preferences";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Plus, Pencil, Power, ArrowUpRight, KeyRound } from "lucide-react";
import type { ApplicationRecord } from "@/lib/server/application-registry.mjs";
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
import { ActionModal, DataState, FilterBar, TableWrap } from "./panel-shared";
export function ApplicationsPanel() {
  const date = useDate();

  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<ApplicationRecord | "new" | null>(null),
    [disable, setDisable] = useState<{
      app: ApplicationRecord;
      id: string;
    } | null>(null),
    [message, setMessage] = useState("");
  const data = useData<{ items: ApplicationRecord[]; pagination: Pagination }>(
    "apps.list",
    { query, status, page },
  );
  return (
    <>
      <Card>
        <div className="card-heading">
          <div>
            <h2>Registrasi aplikasi</h2>
            <p>
              Aplikasi klien menggunakan identitas pusat melalui API bertanda
              tangan.
            </p>
          </div>
          <Button onClick={() => setEdit("new")}>
            <Plus size={17} /> Daftarkan aplikasi
          </Button>
        </div>
        {message ? <Notice>{message}</Notice> : null}
        <FilterBar
          onReload={data.reload}
          onSearch={(q) => {
            setQuery(q);
            setPage(1);
          }}
          placeholder="Cari aplikasi…"
        >
          <select
            aria-label="Filter status aplikasi"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </FilterBar>
        <DataState {...data}>
          {data.data?.items.length ? (
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Aplikasi</th>
                    <th>Status</th>
                    <th>Akses API</th>
                    <th>Didaftarkan</th>
                    <th>Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.items.map((r) => (
                    <tr key={r.application_id}>
                      <td>
                        <strong>{r.application_name}</strong>
                        <small>
                          {r.application_description || "Tanpa deskripsi"}
                        </small>
                        <a
                          href={r.application_url}
                          rel="noopener noreferrer"
                          target="_blank"
                          className="external-link"
                        >
                          {r.application_url}
                          <ArrowUpRight size={13} />
                        </a>
                        <code>{r.application_id}</code>
                      </td>
                      <td>
                        <Badge value={r.application_status} />
                      </td>
                      <td>
                        <Badge
                          value={r.api_access_enabled ? "active" : "inactive"}
                        />
                      </td>
                      <td className="nowrap">{date(r.created_at)}</td>
                      <td>
                        <div className="row-actions">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEdit(r)}
                          >
                            <Pencil size={14} /> Edit
                          </Button>
                          <Button asChild variant="ghost" size="icon">
                            <Link
                              href={`/admin/credentials?app=${encodeURIComponent(r.application_id)}`}
                              aria-label={`Kredensial ${r.application_name}`}
                            >
                              <KeyRound size={16} />
                            </Link>
                          </Button>
                          {r.application_status === "active" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setDisable({ app: r, id: operationId() })
                              }
                              aria-label={`Nonaktifkan ${r.application_name}`}
                            >
                              <Power size={16} />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <Empty title="Tidak ada aplikasi yang sesuai">
              Daftarkan aplikasi untuk mempersiapkan akses API pusat.
            </Empty>
          )}
          <Pager value={data.data?.pagination} onChange={setPage} />
        </DataState>
      </Card>
      {edit ? (
        <ApplicationEditor
          record={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            setMessage("Registrasi aplikasi berhasil disimpan.");
            data.reload();
          }}
        />
      ) : null}
      {disable ? (
        <ActionModal
          title="Nonaktifkan aplikasi?"
          description={`Akses API ${disable.app.application_name} akan ditolak segera. Kredensial yang sudah dicabut tidak dapat dipulihkan dengan mengaktifkan aplikasi kembali.`}
          danger
          button="Nonaktifkan aplikasi"
          run={() =>
            api("apps.disable", {
              application_id: disable.app.application_id,
              expected_version: disable.app.record_version,
              operation_id: disable.id,
            })
          }
          onClose={() => setDisable(null)}
          onDone={() => {
            setDisable(null);
            setMessage("Aplikasi dinonaktifkan.");
            data.reload();
          }}
        />
      ) : null}
    </>
  );
}
function ApplicationEditor({
  record,
  onClose,
  onSaved,
}: {
  record: ApplicationRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [op] = useState(operationId);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const d = new FormData(e.currentTarget),
      application = {
        application_name: d.get("name"),
        application_description: d.get("description"),
        application_url: d.get("url"),
        application_type: d.get("type"),
        application_status: d.get("status"),
        api_access_enabled: d.get("api") === "on",
      };
    try {
      await api(
        record ? "apps.update" : "apps.create",
        record
          ? {
              application_id: record.application_id,
              expected_version: record.record_version,
              patch: application,
              operation_id: op,
            }
          : { application, operation_id: op },
      );
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={record ? "Edit aplikasi" : "Daftarkan aplikasi"}
      description="Application ID bersifat permanen. Pendaftaran tidak membuat aplikasi eksternal."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} className="form-stack">
        <Field label="Nama aplikasi">
          <Input
            name="name"
            required
            maxLength={160}
            defaultValue={record?.application_name}
          />
        </Field>
        <Field label="Deskripsi">
          <textarea
            name="description"
            maxLength={2000}
            defaultValue={record?.application_description}
            rows={3}
          />
        </Field>
        <div className="form-grid">
          <Field
            label="URL aplikasi"
            hint="HTTPS, tanpa username atau password pada URL."
          >
            <Input
              name="url"
              type="url"
              required
              pattern="https://.*"
              maxLength={2048}
              placeholder="https://aplikasi.example.sch.id"
              defaultValue={record?.application_url}
            />
          </Field>
          <Field label="Tipe aplikasi">
            <Input
              name="type"
              required
              pattern="[a-z][a-z0-9_-]{1,31}"
              maxLength={32}
              defaultValue={record?.application_type || "web"}
            />
          </Field>
          <Field label="Status aplikasi">
            <select
              name="status"
              defaultValue={record?.application_status || "inactive"}
            >
              <option value="inactive">Nonaktif</option>
              <option value="active">Aktif</option>
            </select>
          </Field>
          <label className="check-field">
            <input
              type="checkbox"
              name="api"
              defaultChecked={record?.api_access_enabled || false}
            />
            <span>Izinkan akses API</span>
          </label>
        </div>
        {record ? (
          <p className="record-id">
            <code>{record.application_id}</code> • Versi {record.record_version}
          </p>
        ) : (
          <Notice>
            Registrasi baru secara default nonaktif dan akses API belum
            diizinkan. Aktifkan keduanya sebelum menerbitkan kredensial.
          </Notice>
        )}
        {error ? <Notice error>{error}</Notice> : null}
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
            {busy ? "Menyimpan…" : "Simpan aplikasi"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
