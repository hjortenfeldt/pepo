import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Pepo – Bliv freelancer",
  description:
    "Opret din freelancerprofil hos Pepo og få adgang til vagter inden for service og hospitality.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da" className={`${inter.variable} h-full antialiased`}>
      {/* Ikonsæt (Tabler) renderes som rigtige SVG-komponenter via
          components/Icon.tsx, ligesom i prototyperne — ikke som webfont. */}
      <body className="min-h-full flex flex-col bg-pepo-su">{children}</body>
    </html>
  );
}
