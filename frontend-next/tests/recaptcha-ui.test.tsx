import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  await waitFor(() => expect(reset).toHaveBeenCalledWith(4));
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

test("AUDIT late script failure after unmount cannot clear another widget token", async () => {
  const onToken = vi.fn();
  const { Recaptcha } = await import("../src/components/recaptcha");
  const { unmount } = render(
    <Recaptcha
      siteKey={captcha.siteKey}
      nonce={captcha.nonce}
      resetVersion={0}
      onToken={onToken}
    />,
  );
  const late = script.props.onError as () => void;
  unmount();
  onToken.mockClear();
  act(() => late());
  expect(onToken).not.toHaveBeenCalled();
});
test("AUDIT reset exception stays inside the widget and blocks login", async () => {
  const { Recaptcha } = await import("../src/components/recaptcha");
  const onToken = vi.fn();
  const props = { siteKey: captcha.siteKey, nonce: captcha.nonce, onToken };
  const view = render(<Recaptcha {...props} resetVersion={0} />);
  load();
  reset.mockImplementation(() => {
    throw Error("Detached widget");
  });
  expect(() =>
    view.rerender(<Recaptcha {...props} resetVersion={1} />),
  ).not.toThrow();
  expect(screen.getByRole("alert")).toBeTruthy();
});
test("AUDIT changing the site key renders a new widget", async () => {
  const { Recaptcha } = await import("../src/components/recaptcha");
  const onToken = vi.fn();
  const view = render(
    <Recaptcha
      siteKey="old-key"
      nonce={captcha.nonce}
      resetVersion={0}
      onToken={onToken}
    />,
  );
  load();
  view.rerender(
    <Recaptcha
      siteKey="new-key"
      nonce={captcha.nonce}
      resetVersion={0}
      onToken={onToken}
    />,
  );
  expect(
    vi.mocked(window.grecaptcha!.render).mock.calls.at(-1)?.[1].sitekey,
  ).toBe("new-key");
});
test("AUDIT ready API exception produces a recoverable error instead of escaping", () => {
  render(<AuthForm captcha={captcha} />);
  window.grecaptcha!.ready = () => {
    throw Error("API unavailable");
  };
  expect(load).not.toThrow();
  expect(screen.getByRole("alert")).toBeTruthy();
});
test("AUDIT repeated form submits send exactly one verification while pending", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  render(<AuthForm captcha={captcha} />);
  load();
  solve();
  const form = screen.getByLabelText("Username").closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("AUDIT queued ready callbacks cannot render after unmount or with an old site key", async () => {
  const { Recaptcha } = await import("../src/components/recaptcha");
  const queued: (() => void)[] = [];
  window.grecaptcha!.ready = (fn) => {
    queued.push(fn);
  };
  const onToken = vi.fn();
  const view = render(
    <Recaptcha
      siteKey="first-key"
      nonce={captcha.nonce}
      resetVersion={0}
      onToken={onToken}
    />,
  );
  load();
  view.rerender(
    <Recaptcha
      siteKey="second-key"
      nonce={captcha.nonce}
      resetVersion={0}
      onToken={onToken}
    />,
  );
  act(() => queued[0]());
  expect(window.grecaptcha!.render).not.toHaveBeenCalled();
  act(() => queued[1]());
  expect(vi.mocked(window.grecaptcha!.render).mock.calls[0][1].sitekey).toBe(
    "second-key",
  );
  const old = callbacks;
  view.unmount();
  onToken.mockClear();
  act(() => {
    (old.callback as (v: string) => void)("late-token");
    (old["expired-callback"] as () => void)();
    (old["error-callback"] as () => void)();
  });
  expect(onToken).not.toHaveBeenCalled();
});
test("AUDIT callback identity changes do not reset a solved widget", async () => {
  const { Recaptcha } = await import("../src/components/recaptcha");
  const view = render(
    <Recaptcha
      siteKey={captcha.siteKey}
      nonce={captcha.nonce}
      resetVersion={0}
      onToken={() => {}}
    />,
  );
  load();
  reset.mockClear();
  const latest = vi.fn();
  view.rerender(
    <Recaptcha
      siteKey={captcha.siteKey}
      nonce={captcha.nonce}
      resetVersion={0}
      onToken={latest}
    />,
  );
  expect(reset).not.toHaveBeenCalled();
  solve();
  expect(latest).toHaveBeenCalledWith("fresh-token");
});
test("AUDIT malformed token and failed reset cannot re-enable submit with stale callbacks", async () => {
  render(<AuthForm captcha={captcha} />);
  load();
  act(() => {
    (callbacks.callback as (v: unknown) => void)({ bad: true });
  });
  expect(
    (
      screen.getByRole("button", {
        name: /Masuk ke dashboard/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.getByRole("alert")).toBeTruthy();
});
test("AUDIT loading timeout blocks submit and late failures are harmless", async () => {
  vi.useFakeTimers();
  try {
    const view = render(<AuthForm captcha={captcha} />);
    act(() => vi.advanceTimersByTime(15000));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    view.unmount();
    act(() => vi.runOnlyPendingTimers());
  } finally {
    vi.useRealTimers();
  }
});

test("AUDIT failed reset invalidates callbacks from the broken widget", async () => {
  render(<AuthForm captcha={captcha} />);
  load();
  solve();
  const stale = callbacks.callback as (v: string) => void;
  reset.mockImplementation(() => {
    throw Error("invalid client id");
  });
  fireEvent.submit(screen.getByLabelText("Username").closest("form")!);
  await screen.findByText(/Verifikasi keamanan gagal dimuat/);
  act(() => stale("late-solved-token"));
  expect(
    (
      screen.getByRole("button", {
        name: /Masuk ke dashboard/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
