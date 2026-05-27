import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Retail Visual Audit Pilot",
  description: "Operational AI-assisted retail audit workflow."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
