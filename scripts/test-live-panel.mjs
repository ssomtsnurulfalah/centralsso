/** Jalankan hanya pada staging dengan input privat melalui stdin. */
import { runPanelIntegration } from "./lib/panel-integration-story.mjs";
try {
  let raw = "";
  for await (const part of process.stdin) {
    raw += part;
    if (Buffer.byteLength(raw) > 16384)
      throw Object.assign(new Error(), { code: "INPUT_TOO_LARGE" });
  }
  const input = JSON.parse(raw);
  if (
    input.confirm_staging !== true ||
    Object.keys(input).some(
      (k) =>
        !["confirm_staging", "base_url", "username", "password"].includes(k),
    ) ||
    typeof input.base_url !== "string" ||
    typeof input.username !== "string" ||
    typeof input.password !== "string"
  )
    throw Object.assign(new Error(), { code: "STAGING_CONFIRMATION_REQUIRED" });
  const report = await runPanelIntegration({
    origin: input.base_url,
    username: input.username,
    password: input.password,
  });
  console.log(
    JSON.stringify(
      {
        ...report,
        environment:
          "Deployment HTTPS dan GAS sesuai preflight staging/development",
        live_api_verified: report.success,
        native_spreadsheet_verified: false,
        storage_evidence:
          "Pembacaan ulang melalui API GAS; cocokkan records dengan verifyStage7IntegrationData untuk bukti langsung Spreadsheet.",
      },
      null,
      2,
    ),
  );
  if (!report.success) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({
      success: false,
      error: /^[A-Z_]+$/.test(error?.code || "")
        ? error.code
        : "LIVE_INTEGRATION_FAILED",
    }),
  );
  process.exitCode = 1;
}
