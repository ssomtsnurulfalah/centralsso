import { AdminPage } from "@/components/admin-page";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  return <AdminPage section={(await params).section} />;
}
