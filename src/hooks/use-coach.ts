"use client";

import { useState, useSyncExternalStore } from "react";

function getItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

function setItem(key: string, value: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
}

// Same useSyncExternalStore-over-a-tiny-manual-store approach as
// privacy-context.tsx, replacing useState+useEffect(() => setShow(true),
// []) — reading a "have I seen this before" localStorage flag once on
// mount and setState-ing synchronously inside the effect is exactly the
// react-hooks/set-state-in-effect anti-pattern; this is React's own
// recommended replacement, still landing on the same "false on the server,
// the real value right after hydration" behavior. Keyed per coach-flag
// name since useCoachPage's key is dynamic per caller.
type Store = { cached: boolean | null; listeners: Set<() => void> };
const stores = new Map<string, Store>();

function getStore(key: string): Store {
  let store = stores.get(key);
  if (!store) { store = { cached: null, listeners: new Set() }; stores.set(key, store); }
  return store;
}

function subscribeTo(key: string) {
  return (listener: () => void) => {
    const store = getStore(key);
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  };
}
// "Not yet seen" — true when no localStorage flag has been written for
// this key yet.
function getNeverSeenFor(key: string) {
  return () => {
    const store = getStore(key);
    if (store.cached === null) store.cached = !getItem(key);
    return store.cached;
  };
}
function getServerSnapshot() {
  return false;
}
function markSeen(key: string) {
  setItem(key, "done");
  const store = getStore(key);
  store.cached = false;
  store.listeners.forEach(l => l());
}

export function useCoachWelcome() {
  const key = "fineos_coach_welcome";
  const show = useSyncExternalStore(subscribeTo(key), getNeverSeenFor(key), getServerSnapshot);

  function dismiss() {
    markSeen(key);
  }

  return { show, dismiss };
}

export function useCoachDashboard() {
  const key = "fineos_coach_dashboard";
  const neverSeen = useSyncExternalStore(subscribeTo(key), getNeverSeenFor(key), getServerSnapshot);
  // Overrides the persisted flag once the user starts interacting this
  // session — step advances are plain state updates from next()/skip(),
  // not an effect, so there's nothing to round-trip through localStorage
  // until the tour actually finishes.
  const [manualStep, setManualStep] = useState<number | "done" | null>(null);
  const step = manualStep === "done" ? null : manualStep ?? (neverSeen ? 0 : null);

  function next(total: number) {
    const nextStep = (step ?? 0) + 1;
    if (nextStep >= total) {
      markSeen(key);
      setManualStep("done");
    } else {
      setManualStep(nextStep);
    }
  }

  function skip() {
    markSeen(key);
    setManualStep("done");
  }

  return { step, next, skip };
}

export function useCoachPage(key: string) {
  const storageKey = `fineos_coach_${key}`;
  const show = useSyncExternalStore(subscribeTo(storageKey), getNeverSeenFor(storageKey), getServerSnapshot);

  function dismiss() {
    markSeen(storageKey);
  }

  return { show, dismiss };
}
