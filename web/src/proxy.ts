import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match everything except Next internals, API-like paths, and files
  // with an extension (static assets).
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
