import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createUser,
  panelCall,
  services,
  validatedSession,
} from "@/lib/server/panel";
import { readLimited } from "@/lib/server/gas-client.mjs";
import {
  checkOrigin,
  cookieName,
  cookieOptions,
  safeError,
} from "@/lib/server/web-security.mjs";
import * as s from "@/lib/panel-schema";
import { validatePanelData } from "@/lib/panel-contract";
import { verifyRecaptcha } from "@/lib/server/recaptcha.mjs";
import type {
  ApplicationInput,
  CredentialOptions,
} from "@/lib/server/application-registry.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const envelope = z
  .object({
    action: z.string().max(60),
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
const mutation = z.object({
  user_id: s.id,
  expected_version: s.version,
  operation_id: s.id,
});
function reply(
  action: string,
  data: unknown,
  input: Record<string, unknown> = {},
) {
  return NextResponse.json(
    { success: true, data: validatePanelData(action, data, input) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(
      request,
      process.env.SSO_APP_ORIGIN,
      process.env.NODE_ENV === "production",
    );
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      throw Object.assign(new Error(), { code: "VALIDATION_ERROR" });
    const { action, input } = envelope.parse(
      JSON.parse(await readLimited(request, 32768, "VALIDATION_ERROR")),
    );
    const jar = await cookies(),
      name = cookieName(process.env.NODE_ENV === "production"),
      opts = cookieOptions(process.env.NODE_ENV === "production");
    if (action === "login") {
      const p = z
        .object({
          username: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
          password: s.password,
          captchaToken: z.string().max(4096).optional(),
        })
        .strict()
        .parse(input);
      await verifyRecaptcha(p.captchaToken);
      const result = await services().auth.loginAdministrator(
        p.username,
        p.password,
      );
      jar.set(
        name,
        result.sessionToken,
        cookieOptions(process.env.NODE_ENV === "production", result.expiresAt),
      );
      return reply(action, { redirect: "/admin" });
    }
    if (action === "reset.complete") {
      const p = z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          password: s.password,
        })
        .strict()
        .parse(input);
      await services().auth.completeReset(p.token, p.password);
      return reply(action, { redirect: "/login?changed=1" });
    }
    if (action === "logout") {
      try {
        const token = jar.get(name)?.value;
        if (token) await services().auth.logout(token);
      } finally {
        jar.set(name, "", { ...opts, expires: new Date(0) });
      }
      return reply(action, { redirect: "/login" });
    }
    const { token, user } = await validatedSession();
    const { auth, registry } = services();
    const superOnly = [
      "apps.list",
      "apps.create",
      "apps.update",
      "apps.disable",
      "credentials.list",
      "credentials.issue",
      "credentials.rotate",
      "credentials.revoke",
      "credentials.scopes",
      "operation.get",
      "logs.list",
      "settings.get",
      "settings.update",
      "reset.issue",
      "integration.preflight",
    ];
    if (superOnly.includes(action) && user.global_role !== "super_admin")
      throw Object.assign(new Error(), { code: "PERMISSION_DENIED" });
    let data: unknown;
    switch (action) {
      case "page.access": {
        const p = z.object({ section: s.adminSection }).strict().parse(input);
        data = {
          section: p.section,
          user,
          allowed:
            user.global_role === "super_admin" ||
            ["dashboard", "users", "profile"].includes(p.section),
        };
        break;
      }
      case "integration.preflight":
        z.object({}).strict().parse(input);
        data = await panelCall(
          token,
          "panel.integration.preflight",
          {},
          z.object({
            environment: z.enum(["development", "staging", "production"]),
            schema_version: z.literal("1"),
            integration_version: z.literal(1),
          }),
        );
        break;
      case "preferences.get":
        z.object({}).strict().parse(input);
        data = await panelCall(
          token,
          "panel.preferences.get",
          {},
          z.object({
            system_name: z.string(),
            institution_name: z.string(),
            display_timezone: z.enum([
              "Asia/Jakarta",
              "Asia/Makassar",
              "Asia/Jayapura",
              "UTC",
            ]),
          }),
        );
        break;
      case "dashboard":
        z.object({}).strict().parse(input);
        data = await panelCall(token, "panel.dashboard", {}, s.dashboard);
        break;
      case "users.list":
        data = await panelCall(
          token,
          "panel.users.list",
          { filters: s.filters.parse(input) },
          s.userPage,
        );
        break;
      case "users.create": {
        const p = z
          .object({
            user: s.userInput,
            password: s.password,
            operation_id: s.id,
          })
          .strict()
          .parse(input);
        data = await createUser(token, p.user, p.password, p.operation_id);
        break;
      }
      case "users.update": {
        const p = mutation
          .extend({ patch: s.userInput.partial() })
          .strict()
          .parse(input);
        data = await panelCall(
          token,
          "panel.users.update",
          p,
          z.object({
            user: s.userRecord,
            reauthentication_required: z.boolean(),
            operation_id: z.string(),
          }),
        );
        break;
      }
      case "users.archive":
        data = await panelCall(
          token,
          "panel.users.archive",
          mutation.strict().parse(input),
          z.object({
            user: s.userRecord,
            reauthentication_required: z.boolean(),
            operation_id: z.string(),
          }),
        );
        break;
      case "profile.get":
        z.object({}).strict().parse(input);
        data = await panelCall(
          token,
          "panel.profile.get",
          {},
          z.object({ user: s.userRecord }),
        );
        break;
      case "profile.update": {
        const p = z
          .object({
            patch: s.userInput.pick({ full_name: true, email: true }),
            expected_version: s.version,
            operation_id: s.id,
          })
          .strict()
          .parse(input);
        data = await panelCall(
          token,
          "panel.profile.update",
          p,
          z.object({
            user: s.userRecord,
            reauthentication_required: z.literal(true),
            operation_id: z.string(),
          }),
        );
        break;
      }
      case "password.change": {
        const p = z.object({ password: s.password }).strict().parse(input);
        data = await auth.replacePassword(token, p.password);
        jar.set(name, "", { ...opts, expires: new Date(0) });
        break;
      }
      case "reset.issue":
        data = await auth.issueReset(
          token,
          z.object({ user_id: s.id }).strict().parse(input).user_id,
        );
        break;
      case "apps.list":
        data = await registry.listApplications(
          token,
          s.filters.parse(input) as Parameters<
            typeof registry.listApplications
          >[1],
        );
        break;
      case "apps.create": {
        const p = z
          .object({
            application: z.record(z.string(), z.unknown()),
            operation_id: s.id,
          })
          .strict()
          .parse(input);
        data = await registry.createApplication(
          token,
          p.application as unknown as ApplicationInput,
          p.operation_id,
        );
        break;
      }
      case "apps.update": {
        const p = z
          .object({
            application_id: s.id,
            expected_version: s.version,
            patch: z.record(z.string(), z.unknown()),
            operation_id: s.id,
          })
          .strict()
          .parse(input);
        data = await registry.updateApplication(
          token,
          p.application_id,
          p.expected_version,
          p.patch as Partial<ApplicationInput>,
          p.operation_id,
        );
        break;
      }
      case "apps.disable": {
        const p = z
          .object({
            application_id: s.id,
            expected_version: s.version,
            operation_id: s.id,
          })
          .strict()
          .parse(input);
        data = await registry.disableApplication(
          token,
          p.application_id,
          p.expected_version,
          p.operation_id,
        );
        break;
      }
      case "credentials.list": {
        const p = z
          .object({
            application_id: s.id,
            page: z.number().int().positive().optional(),
          })
          .strict()
          .parse(input);
        data = await registry.listCredentials(token, p.application_id, {
          page: p.page,
        });
        break;
      }
      case "credentials.issue": {
        const p = z
          .object({
            application_id: s.id,
            options: z.record(z.string(), z.unknown()),
            operation_id: s.id,
          })
          .strict()
          .parse(input);
        data = await registry.generateClientCredential(
          token,
          p.application_id,
          p.options as unknown as CredentialOptions,
          p.operation_id,
        );
        break;
      }
      case "credentials.rotate":
      case "credentials.revoke":
      case "credentials.scopes": {
        const p = z
          .object({
            credential_id: s.id,
            expected_revision: z.string().regex(/^[a-f0-9]{64}$/),
            operation_id: s.id,
            options: z.record(z.string(), z.unknown()).optional(),
            allowed_scopes: z
              .array(z.enum(["auth:verify", "directory:read", "user:status"]))
              .optional(),
          })
          .strict()
          .parse(input);
        data =
          action === "credentials.rotate"
            ? await registry.rotateClientCredential(
                token,
                p.credential_id,
                p.expected_revision,
                p.options as Partial<CredentialOptions>,
                p.operation_id,
              )
            : action === "credentials.revoke"
              ? await registry.revokeClientCredential(
                  token,
                  p.credential_id,
                  p.expected_revision,
                  p.operation_id,
                )
              : await registry.updateCredentialScopes(
                  token,
                  p.credential_id,
                  p.expected_revision,
                  z
                    .array(
                      z.enum(["auth:verify", "directory:read", "user:status"]),
                    )
                    .min(1)
                    .max(3)
                    .parse(p.allowed_scopes),
                  p.operation_id,
                );
        break;
      }
      case "operation.get":
        data = await registry.getOperationStatus(
          token,
          z.object({ operation_id: s.id }).strict().parse(input).operation_id,
        );
        break;
      case "logs.list": {
        const p = z
          .object({
            kind: z.enum(["authentication", "audit"]),
            filters: s.filters,
          })
          .strict()
          .parse(input);
        data = await panelCall(token, "panel.logs.list", p, s.logPage);
        break;
      }
      case "settings.get":
        z.object({}).strict().parse(input);
        data = await panelCall(token, "panel.settings.get", {}, s.settings);
        break;
      case "settings.update": {
        const p = z
          .object({
            setting_key: z.enum([
              "system_name",
              "institution_name",
              "display_timezone",
            ]),
            setting_value: z.string().min(1).max(160),
            expected_value: z.string(),
          })
          .strict()
          .parse(input);
        data = await panelCall(
          token,
          "panel.settings.update",
          p,
          z.object({
            setting: z.object({
              setting_key: z.string(),
              setting_value: z.string(),
              description: z.string(),
              updated_at: z.string(),
            }),
          }),
        );
        break;
      }
      default:
        throw Object.assign(new Error(), { code: "VALIDATION_ERROR" });
    }
    data = validatePanelData(action, data, input);
    if (
      (action === "profile.update" ||
        action === "users.update" ||
        action === "users.archive") &&
      (data as { reauthentication_required?: boolean })
        .reauthentication_required
    )
      jar.set(name, "", { ...opts, expires: new Date(0) });
    return reply(action, data, input);
  } catch (error) {
    const e = safeError(
      error instanceof z.ZodError || error instanceof SyntaxError
        ? { code: "VALIDATION_ERROR" }
        : error,
    );
    if (e.code === "UNAUTHENTICATED") {
      const jar = await cookies();
      jar.set(cookieName(process.env.NODE_ENV === "production"), "", {
        ...cookieOptions(process.env.NODE_ENV === "production"),
        expires: new Date(0),
      });
    }
    return NextResponse.json(
      {
        success: false,
        error: {
          code: e.code,
          message: e.message,
          ...("operation_id" in e ? { operation_id: e.operation_id } : {}),
        },
        request_id: randomUUID(),
      },
      { status: e.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
