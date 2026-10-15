import { notFound } from "next/navigation";
import { adminSection } from "@/lib/panel-schema";
export async function AdminPage({ section }: { section: string }) {
  if(!adminSection.safeParse(section).success)notFound();
  // The persistent layout authenticates the initial document. API requests
  // authorize each destination before its private data can be displayed.
  return null;
}
