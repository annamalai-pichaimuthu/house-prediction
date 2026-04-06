"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BarChart3, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/",                   label: "Home",            icon: Home },
  { href: "/value-estimator",    label: "Value Estimator", icon: TrendingUp,  accent: "text-blue-600"    },
  { href: "/market-analysis",    label: "Market Analysis", icon: BarChart3,   accent: "text-emerald-600" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <nav
        className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6"
        aria-label="Main navigation"
      >
        <span className="font-bold text-slate-800 text-sm tracking-wide mr-2" aria-hidden="true">
          🏠 HousingAI
        </span>

        {links.map(({ href, label, icon: Icon, accent }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors",
                active
                  ? cn("bg-slate-100", accent ?? "text-slate-900")
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              )}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
