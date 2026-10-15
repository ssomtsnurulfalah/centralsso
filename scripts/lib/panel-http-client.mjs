/** Klien uji HTTP saja. Cookie hanya berada di memori dan tidak dicetak. */
export function createPanelHttpClient(origin, { fetchImpl = fetch } = {}) {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.protocol !== "https:" ||
    url.username ||
    url.password
  )
    throw Object.assign(new Error("Origin uji harus HTTPS."), {
      code: "INVALID_TEST_ORIGIN",
    });
  let cookie = "";
  async function request(path, options = {}) {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("INVALID_TEST_PATH");
    return fetchImpl(origin + path, {
      ...options,
      redirect: "manual",
      signal: AbortSignal.timeout(65000),
      headers: { ...options.headers, ...(cookie ? { Cookie: cookie } : {}) },
    });
  }
  async function panel(action, input = {}) {
    const response = await request("/api/panel", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ action, input }),
    });
    const set =
      response.headers.getSetCookie?.() ||
      [response.headers.get("set-cookie")].filter(Boolean);
    for (const value of set) {
      if (value.startsWith("__Host-central_sso_session="))
        cookie = value.split(";", 1)[0];
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw Object.assign(new Error("Respons uji bukan JSON."), {
        code: "INVALID_TEST_RESPONSE",
      });
    }
    return { status: response.status, body, headers: response.headers };
  }
  return {
    request,
    panel,
    async ok(action, input = {}) {
      const r = await panel(action, input);
      if (r.status !== 200 || r.body.success !== true)
        throw Object.assign(new Error("Operasi uji gagal."), {
          code: r.body.error?.code || "INVALID_TEST_RESPONSE",
          http_status: r.status,
        });
      return r.body.data;
    },
    hasCookie: () => !!cookie && !cookie.endsWith("="),
  };
}
