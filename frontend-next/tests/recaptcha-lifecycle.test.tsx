import { StrictMode } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { test, vi, expect, afterEach } from "vitest";
import { Recaptcha } from "../src/components/recaptcha";
afterEach(() => {
  delete window.grecaptcha;
});
test("actual Next Script cache remounts a widget in StrictMode and isolates old callbacks", async () => {
  const callbacks: ((v: string) => void)[] = [];
  const renderWidget = vi.fn((_host, options) => {
    callbacks.push(options.callback);
    return callbacks.length - 1;
  });
  window.grecaptcha = {
    ready: (fn) => fn(),
    render: renderWidget,
    reset: vi.fn(),
  };
  const firstToken = vi.fn();
  const props = { siteKey: "test-key", nonce: "A".repeat(32), resetVersion: 0 };
  const first = render(<Recaptcha {...props} onToken={firstToken} />);
  await waitFor(() =>
    expect(
      document.querySelector('script[src*="google.com/recaptcha/api.js"]'),
    ).toBeTruthy(),
  );
  await act(async () => {
    document
      .querySelector('script[src*="google.com/recaptcha/api.js"]')!
      .dispatchEvent(new Event("load"));
  });
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));
  first.unmount();
  firstToken.mockClear();
  const secondToken = vi.fn();
  render(
    <StrictMode>
      <Recaptcha {...props} onToken={secondToken} />
    </StrictMode>,
  );
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(2));
  secondToken.mockClear();
  act(() => callbacks[0]("old-token"));
  expect(firstToken).not.toHaveBeenCalled();
  expect(secondToken).not.toHaveBeenCalled();
  act(() => callbacks[1]("new-token"));
  expect(secondToken).toHaveBeenCalledWith("new-token");
});

test("widget reset runs before React detaches its iframe host", async () => {
  let host: HTMLElement | undefined;
  const connectedOnReset: boolean[] = [];
  const reset = vi.fn(() => {
    connectedOnReset.push(host?.isConnected === true);
  });
  window.grecaptcha = {
    ready: (fn) => fn(),
    render: (_host) => {
      host = _host;
      return 0;
    },
    reset,
  };
  const view = render(
    <Recaptcha
      siteKey="another-key"
      nonce={"A".repeat(32)}
      resetVersion={0}
      onToken={() => {}}
    />,
  );
  await waitFor(() =>
    expect(
      document.querySelector('script[src*="google.com/recaptcha/api.js"]'),
    ).toBeTruthy(),
  );
  await act(async () => {
    document
      .querySelector('script[src*="google.com/recaptcha/api.js"]')!
      .dispatchEvent(new Event("load"));
  });
  await waitFor(() => expect(host).toBeTruthy());
  view.unmount();
  expect(reset).toHaveBeenCalledWith(0);
  expect(connectedOnReset.every(Boolean)).toBe(true);
  expect(host?.isConnected).toBe(false);
});
