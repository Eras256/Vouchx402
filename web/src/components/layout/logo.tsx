import { Link } from "@/i18n/navigation";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill="#0052FF" />
        <path d="M7 12.5L10.5 16L17 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Vouch402</span>
    </Link>
  );
}
