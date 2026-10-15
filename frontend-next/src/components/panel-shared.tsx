"use client";
import { useState, type ReactNode } from "react";
import { Search, RefreshCw, Copy, Check } from "lucide-react";
import { errorMessage } from "@/lib/client";
import { Button, Field, Input, Loading, Notice, Modal } from "./common";
export function DataState({
  loading,
  error,
  reload,
  children,
}: {
  loading: boolean;
  error?: string;
  reload: () => void;
  children: ReactNode;
}) {
  if (loading) return <Loading />;
  if (error)
    return (
      <Notice error>
        {error}{" "}
        <Button variant="outline" size="sm" onClick={reload}>
          Coba kembali
        </Button>
      </Notice>
    );
  return <>{children}</>;
}
export function FilterBar({
  onSearch,
  children,
  placeholder = "Cari data…",
  onReload,
}: {
  onSearch: (query: string) => void;
  children?: ReactNode;
  placeholder?: string;
  onReload: () => void;
}) {
  return (
    <div className="filterbar">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(String(new FormData(e.currentTarget).get("query") || ""));
        }}
        className="search-form"
      >
        <Search size={17} />
        <Input
          aria-label="Kata pencarian"
          name="query"
          maxLength={100}
          placeholder={placeholder}
        />
        <Button type="submit" variant="outline" size="sm">
          Cari
        </Button>
      </form>
      <div className="filter-controls">
        {children}
        <Button
          variant="outline"
          size="icon"
          onClick={onReload}
          aria-label="Muat ulang data"
        >
          <RefreshCw size={17} />
        </Button>
      </div>
    </div>
  );
}
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div
      className="table-wrap"
      role="region"
      tabIndex={0}
      aria-label="Tabel data, geser untuk kolom berikutnya"
    >
      {children}
    </div>
  );
}
export function SecretModal({
  title,
  secret,
  details,
  onClose,
}: {
  title: string;
  secret: string;
  details?: ReactNode;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={title}
      description="Nilai ini hanya ditampilkan dalam hasil operasi saat ini."
      onClose={onClose}
    >
      <div className="form-stack">
        <Notice>
          Simpan melalui saluran aman. Nilai rahasia tidak dapat dibaca kembali
          setelah dialog ditutup.
        </Notice>
        {details}
        <Field label="Nilai rahasia">
          <Input
            className="mono"
            value={secret}
            readOnly
            autoComplete="off"
            onFocus={(e) => e.currentTarget.select()}
          />
        </Field>
        {error ? <Notice error>{error}</Notice> : null}
        <div className="form-actions">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              } catch {
                setError(
                  "Penyalinan otomatis tidak tersedia. Pilih dan salin nilai secara manual.",
                );
              }
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
            {copied ? "Tersalin" : "Salin nilai"}
          </Button>
          <Button onClick={onClose}>Selesai dan tutup</Button>
        </div>
      </div>
    </Modal>
  );
}
export function ActionModal({
  title,
  description,
  button = "Konfirmasi",
  danger = false,
  run,
  onClose,
  onDone,
  children,
}: {
  title: string;
  description: string;
  button?: string;
  danger?: boolean;
  run: () => Promise<unknown>;
  onClose: () => void;
  onDone: (data: unknown) => void;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={title}
      description={description}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="form-stack">
        {children}
        {error ? <Notice error>{error}</Notice> : null}
        <div className="form-actions">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Batal
          </Button>
          <Button
            variant={danger ? "destructive" : "default"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                onDone(await run());
              } catch (e) {
                setError(errorMessage(e));
                setBusy(false);
              }
            }}
          >
            {busy ? "Memproses…" : button}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
