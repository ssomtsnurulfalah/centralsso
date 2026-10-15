import { z } from "zod";
export const role = z.enum(["super_admin", "admin", "user"]);
export const adminSection=z.enum(["dashboard","users","applications","credentials","logs","settings","profile"]);
export const status = z.enum(["active", "inactive", "suspended"]);
export const identity = z.object({
  sso_user_id: z.string().regex(/^[a-zA-Z0-9_.:-]{1,160}$/),
  username: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  full_name: z.string().min(1).max(40000),
  global_role: z.enum(["super_admin", "admin"]),
  account_status: z.literal("active"),
  identity_version: z.number().int().positive(),
});
export type Identity = z.infer<typeof identity>;
export const userInput = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
    full_name: z.string().trim().min(1).max(160),
    email: z.email().max(254),
    global_role: role,
    status,
  })
  .strict();
export const userRecord = userInput.extend({
  user_id: z.string().regex(/^[a-zA-Z0-9_.:-]{1,160}$/),
  created_at: z.iso.datetime({ precision: 3 }),
  updated_at: z.iso.datetime({ precision: 3 }),
  last_login: z.union([z.iso.datetime({ precision: 3 }), z.literal("")]),
  password_changed_at: z.iso.datetime({ precision: 3 }),
  identity_version: z.number().int().positive(),
  archived_at: z.union([z.iso.datetime({ precision: 3 }), z.literal("")]),
});
export type UserRecord = z.infer<typeof userRecord>;
export const pagination = z
  .object({
    page: z.number().int().min(1).max(1000000),
    page_size: z.number().int().min(1).max(100),
    total: z.number().int().min(0).max(20000),
    total_pages: z.number().int().min(0),
    has_next: z.boolean(),
  })
  .refine(
    (p) =>
      p.total_pages === Math.ceil(p.total / p.page_size) &&
      p.has_next === p.page < p.total_pages,
  );
export const userPage = z.object({ items: z.array(userRecord), pagination });
export const logRecord = z.object({
  timestamp: z.iso.datetime({ precision: 3 }),
  result: z.enum(["success", "failure"]),
  log_id: z.string().optional(),
  audit_id: z.string().optional(),
  user_id: z.string().optional(),
  actor_user_id: z.string().optional(),
  application_id: z.string().optional(),
  failure_reason_code: z.string().optional(),
  request_id: z.string().optional(),
  action: z.string().optional(),
  target_type: z.string().optional(),
  target_id: z.string().optional(),
  metadata: z.string(),
});
export type LogRecord = z.infer<typeof logRecord>;
export const logPage = z.object({ items: z.array(logRecord), pagination });
export const dashboard = z.object({
  users_total: z.number().int().nonnegative(),
  users_active: z.number().int().nonnegative(),
  users_archived: z.number().int().nonnegative(),
  applications_total: z.number().int().nonnegative().nullable(),
  auth_success_24h: z.number().int().nonnegative().nullable(),
  auth_failure_24h: z.number().int().nonnegative().nullable(),
  recent_logs: z.array(logRecord).max(6),
  generated_at: z.iso.datetime({ precision: 3 }),
});
export const settings = z.object({
  items: z.array(
    z.object({
      setting_key: z.string(),
      setting_value: z.string(),
      description: z.string(),
      updated_at: z.string(),
    }),
  ),
});
export type Setting = z.infer<typeof settings>["items"][number];
export const filters = z
  .object({
    query: z.string().max(100).optional(),
    status: z.string().max(20).optional(),
    result: z.enum(["all", "success", "failure"]).optional(),
    page: z.number().int().min(1).max(1000000).optional(),
    page_size: z.number().int().min(1).max(100).optional(),
  })
  .strict();
export const id = z.string().regex(/^[a-zA-Z0-9_.:-]{1,160}$/);
export const version = z.number().int().positive();
export const password = z
  .string()
  .min(1)
  .refine((v) => Array.from(v).length <= 1024);
