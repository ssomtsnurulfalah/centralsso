import { test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Shell } from "../src/components/shell";
import type { Identity } from "../src/lib/panel-schema";
const user: Identity = {
  sso_user_id: "usr_admin",
  username: "admin.utama",
  full_name: "Admin Uji",
  global_role: "super_admin",
  account_status: "active",
  identity_version: 1,
};
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          system_name: "Central SSO",
          institution_name: "Institusi Uji",
          display_timezone: "Asia/Jakarta",
        },
      }),
    ),
  );
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
function shell() {
  return render(
    <Shell user={user} section="dashboard">
      <p>Konten halaman</p>
    </Shell>,
  );
}
test("sidebar collapses and expands without refetching data; icon links retain accessible names", () => {
  shell();
  const sidebar = document.getElementById("admin-sidebar"),
    button = screen.getByRole("button", { name: "Ciutkan sidebar" });
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(button.getAttribute("aria-controls")).toBe("admin-sidebar");
  fireEvent.click(button);
  expect(
    document
      .querySelector(".app-shell")
      ?.classList.contains("sidebar-collapsed"),
  ).toBe(true);
  expect(
    screen
      .getByRole("button", { name: "Perluas sidebar" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(
    screen.getByRole("link", { name: "Pengguna" }).getAttribute("title"),
  ).toBe("Pengguna");
  expect(localStorage.getItem("central-sso.sidebar.v1")).toBe("collapsed");
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Perluas sidebar" }));
  expect(document.getElementById("admin-sidebar")).toBe(sidebar);
  expect(
    document
      .querySelector(".app-shell")
      ?.classList.contains("sidebar-collapsed"),
  ).toBe(false);
  expect(localStorage.getItem("central-sso.sidebar.v1")).toBe("expanded");
  expect(fetch).toHaveBeenCalledTimes(1);
});
test("stored sidebar preference survives remount and storage failure never breaks the control", () => {
  localStorage.setItem("central-sso.sidebar.v1", "collapsed");
  shell();
  expect(screen.getByRole("button", { name: "Perluas sidebar" })).toBeTruthy();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  fireEvent.click(screen.getByRole("button", { name: "Perluas sidebar" }));
  expect(screen.getByRole("button", { name: "Ciutkan sidebar" })).toBeTruthy();
});
test("mobile drawer stays full-size independently of desktop collapse and closed drawer is inert", async () => {
  localStorage.setItem("central-sso.sidebar.v1", "collapsed");
  let listener: () => void = () => {};
  const query = {
    matches: true,
    addEventListener: vi.fn((_event, fn) => {
      listener = fn;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", () => query);
  const { unmount } = shell();
  const sidebar = document.getElementById("admin-sidebar")!;
  expect(sidebar.hasAttribute("inert")).toBe(true);
  expect(sidebar.getAttribute("aria-hidden")).toBe("true");
  const menu = screen.getByRole("button", { name: "Buka navigasi" });
  fireEvent.click(menu);
  expect(menu.getAttribute("aria-expanded")).toBe("true");
  expect(sidebar.hasAttribute("inert")).toBe(false);
  expect(sidebar.classList.contains("is-open")).toBe(true);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(sidebar.classList.contains("is-open")).toBe(false);
  expect(document.activeElement).toBe(menu);
  fireEvent.click(menu);
  query.matches = false;
  fireEvent(window, new Event("resize"));
  act(() => listener());
  await waitFor(() =>
    expect(sidebar.classList.contains("is-open")).toBe(false),
  );
  expect(sidebar.hasAttribute("inert")).toBe(false);
  unmount();
  expect(query.removeEventListener).toHaveBeenCalled();
});
