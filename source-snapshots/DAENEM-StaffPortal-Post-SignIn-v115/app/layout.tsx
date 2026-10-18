import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DAENEM Staff Portal · Experience Lab",
  description: "Private interactive DAENEM staff and multi-company experience lab. Fictional demo data only.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
