import type { ReactNode } from "react";
import { requireSession } from "@/lib/server/panel";
import { AdminWorkspace } from "@/components/admin-workspace";
export default async function AdminLayout({children}:{children:ReactNode}) {
  const {user}=await requireSession();
  return <AdminWorkspace user={user}>{children}</AdminWorkspace>;
}
