import { act, fireEvent, render, screen } from "@testing-library/react";
import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { AuthForm } from "../src/components/auth-form";
const script = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock("next/script", () => ({
  default: (props: Record<string, unknown>) => {
    script.props = props;
    return null;
  },
}));
let callbacks: Record<string, unknown>;
let reset: ReturnType<typeof vi.fn<(id: number) => void>>;
beforeEach(() => {
  reset = vi.fn();
  window.grecaptcha = {
    ready: (fn) => fn(),
    render: vi.fn((_element, options) => {
      callbacks = options;
      return 4;
    }),
    reset,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Kredensial tidak valid.",
          },
        },
        { status: 401 },
      ),
    ),
  );
});
afterEach(() => {
  delete window.grecaptcha;
  vi.unstubAllGlobals();
});
const captcha = {
  enabled: true,
  siteKey: "test-site-key",
  nonce: "A".repeat(32),
};
function load() {
  act(() => {
    (script.props.onReady as () => void)();
  });
}
function solve() {
  act(() => {
    (callbacks.callback as (token: string) => void)("fresh-token");
  });
}
test("login requires solved checkbox, sends token, resets challenge after failed password", async () => {
  render(<AuthForm captcha={captcha} />);
  const submit = screen.getByRole("button", { name: /Masuk ke dashboard/ });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  expect(script.props.nonce).toBe(captcha.nonce);
  load();
  solve();
  expect((submit as HTMLButtonElement).disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "admin.utama" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "correct-password" },
  });
  fireEvent.click(submit);
  await screen.findByText("Kredensial tidak valid.");
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  expect(reset).toHaveBeenCalledWith(4);
  const input = JSON.parse(
    vi.mocked(fetch).mock.calls[0][1]?.body as string,
  ).input;
  expect(input.captchaToken).toBe("fresh-token");
});
test("expiry removes token and blocks submit until another solution", () => {
  render(<AuthForm captcha={captcha} />);
  load();
  solve();
  const submit = screen.getByRole("button", { name: /Masuk ke dashboard/ });
  expect((submit as HTMLButtonElement).disabled).toBe(false);
  act(() => {
    (callbacks["expired-callback"] as () => void)();
  });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  solve();
  expect((submit as HTMLButtonElement).disabled).toBe(false);
});
test("script error is visible and cannot bypass captcha", () => {
  render(<AuthForm captcha={captcha} />);
  act(() => {
    (script.props.onError as () => void)();
  });
  expect(screen.getByText(/Verifikasi keamanan gagal dimuat/)).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: /Masuk ke dashboard/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
test("configuration error disables login and reset form does not load captcha", () => {
  const { unmount } = render(
    <AuthForm captcha={{ ...captcha, configurationError: true }} />,
  );
  expect(screen.getByText(/Konfigurasi reCAPTCHA belum lengkap/)).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: /Masuk ke dashboard/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  unmount();
  render(<AuthForm reset captcha={captcha} />);
  expect(screen.queryByLabelText("Verifikasi reCAPTCHA")).toBeNull();
});
