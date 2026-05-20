import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { SITE } from "@/lib/content";

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const display = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.cubeconsulting.org"),
  title: {
    default: `${SITE.name} · ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description:
    "CUBE Consulting is a student-run business, engineering, and design consulting organization at the University of Illinois at Urbana-Champaign.",
  openGraph: {
    title: `${SITE.name} · ${SITE.tagline}`,
    description:
      "Student-run consulting at UIUC. Business, engineering, and design solutions for startups and established firms.",
    siteName: SITE.name,
    type: "website",
  },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-[var(--fg)]">
        {children}
      </body>
    </html>
  );
}
