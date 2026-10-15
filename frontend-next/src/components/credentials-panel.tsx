"use client";
import { useDate } from "./preferences";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, RotateCw, Ban, ListFilter, ShieldCheck } from "lucide-react";
import type {
  ApplicationRecord,
  CredentialMetadata,
  ApiScope,
} from "@/lib/server/application-registry.mjs";
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
  SecretModal,
  TableWrap,
  FilterBar,
} from "./panel-shared";
const scopes: ApiScope[] = ["auth:verify", "directory:read", "user:status"];
const scopeLabels = {
  "auth:verify": "Verifikasi autentikasi pengguna",
  "directory:read": "Baca direktori pengguna",
  "user:status": "Periksa status pengguna",
};
type CredentialResult = {
  client_secret: string;
  credential: CredentialMetadata;
  operation_id: string;
};
export function CredentialsPanel() {
  const date = useDate();

  const [appId, setAppId] = useState(""),
    [appPage, setAppPage] = useState(1),
    [appQuery, setAppQuery] = useState(""),
    [page, setPage] = useState(1),
    [editor, setEditor] = useState<{
      kind: "issue" | "rotate" | "scopes";
      record?: CredentialMetadata;
    } | null>(null),
    [revoke, setRevoke] = useState<{
      record: CredentialMetadata;
      id: string;
    } | null>(null),
    [secret, setSecret] = useState<CredentialResult | null>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    setAppId(new URLSearchParams(window.location.search).get("app") || "");
  }, []);
  const apps = useData<{ items: ApplicationRecord[]; pagination: Pagination }>(
    "apps.list",
    { query: appQuery, page: appPage },
  );
  const data = useData<{ items: CredentialMetadata[]; pagination: Pagination }>(
    "credentials.list",
    { application_id: appId, page },
    !!appId,
  );
  function saved(result: CredentialResult) {
    setEditor(null);
    if (result.client_secret) setSecret(result);
    else setMessage("Cakupan akses berhasil diperbarui.");
    data.reload();
  }
  return (
    <>
      <Notice>
        <ShieldCheck size={16} /> Penerbitan, rotasi, pencabutan, dan perubahan
        scope memerlukan login ulang bila sesi berusia lebih dari 5 menit.
        Secret hanya ditampilkan satu kali.
      </Notice>
      {message ? <Notice>{message}</Notice> : null}
      <Card>
        <div className="card-heading">
          <div>
            <h2>Pilih aplikasi</h2>
            <p>Kredensial selalu terikat pada satu Application ID.</p>
          </div>
        </div>
        <FilterBar
          onReload={apps.reload}
          placeholder="Cari aplikasi untuk dipilih…"
          onSearch={(q) => {
            setAppQuery(q);
            setAppPage(1);
          }}
        />
        <DataState {...apps}>
          <div className="selector-area">
            <Field label="Aplikasi terdaftar">
              <select
                value={appId}
                onChange={(e) => {
                  setAppId(e.target.value);
                  setPage(1);
                  setMessage("");
                  window.history.replaceState(
                    null,
                    "",
                    `/admin/credentials${e.target.value ? "?app=" + encodeURIComponent(e.target.value) : ""}`,
                  );
                }}
              >
                <option value="">Pilih aplikasi…</option>
                {appId &&
                !apps.data?.items.some((a) => a.application_id === appId) ? (
                  <option value={appId}>{appId}</option>
                ) : null}
                {apps.data?.items.map((a) => (
                  <option key={a.application_id} value={a.application_id}>
                    {a.application_name} (
                    {a.application_status === "active" ? "aktif" : "nonaktif"})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Pager value={apps.data?.pagination} onChange={setAppPage} />
        </DataState>
      </Card>
      <Card>
        <div className="card-heading">
          <div>
            <h2>Kredensial API</h2>
            <p>Metadata kunci dan cakupan akses aplikasi.</p>
          </div>
          <Button
            disabled={!appId}
            onClick={() => setEditor({ kind: "issue" })}
          >
            <Plus size={17} /> Terbitkan kredensial
          </Button>
        </div>
        {!appId ? (
          <Empty title="Pilih aplikasi terlebih dahulu">
            Daftar kunci akan ditampilkan setelah aplikasi dipilih.
          </Empty>
        ) : (
          <DataState {...data}>
            {data.data?.items.length ? (
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>Kredensial</th>
                      <th>Cakupan akses</th>
                      <th>Status efektif</th>
                      <th>Kedaluwarsa</th>
                      <th>Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.items.map((r) => (
                      <tr key={r.credential_id}>
                        <td>
                          <strong>{r.credential_name}</strong>
                          <code>{r.key_id}</code>
                          <details>
                            <summary>Fingerprint & referensi</summary>
                            <code className="break">
                              {r.credential_fingerprint}
                            </code>
                            <code>{r.credential_id}</code>
                          </details>
                        </td>
                        <td>
                          <div className="scope-list">
                            {r.allowed_scopes.map((s) => (
                              <code key={s}>{s}</code>
                            ))}
                          </div>
                        </td>
                        <td>
                          <Badge value={r.effective_status} />
                          <small>
                            {r.usable
                              ? "Siap digunakan"
                              : r.lifecycle_committed
                                ? "Akses belum tersedia"
                                : "Perlu rekonsiliasi"}
                          </small>
                        </td>
                        <td className="nowrap">{date(r.expires_at)}</td>
                        <td>
                          <div className="row-actions">
                            {r.effective_status === "active" &&
                            r.lifecycle_committed ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setEditor({ kind: "rotate", record: r })
                                  }
                                >
                                  <RotateCw size={14} /> Rotasi
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    setEditor({ kind: "scopes", record: r })
                                  }
                                  aria-label={`Ubah scope ${r.credential_name}`}
                                >
                                  <ListFilter size={16} />
                                </Button>
                              </>
                            ) : null}
                            {r.effective_status === "active" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setRevoke({ record: r, id: operationId() })
                                }
                                aria-label={`Cabut ${r.credential_name}`}
                              >
                                <Ban size={16} />
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
              <Empty title="Belum ada kredensial">
                Aktifkan aplikasi dan API, lalu terbitkan kunci dengan scope
                yang diperlukan.
              </Empty>
            )}
            <Pager value={data.data?.pagination} onChange={setPage} />
          </DataState>
        )}
      </Card>
      <OperationLookup />
      {editor ? (
        <CredentialEditor
          kind={editor.kind}
          record={editor.record}
          applicationId={appId}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      ) : null}
      {revoke ? (
        <ActionModal
          title="Cabut kredensial?"
          description={`Kunci ${revoke.record.key_id} akan segera ditolak dan secret dihapus dari server. Pencabutan tidak dapat dibatalkan.`}
          danger
          button="Cabut kredensial"
          run={() =>
            api("credentials.revoke", {
              credential_id: revoke.record.credential_id,
              expected_revision: revoke.record.revision,
              operation_id: revoke.id,
            })
          }
          onClose={() => setRevoke(null)}
          onDone={() => {
            setRevoke(null);
            setMessage("Kredensial berhasil dicabut.");
            data.reload();
          }}
        />
      ) : null}
      {secret ? (
        <SecretModal
          title="Secret kredensial baru"
          secret={secret.client_secret}
          details={
            <div className="secret-details">
              <p>
                <strong>Application ID</strong>
                <code>{secret.credential.application_id}</code>
              </p>
              <p>
                <strong>Key ID</strong>
                <code>{secret.credential.key_id}</code>
              </p>
              <p>
                <strong>ID operasi</strong>
                <code>{secret.operation_id}</code>
              </p>
              <p>
                Berlaku hingga {date(secret.credential.expires_at)}. Simpan
                hanya pada server aplikasi klien.
              </p>
            </div>
          }
          onClose={() => setSecret(null)}
        />
      ) : null}
    </>
  );
}
function CredentialEditor({
  kind,
  record,
  applicationId,
  onClose,
  onSaved,
}: {
  kind: "issue" | "rotate" | "scopes";
  record?: CredentialMetadata;
  applicationId: string;
  onClose: () => void;
  onSaved: (result: CredentialResult) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [op] = useState(operationId);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget),
      allowed_scopes = d.getAll("scopes");
    setBusy(true);
    setError("");
    if (!allowed_scopes.length) {
      setError("Pilih setidaknya satu scope.");
      setBusy(false);
      return;
    }
    const options = {
      credential_name: d.get("name"),
      expires_in_seconds: Number(d.get("days")) * 86400,
      allowed_scopes,
    };
    try {
      const data = await api<CredentialResult>(
        `credentials.${kind}`,
        kind === "issue"
          ? { application_id: applicationId, options, operation_id: op }
          : kind === "scopes"
            ? {
                credential_id: record!.credential_id,
                expected_revision: record!.revision,
                allowed_scopes,
                operation_id: op,
              }
            : {
                credential_id: record!.credential_id,
                expected_revision: record!.revision,
                options,
                operation_id: op,
              },
      );
      onSaved(data);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        kind === "issue"
          ? "Terbitkan kredensial"
          : kind === "rotate"
            ? "Rotasi kredensial"
            : "Ubah cakupan akses"
      }
      description={
        kind === "rotate"
          ? "Kunci lama dicabut sebelum kunci baru diterbitkan. Aplikasi klien perlu diperbarui segera."
          : "Berikan cakupan akses minimum yang diperlukan aplikasi."
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        {kind !== "scopes" ? (
          <div className="form-grid">
            <Field label="Nama kredensial">
              <Input
                name="name"
                required
                maxLength={120}
                defaultValue={record?.credential_name}
              />
            </Field>
            <Field
              label="Masa berlaku (hari)"
              hint="1–365 hari sejak diterbitkan."
            >
              <Input
                name="days"
                type="number"
                required
                min={1}
                max={365}
                step={1}
                defaultValue={90}
              />
            </Field>
          </div>
        ) : null}
        <fieldset className="scope-options">
          <legend>Cakupan akses</legend>
          {scopes.map((s) => (
            <label className="check-field" key={s}>
              <input
                type="checkbox"
                name="scopes"
                value={s}
                defaultChecked={record?.allowed_scopes.includes(s) || false}
              />
              <span>
                <strong>{s}</strong>
                <small>{scopeLabels[s]}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <Notice>
          {kind === "rotate"
            ? "Rotasi tidak menyediakan masa tumpang tindih. Bila respons terputus, periksa ID operasi sebelum mencoba lagi."
            : "Secret tidak disimpan pada browser atau localStorage dan tidak dapat ditampilkan ulang."}
        </Notice>
        {error ? <Notice error>{error}</Notice> : null}
        <p className="record-id">
          ID operasi: <code>{op}</code>
        </p>
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
            {busy
              ? "Memproses…"
              : kind === "issue"
                ? "Terbitkan secret"
                : kind === "rotate"
                  ? "Rotasi & cabut kunci lama"
                  : "Simpan scope"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function OperationLookup() {
  const date = useDate();

  const [result, setResult] = useState<{
      operation: Record<string, string>;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Card className="operation-card">
      <h2>Periksa status operasi</h2>
      <p className="muted">
        Gunakan bila respons penerbitan atau perubahan kredensial terputus.
        Secret tidak ditampilkan ulang.
      </p>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setResult(null);
          setError("");
          try {
            setResult(
              await api("operation.get", {
                operation_id: new FormData(e.currentTarget).get("operation_id"),
              }),
            );
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          aria-label="ID operasi"
          name="operation_id"
          required
          placeholder="op_…"
          maxLength={160}
        />
        <Button variant="outline" disabled={busy}>
          {busy ? "Memeriksa…" : "Periksa status"}
        </Button>
      </form>
      {error ? <Notice error>{error}</Notice> : null}
      {result ? (
        <div className="notice">
          <div>
            <strong>Status: {result.operation.state}</strong>
            <p>
              {result.operation.operation_type} • {result.operation.target_id}
            </p>
            <small>{date(result.operation.updated_at)}</small>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
