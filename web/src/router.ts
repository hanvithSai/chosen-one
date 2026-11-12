import { useEffect, useState } from "react";

/** Pages inside the merchant app, in sidebar order. */
export const APP_PAGES = [
  { path: "/app", label: "Overview", icon: "home" },
  { path: "/app/lost", label: "Where you lose", icon: "search" },
  { path: "/app/results", label: "Shopper results", icon: "users" },
  { path: "/app/fixes", label: "Fixes", icon: "wrench" },
  { path: "/app/proof", label: "Before vs after", icon: "chart" },
  { path: "/app/shopper", label: "Try as a shopper", icon: "bot" },
  { path: "/app/connect", label: "Connect agents", icon: "plug" },
] as const;

export type AppPath = (typeof APP_PAGES)[number]["path"];

/** Old deep links (#measure, #fix ...) still work. */
const LEGACY: Record<string, string> = {
  "/measure": "/app/results",
  "/fix": "/app/fixes",
  "/prove": "/app/proof",
  "/chitti": "/app/shopper",
  "/connect": "/app/connect",
};

function currentPath(): string {
  const raw = window.location.hash.replace(/^#/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return LEGACY[path] ?? (path === "/" || path === "" ? "/" : path);
}

/** Tiny hash router: no dependency, works on static hosting and survives refresh. */
export function useRoute(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onChange = () => {
      setPath(currentPath());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return path;
}

export function go(path: string): void {
  window.location.hash = path;
}
