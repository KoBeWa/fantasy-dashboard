"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();
  const item = (href: string, label: string) => {
    const active = pathname === href || pathname?.startsWith(href + "/");
    return (
      <Link
        href={href}
        className={`px-3 py-1 rounded border ${active ? "bg-black text-white" : "bg-white"}`}
      >
        {label}
      </Link>
    );
  };
  return (
    <nav className="flex items-center gap-2">
      {item("/", "Dashboard")}
      {item("/seasons", "Seasons")}
    </nav>
  );
}
