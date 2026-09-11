import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { SITE } from "@/lib/content";

/**
 * One typeface for the whole site. Hierarchy comes from size, weight and
 * tracking rather than a second family -- a grotesque with a real weight range
 * reads more deliberate than Inter paired with a geometric display face, and
 * it drops a font request.
 */
const archivo = Archivo({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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
      data-scroll-behavior="smooth"
      className={`${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-[var(--fg)]">
        {children}
      </body>
    </html>
  );
}
