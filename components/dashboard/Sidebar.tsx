"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

// Shared nav for all 5 dashboard pages (PLAN-06..10). Each branch only adds its own app/(dashboard)/<route>/page.tsx.
const NAV: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/overview", label: "Overview", icon: <IconGrid /> },
  { href: "/investigation", label: "Investigation", icon: <IconSearch /> },
  { href: "/workflow", label: "Workflow", icon: <IconFlow /> },
  { href: "/automation", label: "Automation", icon: <IconBolt /> },
  { href: "/simulator", label: "Impact Simulator", icon: <IconSliders /> },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  // null = follow screen size (icons only below lg); true/false = user's explicit choice.
  const [collapsed, setCollapsed] = useState<boolean | null>(null);

  const pick = (expanded: string, iconsOnly: string, auto: string) =>
    collapsed === null ? auto : collapsed ? iconsOnly : expanded;
  const label = pick("inline", "hidden", "hidden lg:inline");
  const block = pick("block", "hidden", "hidden lg:block");
  const flex = pick("flex", "hidden", "hidden lg:flex");
  const onlyCollapsed = pick("hidden", "flex", "flex lg:hidden");

  const toggle = () => {
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    setCollapsed(collapsed === null ? wide : !collapsed);
  };

  const openSearch = useCallback(() => {
    setCollapsed(false);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
    router.push(q ? `/investigation?q=${encodeURIComponent(q)}` : "/investigation");
  };

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col gap-5 overflow-x-hidden overflow-y-auto bg-gray-900 px-3 py-5 text-white transition-[width] duration-200 ${pick("w-64", "w-16", "w-16 lg:w-64")}`}
    >
      <div className={`flex items-center gap-2 px-1 ${pick("flex-row", "flex-col", "flex-col lg:flex-row")}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold">IQ</span>
        <span className={`whitespace-nowrap text-lg font-semibold tracking-tight ${label}`}>InvoiceIQ AI</span>
        <button
          type="button"
          onClick={toggle}
          aria-label="Toggle sidebar"
          title="Collapse / expand sidebar"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-gray-300 transition-colors hover:bg-brand hover:text-white ${pick("ml-auto", "", "lg:ml-auto")}`}
        >
          <span className={`transition-transform ${pick("", "rotate-180", "rotate-180 lg:rotate-0")}`}>
            <IconChevronLeft />
          </span>
        </button>
      </div>

      <div className={`items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2.5 ${flex}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
          <IconBuilding />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] text-gray-300">Finance workspace</p>
          <p className="truncate text-sm font-medium">Invoice-to-Pay</p>
        </div>
      </div>

      <form role="search" onSubmit={onSearch} className={`items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 focus-within:border-brand ${flex}`}>
        <span className="text-gray-300"><IconSearch /></span>
        <input
          ref={searchRef}
          name="q"
          type="search"
          placeholder="Search invoices…"
          aria-label="Search anomalies"
          className="w-full min-w-0 bg-transparent text-sm text-white placeholder:text-gray-300 focus:outline-none"
        />
        <kbd className="whitespace-nowrap rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-gray-300">Ctrl K</kbd>
      </form>
      <button
        type="button"
        onClick={openSearch}
        aria-label="Search"
        title="Search (Ctrl K)"
        className={`items-center justify-center rounded-xl px-3 py-2.5 text-gray-300 hover:bg-white/10 hover:text-white ${onlyCollapsed}`}
      >
        <IconSearch />
      </button>

      <nav className="flex flex-col gap-1">
        <p className={`px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-gray-500 ${block}`}>Navigation</p>
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 whitespace-nowrap rounded-xl p-1.5 text-sm transition-colors ${
                active ? "bg-white/10 font-medium text-white" : "text-gray-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  active ? "bg-brand text-white" : "bg-white/5 group-hover:bg-white/10"
                }`}
              >
                {item.icon}
              </span>
              <span className={label}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={`mt-auto rounded-2xl bg-white/5 p-4 text-xs text-gray-300 ${block}`}>
        Findings are recommendations for human review — not confirmed fraud or losses.
      </div>

      <div className={`border-t border-white/10 pt-4 ${pick("", "mt-auto", "mt-auto lg:mt-0")}`}>
        <p className={`mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-gray-500 ${block}`}>User account</p>
        <div className="flex items-center gap-3 px-0.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-600">
            FM
          </span>
          <div className={`min-w-0 ${block}`}>
            <p className="truncate text-sm font-medium">Finance Manager</p>
            <p className="truncate text-xs text-gray-300">Demo account</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      {children}
    </svg>
  );
}

function IconGrid() {
  return <Svg><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Svg>;
}
function IconSearch() {
  return <Svg><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
}
function IconFlow() {
  return <Svg><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M6 9v3a3 3 0 0 0 3 3h6" /></Svg>;
}
function IconBolt() {
  return <Svg><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></Svg>;
}
function IconSliders() {
  return <Svg><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></Svg>;
}
function IconChevronLeft() {
  return <Svg><path d="m15 18-6-6 6-6" /></Svg>;
}
function IconBuilding() {
  return <Svg><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" /></Svg>;
}
