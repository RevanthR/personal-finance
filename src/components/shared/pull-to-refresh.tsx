"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 72;

export function PullToRefresh() {
  const router = useRouter();
  const startY = useRef(0);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pulling = useRef(false);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    router.refresh();
    await new Promise(r => setTimeout(r, 1000));
    setRefreshing(false);
    setPullY(0);
  }, [router]);

  useEffect(() => {
    const scrollEl = document.querySelector("main");
    if (!scrollEl) return;

    const onTouchStart = (e: TouchEvent) => {
      if (scrollEl.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && scrollEl.scrollTop === 0) {
        setPullY(Math.min(dy, THRESHOLD * 1.5));
      } else {
        pulling.current = false;
        setPullY(0);
      }
    };

    const onTouchEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;
      if (pullY >= THRESHOLD) {
        doRefresh();
      } else {
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
  }, [pullY, refreshing, doRefresh]);

  const progress = Math.min(pullY / THRESHOLD, 1);
  const visible = pullY > 4 || refreshing;

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingTop: refreshing ? 12 : Math.max(4, pullY * 0.15) }}
    >
      <div
        className="w-9 h-9 rounded-full bg-white shadow-md border border-border flex items-center justify-center"
        style={{ opacity: refreshing ? 1 : progress }}
      >
        <RefreshCw
          className="w-4 h-4 text-green-600"
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 240}deg)`,
            animation: refreshing ? "spin 0.7s linear infinite" : undefined,
          }}
        />
      </div>
    </div>
  );
}
