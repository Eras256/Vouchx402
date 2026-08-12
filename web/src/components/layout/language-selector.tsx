"use client";

import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { usePathname, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const LABELS: Record<string, string> = { en: "English", es: "Español" };

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("selectors");

  return (
    <DropdownMenu>
      {/* Base UI (this shadcn setup uses @base-ui/react, not Radix) takes
          a `render` element instead of Radix's asChild + child pattern. */}
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" aria-label={t("language")} className="gap-1.5 px-2">
            <Languages className="size-4" aria-hidden="true" />
            <span className="uppercase">{locale}</span>
          </Button>
        }
      />
      <DropdownMenuContent align={compact ? "start" : "end"}>
        {routing.locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            render={
              // next-intl's Link swaps locale while preserving the current path
              <Link href={pathname} locale={loc} aria-current={loc === locale ? "true" : undefined}>
                {LABELS[loc] ?? loc}
              </Link>
            }
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
