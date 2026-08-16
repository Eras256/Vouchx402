import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { NetworkProvider } from "@/components/network-provider";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import "./globals.css";

const DESCRIPTION =
  "x402-metered on-chain risk intelligence for autonomous agents on Base, with a built-in proof-of-fulfillment attestation layer.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.vouch402.xyz"),
  title: "Vouch402",
  description: DESCRIPTION,
  openGraph: {
    title: "Vouch402",
    description: DESCRIPTION,
    siteName: "Vouch402",
    type: "website",
    images: ["/opengraph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vouch402",
    description: DESCRIPTION,
    images: ["/opengraph-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfeff" },
    { media: "(prefers-color-scheme: dark)", color: "#080c15" },
  ],
};

// Language is a client-side preference now (LocaleProvider), not a URL
// segment: `lang` starts at the site default (English) and is kept in
// sync on the client as soon as a stored preference (or a switch) is
// read; see locale-provider.tsx.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <LocaleProvider>
          <ThemeProvider>
            <NetworkProvider>
              <div className="flex min-h-screen flex-col">
                <Navbar />
                <main className="flex-1">{children}</main>
                <Footer />
              </div>
            </NetworkProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
