import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/components/theme-provider";
import { NetworkProvider } from "@/components/network-provider";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import "../globals.css";

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

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <NextIntlClientProvider>
          <ThemeProvider>
            <NetworkProvider>
              <div className="flex min-h-screen flex-col">
                <Navbar />
                <main className="flex-1">{children}</main>
                <Footer />
              </div>
            </NetworkProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
