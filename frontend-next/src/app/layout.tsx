import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Central SSO — MTs Nurul Falah",
    template: "%s | Central SSO",
  },
  description: "Pusat identitas dan akses MTs Nurul Falah",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
