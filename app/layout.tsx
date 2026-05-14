import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flowstate — Growth Planning Platform",
  description: "Capability assessment and growth planning for ambitious businesses.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)] antialiased">
        {children}
      </body>
    </html>
  );
}
