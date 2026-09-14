import "./globals.css";

import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AccountBar } from "@/app/components/AccountNav/AccountBar";
import { Easter } from "@/app/components/Easter";
import { Footer } from "@/app/components/Footer";
import { NoScriptAlert } from "@/components/NoScriptAlert";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Google Analytics 4 measurement ID for this app's GA property.
const GA_MEASUREMENT_ID = "G-STVFHMQS05";

// Site-wide defaults only. Per-page title/description/canonical/social tags
// are built by pageMetadata() in lib/site.ts — deliberately NOT inherited from
// here, since Next replaces nested metadata objects wholesale rather than
// merging them. title.default covers the routes that cannot export metadata at
// all (app/unauthorized.tsx is a client component).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | 東京都立小石川中等教育学校`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen flex flex-col">
        <NoScriptAlert />
        <AccountBar />
        <main className="flex-1"> {children}</main>
        <Easter />
        <Footer />
        <Easter />
      </body>
      {/* Google tag (gtag.js) via @next/third-parties — the official Next.js
          integration. Skipped on PR preview deployments: IS_PR_PREVIEW is
          injected at runtime by the deploy infra and read here server-side, so
          it must NOT be NEXT_PUBLIC_ (those inline at build time). */}
      {GA_MEASUREMENT_ID && process.env.IS_PR_PREVIEW !== "true" && (
        <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
      )}
    </html>
  );
}
