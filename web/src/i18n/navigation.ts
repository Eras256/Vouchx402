import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware wrappers — use these instead of next/navigation directly
// so links/redirects always carry the current locale prefix.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
