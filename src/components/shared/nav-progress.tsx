"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPath = useRef(pathname + searchParams.toString());

  useEffect(() => {
    const current = pathname + searchParams.toString();
    if (current !== prevPath.current) {
      prevPath.current = current;
      // Page arrived — complete the bar
      setWidth(100);
      timerRef.current = setTimeout(() => setVisible(false), 300);
    }
  }, [pathname, searchParams]);

  // Kick off progress bar on any link click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const link = (e.target as HTMLElement).closest("a");
      if (!link || !link.href) return;
      try {
        const url = new URL(link.href);
        if (url.origin !== location.origin) return;
        if (url.pathname === pathname) return;
      } catch { return; }

      if (timerRef.current) clearTimeout(timerRef.current);
      setWidth(20);
      setVisible(true);
      // Fake crawl to 80%
      timerRef.current = setTimeout(() => setWidth(65), 200);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 z-50 h-0.5 bg-zinc-900 transition-all duration-300 ease-out"
      style={{ width: `${width}%`, opacity: width === 100 ? 0 : 1 }}
    />
  );
}
