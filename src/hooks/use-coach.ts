"use client";

import { useState, useEffect } from "react";

function getItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

function setItem(key: string, value: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
}

export function useCoachWelcome() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!getItem("fineos_coach_welcome")) setShow(true);
  }, []);

  function dismiss() {
    setItem("fineos_coach_welcome", "done");
    setShow(false);
  }

  return { show, dismiss };
}

export function useCoachDashboard() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (!getItem("fineos_coach_dashboard")) setStep(0);
  }, []);

  function next(total: number) {
    setStep((s) => {
      const next = (s ?? 0) + 1;
      if (next >= total) {
        setItem("fineos_coach_dashboard", "done");
        return null;
      }
      return next;
    });
  }

  function skip() {
    setItem("fineos_coach_dashboard", "done");
    setStep(null);
  }

  return { step, next, skip };
}

export function useCoachPage(key: string) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!getItem(`fineos_coach_${key}`)) setShow(true);
  }, [key]);

  function dismiss() {
    setItem(`fineos_coach_${key}`, "done");
    setShow(false);
  }

  return { show, dismiss };
}
