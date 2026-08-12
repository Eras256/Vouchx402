import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Vouch402",
  description:
    "x402-metered on-chain risk intelligence for autonomous agents on Base, with a built-in proof-of-fulfillment attestation layer.",
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
