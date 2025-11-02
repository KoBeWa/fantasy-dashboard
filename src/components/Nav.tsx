"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();

  const Item = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href || pathname?.startsWith(href + "/");
    return (
      <Link
        href={href}
        className={`px-3 py-1 rounded border transition-colors ${
          active
            ? "bg-black text-white border-black"
            : "bg-white text-black hover:bg-gray-100 border-gray-300"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="flex items-center gap-2">
      <Item href="/" label="Dashboard" />
      <Item href="/seasons" label="Seasons" />
      <Item href="/records" label="Records" />
      <Item href="/medals" label="Medals" /> {/* 🏅 neu hinzugefügt */}
    </nav>
  );
}

