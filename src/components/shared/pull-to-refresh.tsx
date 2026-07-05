"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 72;

export function PullToRefresh() {
  const router = useRouter();

  // Mutable state in refs so event handlers never become stale
  const startYRef    = useRef(0);
  const pullYRef     = useRef(0);
  const pullingRef   = useRef(false);
  const refreshingRef = useRef(false);

  // React state only drives the visual
  const [pullY, setPullY]       = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const scrollEl = document.querySelector("main");
    if (!scrollEl) return;

    const onTouchStart = (e: TouchEvent) => {
      if (scrollEl.scrollTop <= 0) {
        startYRef.current = e.touches[0].clientY;
        pullingRef.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0 && scrollEl.scrollTop <= 0) {
        const clamped = Math.min(dy, THRESHOLD * 1.5);
        pullYRef.current = clamped;
        setPullY(clamped);
      } else {
        pullingRef.current = false;
        pullYRef.current = 0;
        setPullY(0);
      }
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      if (pullYRef.current >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        pullYRef.current = 0;
        setPullY(0);
        router.refresh();
        setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
        }, 1200);
      } else {
        pullYRef.current = 0;
        setPullY(0);
      }
    };

    scrollEl.addEventListener("touchstart", onTouchStart, { passive: true });
    scrollEl.addEventListener("touchmove", onTouchMove, { passive: true });
    scrollEl.addEventListener("touchend", onTouchEnd);
    return () => {
      scrollEl.removeEventListener("touchstart", onTouchStart);
      scrollEl.removeEventListener("touchmove", onTouchMove);
      scrollEl.removeEventListener("touchend", onTouchEnd);
    };
  }, [router]); // router is stable; all mutable values are in refs

  const progress = Math.min(pullY / THRESHOLD, 1);
  const visible  = pullY > 4 || refreshing;

  if (!visible) return null;

  // The indicator must sit below the iOS status bar.
  // viewportFit=cover + statusBarStyle=black-translucent means top-0 is
  // behind the hardware status bar — offset by env(safe-area-inset-top).
  const translateY = refreshing ? 10 : Math.min(pullY * 0.55, 38);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{
        paddingTop: `calc(env(safe-area-inset-top) + ${translateY}px)`,
      }}
    >
      <div
        className="w-9 h-9 rounded-full bg-white shadow-lg border border-border flex items-center justify-center"
        style={{ opacity: refreshing ? 1 : Math.max(0.25, progress) }}
      >
        <RefreshCw
          className="w-4 h-4 text-emerald-600"
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 240}deg)`,
            animation: refreshing ? "spin 0.7s linear infinite" : undefined,
          }}
        />
      </div>
    </div>
  );
}
