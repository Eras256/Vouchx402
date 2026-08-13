"use client";

import { useTranslations } from "next-intl";
import { Radio } from "lucide-react";
import { useNetwork, type Network } from "@/components/network-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function NetworkSelector({ compact = false }: { compact?: boolean }) {
  const { network, setNetwork } = useNetwork();
  const t = useTranslations("selectors");

  const options: { value: Network; label: string }[] = [
    { value: "testnet", label: t("testnet") },
    { value: "mainnet", label: t("mainnet") },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" aria-label={t("network")} className="gap-1.5 px-2">
            <Radio className="size-4" aria-hidden="true" />
            <span>{network === "mainnet" ? t("mainnet") : t("testnet")}</span>
          </Button>
        }
      />
      <DropdownMenuContent align={compact ? "start" : "end"}>
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => setNetwork(opt.value)}
            aria-current={opt.value === network ? "true" : undefined}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
