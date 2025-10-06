import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from 'sonner';
// NOTE: Avoid network fetch for Google Fonts at build time.
// Use a CSS fallback font class (tailwind's font-sans) to keep builds offline-safe.

export const metadata: Metadata = {
  title: "Coaches Dashboard",
  description: "Manage your competitors and track their progress",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`font-sans bg-meta-dark text-meta-light min-h-screen`}>
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
