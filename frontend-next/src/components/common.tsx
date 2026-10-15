"use client";
import { useEffect, useRef, type ReactNode } from "react";
import {
  AlertCircle,
  LoaderCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export { Button, Input };
export function Badge({ value }: { value: string }) {
  const labels: Record<string, string> = {
    active: "Aktif",
    inactive: "Nonaktif",
    suspended: "Ditangguhkan",
    archived: "Diarsipkan",
    super_admin: "Super Admin",
    admin: "Admin",
    user: "Pengguna",
    success: "Berhasil",
    failure: "Gagal",
    revoked: "Dicabut",
    expired: "Kedaluwarsa",
  };
  return (
    <span className={`badge badge-${value}`}>{labels[value] || value}</span>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "notice-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <AlertCircle size={17} />
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title = "Belum ada data",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <h3>{title}</h3>
      <p>{children || "Data yang sesuai akan tampil di sini."}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={23} /> Memuat data dari Central SSO…
    </div>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
      aria-describedby={description ? "dialog-description" : undefined}
    >
      <div className="dialog-head">
        <div>
          <h2 id="dialog-title">{title}</h2>
          {description ? <p id="dialog-description">{description}</p> : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClose}
          aria-label="Tutup dialog"
        >
          <X size={19} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export type Pagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
};
export function Pager({
  value,
  onChange,
}: {
  value?: Pagination;
  onChange: (page: number) => void;
}) {
  if (!value) return null;
  return (
    <div className="pager">
      <span>
        {value.total.toLocaleString("id-ID")} data • Halaman {value.page} dari{" "}
        {Math.max(1, value.total_pages)}
      </span>
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={value.page <= 1}
          onClick={() => onChange(value.page - 1)}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft size={16} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!value.has_next}
          onClick={() => onChange(value.page + 1)}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
