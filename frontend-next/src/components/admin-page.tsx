import { notFound } from "next/navigation";
import { requireSession } from "@/lib/server/panel";
import { Shell } from "./shell";
import { Panel } from "./panel";
import { Notice } from "./common";
export async function AdminPage({ section }: { section: string }) {
  if (
    ![
      "dashboard",
      "users",
      "applications",
      "credentials",
      "logs",
      "settings",
      "profile",
    ].includes(section)
  )
    notFound();
  const { user } = await requireSession();
  const denied =
    user.global_role !== "super_admin" &&
    !["dashboard", "users", "profile"].includes(section);
  return (
    <Shell user={user} section={section}>
      {denied ? (
        <Notice error>Halaman ini hanya tersedia untuk Super Admin.</Notice>
      ) : (
        <Panel section={section} user={user} />
      )}
    </Shell>
  );
}
