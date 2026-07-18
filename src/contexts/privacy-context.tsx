"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

type PrivacyContextType = {
  hidden: boolean;
  toggleHidden: () => void;
};

const PrivacyContext = createContext<PrivacyContextType>({
  hidden: false,
  toggleHidden: () => {},
});

// A tiny manual external store instead of useState+useEffect(() =>
// setHidden(...), []) — that pattern (read localStorage, setState once on
// mount) triggers react-hooks/set-state-in-effect (a real cascading-render
// anti-pattern), and useSyncExternalStore is React's own recommended
// replacement for exactly this "avoid SSR/client hydration mismatch while
// reading a browser-only value" case. `cached` is computed lazily (not at
// module load) so it only ever reads localStorage on the client, after
// hydration; `getServerSnapshot` keeps the server-rendered HTML at the
// same default the old mounted-flag pattern used.
const STORAGE_KEY = "financeos_privacy";
const listeners = new Set<() => void>();
let cached: boolean | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot(): boolean {
  if (cached === null) cached = localStorage.getItem(STORAGE_KEY) === "1";
  return cached;
}
function getServerSnapshot(): boolean {
  return false;
}
function setHiddenValue(next: boolean) {
  cached = next;
  localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  listeners.forEach(l => l());
}

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggleHidden() {
    setHiddenValue(!hidden);
  }

  return (
    <PrivacyContext.Provider value={{ hidden, toggleHidden }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export const usePrivacy = () => useContext(PrivacyContext);
