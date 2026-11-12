"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/app/admin/login/actions";

const LINKS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/games", label: "Games" },
  { href: "/admin/athletes", label: "Athletes" },
  { href: "/admin/clips", label: "Clips" },
];

/** Top navigation shown on every admin page except the sign-in page. */
export function AdminNav() {
  const pathname = usePathname() ?? "";
  if (pathname.startsWith("/admin/login")) return null;

  return (
    <nav
      aria-label="Admin"
      className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-2 text-sm">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={
                "whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors " +
                (active ? "bg-accent text-white" : "text-foreground hover:bg-black/5")
              }
            >
              {link.label}
            </Link>
          );
        })}
        <form action={logout} className="ml-auto pl-2">
          <button type="submit" className="whitespace-nowrap px-2 py-1.5 text-muted hover:text-accent hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
