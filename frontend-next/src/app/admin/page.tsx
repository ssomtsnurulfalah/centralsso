import { AdminPage } from "@/components/admin-page";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default function Page() {
  return <AdminPage section="dashboard" />;
}
