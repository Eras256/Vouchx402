import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const GITHUB_URL = "https://github.com/Eras256/Vouchx402";
const API_URL = "https://vouch402.fly.dev";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-md text-sm text-muted-foreground">{t("tagline")}</p>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("github")}
          </a>
          <Link href="/docs" className="text-muted-foreground transition-colors hover:text-foreground">
            {t("docs")}
          </Link>
          <Link href="/legal" className="text-muted-foreground transition-colors hover:text-foreground">
            {t("legal")}
          </Link>
          <a
            href={`${GITHUB_URL}/blob/master/LICENSE`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("license")}
          </a>
          <a
            href={API_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="data text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("api")}
          </a>
        </nav>

        <p className="text-xs text-muted-foreground">{t("copyright", { year })}</p>
      </div>
    </footer>
  );
}
