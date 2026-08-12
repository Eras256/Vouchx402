"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Sun, Moon, Monitor } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("selectors");
  // `theme` is typed `string | undefined` specifically because next-themes
  // returns undefined until it's read localStorage client-side — using
  // that directly (rather than a second useState+useEffect just to track
  // "have we mounted yet") avoids an extra render pass and the
  // set-state-in-effect lint rule this project enforces.
  const current = (theme ?? "system") as keyof typeof ICONS;
  const Icon = ICONS[current] ?? Monitor;

  const options: { value: "light" | "dark" | "system"; label: string }[] = [
    { value: "light", label: t("light") },
    { value: "dark", label: t("dark") },
    { value: "system", label: t("system") },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" aria-label={t("theme")} className="gap-1.5 px-2">
            <Icon className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align={compact ? "start" : "end"}>
        {options.map((opt) => {
          const OptIcon = ICONS[opt.value];
          return (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() => setTheme(opt.value)}
              aria-current={opt.value === theme ? "true" : undefined}
              className="gap-2"
            >
              <OptIcon className="size-4" aria-hidden="true" />
              {opt.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
