import {
  Bot,
  ChartNoAxesCombined,
  House,
  Plug,
  Search,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Store } from "../../api";
import { APP_PAGES, go } from "../../router";

const ICONS: Record<string, LucideIcon> = {
  home: House,
  search: Search,
  users: Users,
  wrench: Wrench,
  chart: ChartNoAxesCombined,
  bot: Bot,
  plug: Plug,
};

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-left"
      aria-label="ChosenOne home"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-ink text-sm font-bold text-white">
        C
      </span>
      <span className="text-lg font-semibold tracking-tight">
        Chosen<span className="text-clay-500">One</span>
      </span>
    </button>
  );
}

export function Shell({
  path,
  store,
  children,
}: {
  path: string;
  store?: Store;
  children: ReactNode;
}) {
  const current = APP_PAGES.find((p) => p.path === path) ?? APP_PAGES[0];
  return (
    <div className="min-h-screen bg-[#faf7f3] text-ink lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="border-b border-clay-100 bg-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Logo onClick={() => go("/")} />
          <div className="rounded-lg bg-clay-50 px-3 py-2 text-xs text-stone-600 max-lg:hidden lg:mt-6">
            <p className="font-semibold text-ink">{store?.merchant.name ?? "Your shop"}</p>
            <p>
              {store ? `${store.products} listings · catalog v${store.catalogVersion}` : "Loading…"}
            </p>
          </div>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0"
          aria-label="Merchant app"
        >
          {APP_PAGES.map((page) => {
            const Icon = ICONS[page.icon]!;
            const active = page.path === current.path;
            return (
              <button
                key={page.path}
                onClick={() => go(page.path)}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-clay-500/10 text-clay-700"
                    : "text-stone-600 hover:bg-clay-50 hover:text-ink"
                }`}
              >
                <Icon className="size-4" aria-hidden />
                {page.label}
              </button>
            );
          })}
        </nav>
        <p className="mt-8 hidden px-5 text-xs leading-relaxed text-stone-500 lg:block">
          Demo shop with recorded AI shopper runs. Payments use the PayPal sandbox.
        </p>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-clay-100 bg-white/70 px-6 py-4 backdrop-blur">
          <h1 className="text-xl font-semibold tracking-tight">{current.label}</h1>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
            {store?.mode === "replay" ? "Recorded demo" : "Live"}
          </span>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
