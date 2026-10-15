/** Preload eksplisit untuk proses Next UJI, bukan import dari source produksi. */
const fixture =
  "https://script.google.com/macros/s/central_sso_stage7_fixture/exec";
if (
  process.env.SSO_TEST_FIXTURE !== "stage7-local-only" ||
  process.env.SSO_GAS_URL !== fixture
)
  throw new Error("Fixture preload menolak konfigurasi non-uji.");
const transport = new URL(process.env.SSO_TEST_TRANSPORT_URL);
if (
  transport.protocol !== "http:" ||
  transport.hostname !== "127.0.0.1" ||
  transport.pathname !== "/" ||
  transport.username ||
  transport.password
)
  throw new Error("Transport uji harus loopback.");
const original = globalThis.fetch;
globalThis.fetch = async function (input, options) {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url === fixture) return original(transport.origin + "/gas", options);
  const content = new URL(url);
  if (
    content.origin === "https://script.googleusercontent.com" &&
    content.pathname === "/stage7-fixture" &&
    /^[a-f0-9-]{36}$/.test(content.searchParams.get("receipt") || "")
  )
    return original(
      transport.origin + "/content/" + content.searchParams.get("receipt"),
      options,
    );
  return original(input, options);
};
