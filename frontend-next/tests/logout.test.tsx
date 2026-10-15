import { test, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
function setup() {
  const actions: string[] = [];
  let rejectLogout!: (error: Error) => void;
  const fetchMock = vi.fn((_url, options) => {
    const body = JSON.parse(options.body);
    actions.push(body.action);
    // A pending preferences request must not delay confirmation or logout.
    if (body.action === "preferences.get")
      return new Promise<Response>(() => {});
    if (body.action === "logout")
      return new Promise<Response>((_resolve, reject) => {
        rejectLogout = reject;
      });
    throw new Error("Unexpected action");
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <Shell user={user} section="dashboard">
      <p>Konten halaman</p>
    </Shell>,
  );
  return {
    actions,
    fail() {
      rejectLogout(new Error("Layanan belum tersedia."));
    },
  };
}
function open() {
  fireEvent.click(screen.getByRole("button", { name: "Keluar dari sesi" }));
  return screen.getByRole("dialog", { name: "Keluar dari aplikasi?" });
}
test("logout opens a centered shared dialog and cancel/close/Escape make no logout request", () => {
  const b = setup();
  let dialog = open();
  expect(dialog.classList.contains("dialog")).toBe(true);
  expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
  expect(b.actions).toEqual(["preferences.get"]);
  fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  dialog = open();
  fireEvent.click(within(dialog).getByRole("button", { name: "Tutup dialog" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  dialog = open();
  fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(b.actions).toEqual(["preferences.get"]);
});
test("confirmation dispatches logout immediately, shows pending state and prevents duplicate/close", () => {
  const b = setup(),
    dialog = open(),
    button = within(dialog).getByRole("button", { name: "Ya, keluar" });
  fireEvent.click(button);
  // Assert before resolving any data/API promise or advancing any timer.
  expect(b.actions).toEqual(["preferences.get", "logout"]);
  expect(within(dialog).getByRole("status").textContent).toContain(
    "Sedang keluar",
  );
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(
    (within(dialog).getByRole("button", { name: "Batal" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (
      within(dialog).getByRole("button", {
        name: "Tutup dialog",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(button);
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(b.actions.filter((a) => a === "logout")).toHaveLength(1);
});
test("failed logout restores controls for retry and does not claim success", async () => {
  const b = setup(),
    dialog = open();
  fireEvent.click(within(dialog).getByRole("button", { name: "Ya, keluar" }));
  b.fail();
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Logout belum dapat dikonfirmasi",
  );
  expect(screen.queryByText(/Cookie lokal sudah dihapus/)).toBeNull();
  const retry = within(dialog).getByRole("button", { name: "Ya, keluar" });
  expect((retry as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(retry);
  expect(b.actions.filter((a) => a === "logout")).toHaveLength(2);
});
