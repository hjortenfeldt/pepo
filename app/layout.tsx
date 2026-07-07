import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500"],
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
      <head>
        {/* Ikonsæt brugt i prototyperne og adminsystemet (Tabler Icons) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col bg-pepo-su">{children}</body>
    </html>
  );
}
