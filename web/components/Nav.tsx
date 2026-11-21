"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ admin }: { admin: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/", label: "Overview" },
    { href: "/shows", label: "Showtimes" },
    { href: "/health", label: "Health" },
    { href: "/me", label: "My alerts" },
    ...(admin
      ? [
          { href: "/settings", label: "Settings" },
          { href: "/people", label: "People" },
        ]
      : []),
  ];
  return (
    <nav className="nav" aria-label="Main">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={(i.href === "/" ? path === "/" : path.startsWith(i.href)) ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
