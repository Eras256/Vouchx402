"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Menu, Sun, Moon, Monitor } from "lucide-react";
import Link from "next/link";
import { useLocalePreference } from "@/components/locale-provider";
import { useNetwork, type Network } from "@/components/network-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV_LINKS } from "./nav-links";

const LANGUAGE_LABELS: Record<string, string> = { en: "English", es: "Español" };

/**
 * The main responsive design challenge on this page: three independent
 * selectors (language/network/theme) that would otherwise compete for
 * space with the nav links on small screens. Collapsed into one sheet
 * instead of three separate dropdowns fighting for room.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");
  const tSel = useTranslations("selectors");
  const { locale, setLocale, locales } = useLocalePreference();
  const { network, setNetwork } = useNetwork();
  const { theme, setTheme } = useTheme();

  const networkOptions: { value: Network; label: string }[] = [
    { value: "testnet", label: tSel("testnet") },
    { value: "mainnet", label: tSel("mainnet") },
  ];
  const themeOptions: { value: "light" | "dark" | "system"; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: tSel("light"), Icon: Sun },
    { value: "dark", label: tSel("dark"), Icon: Moon },
    { value: "system", label: tSel("system"), Icon: Monitor },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={t("menu")}>
            <Menu className="size-5" aria-hidden="true" />
          </Button>
        }
      />
      <SheetContent side="right" className="w-[300px] sm:w-[340px]">
        <SheetHeader>
          <SheetTitle>{t("menu")}</SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col gap-1 px-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              {t(link.labelKey)}
            </Link>
          ))}
        </nav>

        <Separator className="my-4" />

        <div className="flex flex-col gap-4 px-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{tSel("language")}</p>
            <div className="flex gap-2">
              {locales.map((loc) => (
                <Button
                  key={loc}
                  variant={loc === locale ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setLocale(loc)}
                >
                  {LANGUAGE_LABELS[loc] ?? loc}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{tSel("network")}</p>
            <div className="flex gap-2">
              {networkOptions.map((opt) => (
                <Button
                  key={opt.value}
                  variant={opt.value === network ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setNetwork(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{tSel("theme")}</p>
            <div className="flex gap-2">
              {themeOptions.map(({ value, label, Icon }) => (
                <Button
                  key={value}
                  variant={value === theme ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => setTheme(value)}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
