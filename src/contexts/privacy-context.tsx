"use client";

import { createContext, useContext, useState, useEffect } from "react";

type PrivacyContextType = {
  hidden: boolean;
  toggleHidden: () => void;
};

const PrivacyContext = createContext<PrivacyContextType>({
  hidden: false,
  toggleHidden: () => {},
});

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(localStorage.getItem("financeos_privacy") === "1");
  }, []);

  function toggleHidden() {
    setHidden((h) => {
      const next = !h;
      localStorage.setItem("financeos_privacy", next ? "1" : "0");
      return next;
    });
  }

  return (
    <PrivacyContext.Provider value={{ hidden, toggleHidden }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export const usePrivacy = () => useContext(PrivacyContext);
