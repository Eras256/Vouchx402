"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { MainnetConfirmDialog } from "@/components/mainnet-confirm-dialog";

export type Network = "testnet" | "mainnet";

const STORAGE_KEY = "vouch402-network";
// Fired locally after every write so same-tab subscribers re-render too:
// the browser's own "storage" event only fires in *other* tabs/windows.
const LOCAL_EVENT = "vouch402-network-change";

function isNetwork(v: string | null): v is Network {
  return v === "testnet" || v === "mainnet";
}

function getSnapshot(): Network {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isNetwork(stored) ? stored : "testnet";
}

// Server (and the client's very first render, before hydration) has no
// localStorage, testnet is also the correct default here regardless
// (7d: casual visitors shouldn't spend real money by accident), so there
// is no mismatch to paper over.
function getServerSnapshot(): Network {
  return "testnet";
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCAL_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCAL_EVENT, callback);
  };
}

function setStoredNetwork(next: Network) {
  window.localStorage.setItem(STORAGE_KEY, next);
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

interface NetworkContextValue {
  network: Network;
  setNetwork: (network: Network) => void;
}

const NetworkContext = createContext<NetworkContextValue | undefined>(undefined);

/**
 * Controls which network the interactive demo (checkpoint 7d) pays on.
 * The live stats/activity sections (7c) always show mainnet regardless
 * of this selector; see DECISION_LOG.md on why `/v1/metrics` needed
 * network filtering before that could be trusted at all.
 *
 * Built on `useSyncExternalStore` (React's actual primitive for
 * subscribing to state that lives outside React, e.g. localStorage):
 * not a useState+useEffect pair, which is the officially-flagged
 * anti-pattern for exactly this "sync from an external source" case.
 */
export function NetworkProvider({ children }: { children: ReactNode }) {
  const network = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Switching *to* mainnet means the Try It demo (checkpoint 7d) will
  // spend real funds on the next payment. Intercepted here, once, so
  // every caller of setNetwork (the desktop selector, the mobile menu)
  // gets the confirmation for free without duplicating it per caller.
  const [pendingMainnet, setPendingMainnet] = useState(false);

  function requestNetworkChange(next: Network) {
    if (next === "mainnet" && network !== "mainnet") {
      setPendingMainnet(true);
      return;
    }
    setStoredNetwork(next);
  }

  return (
    <NetworkContext.Provider value={{ network, setNetwork: requestNetworkChange }}>
      {children}
      <MainnetConfirmDialog
        open={pendingMainnet}
        onOpenChange={setPendingMainnet}
        onConfirm={() => setStoredNetwork("mainnet")}
      />
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within a NetworkProvider");
  return ctx;
}
