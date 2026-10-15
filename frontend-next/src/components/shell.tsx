"use client";
import {
  PreferencesProvider,
  usePreferences,
  timezoneLabel,
} from "./preferences";
import { useState, type ReactNode } from "react";
import {
  Fingerprint,
  LayoutDashboard,
  Users,
  AppWindow,
  KeyRound,
  ScrollText,
  Settings,
  UserRound,
  LogOut,
  Menu,
  ChevronRight,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Identity } from "@/lib/panel-schema";
import { api, errorMessage } from "@/lib/client";
import { Badge, Button, Notice } from "./common";
export const sections = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Gambaran identitas dan aktivitas institusi.",
  },
  {
    id: "users",
    label: "Pengguna",
    icon: Users,
    description: "Kelola identitas pengguna pusat.",
  },
  {
    id: "applications",
    label: "Aplikasi",
    icon: AppWindow,
    description: "Daftarkan dan kelola akses aplikasi.",
  },
  {
    id: "credentials",
    label: "Kredensial API",
    icon: KeyRound,
    description: "Kelola kunci dan cakupan akses aplikasi.",
  },
  {
    id: "logs",
    label: "Log aktivitas",
    icon: ScrollText,
    description: "Telusuri autentikasi dan perubahan administrasi.",
  },
  {
    id: "settings",
    label: "Pengaturan",
    icon: Settings,
    description: "Konfigurasi dan kebijakan Central SSO.",
  },
  {
    id: "profile",
    label: "Profil saya",
    icon: UserRound,
    description: "Kelola profil dan keamanan akun Anda.",
  },
];
function ShellBody({
  user,
  section,
  children,
}: {
  user: Identity;
  section: string;
  children: ReactNode;
}) {
  const { value: prefs } = usePreferences();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = sections.find((v) => v.id === section)!;
  const links = sections.filter(
    (v) =>
      user.global_role === "super_admin" ||
      ["dashboard", "users", "profile"].includes(v.id),
  );
  async function logout() {
    setBusy(true);
    try {
      await api("logout");
      window.location.assign("/login");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Lewati ke konten
      </a>
      {open ? (
        <button
          className="nav-overlay"
          onClick={() => setOpen(false)}
          aria-label="Tutup navigasi"
        />
      ) : null}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <a className="brand" href="/admin">
          <span className="brand-symbol">
            <Fingerprint size={25} />
          </span>
          <span>
            {prefs.system_name}
            <small>{prefs.institution_name}</small>
          </span>
        </a>
        <Button
          className="nav-close"
          variant="ghost"
          size="icon"
          aria-label="Tutup navigasi"
          onClick={() => setOpen(false)}
        >
          <X size={18} />
        </Button>
        <div className="nav-label">RUANG ADMINISTRASI</div>
        <nav aria-label="Navigasi utama">
          {links.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={id === "dashboard" ? "/admin" : `/admin/${id}`}
              onClick={() => setOpen(false)}
              aria-current={id === section ? "page" : undefined}
              className={`nav-item ${id === section ? "active" : ""}`}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === section ? <ChevronRight size={15} /> : null}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={20} />
          <strong>Identitas yang terkelola</strong>
          <p>Setiap akses mengikuti status akun dan hak administrator.</p>
        </div>
        <div className="sidebar-bottom">
          <span className="version-dot" /> Central SSO <span>V3.1</span>
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <div className="topbar-left">
            <Button
              variant="ghost"
              size="icon"
              className="nav-toggle"
              onClick={() => setOpen(true)}
              aria-label="Buka navigasi"
            >
              <Menu size={22} />
            </Button>
            <span className="breadcrumb">
              Administrasi <ChevronRight size={14} />{" "}
              <strong>{current.label}</strong>
            </span>
          </div>
          <div className="topbar-user">
            <span className="avatar">
              {user.full_name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.full_name}</strong>
              <small>
                {user.global_role === "super_admin"
                  ? "Super Admin"
                  : "Administrator"}
              </small>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              disabled={busy}
              aria-label="Keluar dari sesi"
            >
              <LogOut size={18} />
            </Button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">CENTRAL SSO / ADMINISTRASI</div>
              <h1>{current.label}</h1>
              <p>{current.description}</p>
            </div>
            <Badge value={user.global_role} />
          </div>
          {error ? (
            <Notice error>
              {error} Cookie lokal sudah dihapus bila proses logout terputus;
              buka halaman masuk kembali.
            </Notice>
          ) : null}
          {children}
          <footer className="page-footer">
            <span>
              © {prefs.institution_name} • {prefs.system_name}
            </span>
            <span>Waktu tampilan: {timezoneLabel(prefs.display_timezone)}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export function Shell(props: {
  user: Identity;
  section: string;
  children: ReactNode;
}) {
  return (
    <PreferencesProvider>
      <ShellBody {...props} />
    </PreferencesProvider>
  );
}
