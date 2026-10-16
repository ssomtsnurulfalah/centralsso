"use client";
import {
  PreferencesProvider,
  usePreferences,
  timezoneLabel,
} from "./preferences";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { AdminLink } from "./admin-link";
import type { Identity } from "@/lib/panel-schema";
import { api, errorMessage } from "@/lib/client";
import { Badge, Button, Modal, Notice } from "./common";
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
    [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false),
    [confirmLogout, setConfirmLogout] = useState(false),
    [error, setError] = useState("");
  const logoutPending = useRef(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    try {
      setCollapsed(
        localStorage.getItem("central-sso.sidebar.v1") === "collapsed",
      );
    } catch {
      /* Optional device preference. */
    }
    if (!window.matchMedia) return;
    const query = window.matchMedia("(max-width: 740px)");
    const update = () => {
      setMobile(query.matches);
      setOpen(false);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(
        "central-sso.sidebar.v1",
        next ? "collapsed" : "expanded",
      );
    } catch {
      /* Continue without storage. */
    }
  }
  function closeMenu() {
    setOpen(false);
    menuButton.current?.focus();
  }
  useEffect(() => {
    if (!mobile || !open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobile, open]);
  const current = sections.find((v) => v.id === section)!;
  const links = sections.filter(
    (v) =>
      user.global_role === "super_admin" ||
      ["dashboard", "users", "profile"].includes(v.id),
  );
  async function logout() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setBusy(true);
    setError("");
    try {
      await api("logout");
      window.location.replace("/login");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      logoutPending.current = false;
    }
  }
  function closeLogout() {
    if (logoutPending.current) return;
    setConfirmLogout(false);
    setError("");
  }
  return (
    <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Lewati ke konten
      </a>
      {open ? (
        <button
          className="nav-overlay"
          onClick={closeMenu}
          aria-label="Tutup navigasi"
        />
      ) : null}
      <aside
        id="admin-sidebar"
        className={`sidebar ${open ? "is-open" : ""}`}
        inert={mobile && !open}
        aria-hidden={mobile && !open ? true : undefined}
      >
        <AdminLink
          className="brand"
          href="/admin"
          aria-label={`${prefs.system_name} — ${prefs.institution_name}`}
          title={prefs.system_name}
        >
          <span className="brand-symbol">
            <Fingerprint size={25} />
          </span>
          <span className="brand-copy">
            {prefs.system_name}
            <small>{prefs.institution_name}</small>
          </span>
        </AdminLink>
        <Button
          className="nav-close"
          variant="ghost"
          size="icon"
          aria-label="Tutup navigasi"
          onClick={closeMenu}
        >
          <X size={18} />
        </Button>
        <div className="nav-label">RUANG ADMINISTRASI</div>
        <nav aria-label="Navigasi utama">
          {links.map(({ id, label, icon: Icon }) => (
            <AdminLink
              key={id}
              href={id === "dashboard" ? "/admin" : `/admin/${id}`}
              onClick={() => setOpen(false)}
              aria-current={id === section ? "page" : undefined}
              className={`nav-item ${id === section ? "active" : ""}`}
              aria-label={label}
              title={label}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === section ? (
                <ChevronRight className="nav-current" size={15} />
              ) : null}
            </AdminLink>
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
              className="sidebar-toggle"
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
              title={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
              aria-controls="admin-sidebar"
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <PanelLeftOpen size={21} />
              ) : (
                <PanelLeftClose size={21} />
              )}
            </Button>
            <Button
              ref={menuButton}
              variant="ghost"
              size="icon"
              className="nav-toggle"
              onClick={() => setOpen(true)}
              aria-label="Buka navigasi"
              aria-controls="admin-sidebar"
              aria-expanded={open}
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
              onClick={() => {
                setError("");
                setConfirmLogout(true);
              }}
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
              <h1 id="page-title" tabIndex={-1}>
                {current.label}
              </h1>
              <p>{current.description}</p>
            </div>
            <Badge value={user.global_role} />
          </div>
          {children}
          <footer className="page-footer">
            <span>
              © {prefs.institution_name} • {prefs.system_name}
            </span>
            <span>Waktu tampilan: {timezoneLabel(prefs.display_timezone)}</span>
          </footer>
        </main>
      </div>
      {confirmLogout ? (
        <Modal
          title="Keluar dari aplikasi?"
          description="Sesi Anda akan diakhiri. Anda perlu masuk kembali untuk mengakses aplikasi."
          onClose={closeLogout}
          busy={busy}
        >
          <div className="form-stack">
            {error ? (
              <Notice error>
                {error} Logout belum dapat dikonfirmasi. Silakan coba lagi.
              </Notice>
            ) : null}
            {busy ? (
              <p role="status">
                <LoaderCircle className="spin" size={18} aria-hidden="true" />{" "}
                Sedang keluar…
              </p>
            ) : null}
            <div className="form-actions" aria-busy={busy}>
              <Button
                type="button"
                variant="outline"
                onClick={closeLogout}
                disabled={busy}
                autoFocus
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={logout}
                disabled={busy}
              >
                {busy ? "Memproses…" : "Ya, keluar"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
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
