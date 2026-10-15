import { createDirectoryHandler } from "../../../../../lib/server/directory-http.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = createDirectoryHandler("getUserById");
