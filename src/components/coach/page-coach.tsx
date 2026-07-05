"use client";

import { useCoachPage } from "@/hooks/use-coach";
import { X, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageCoachProps {
  coachKey: string;
  icon: LucideIcon;
  iconClass: string;
  bgClass: string;
  title: string;
  desc: string;
}

export function PageCoach({ coachKey, icon: Icon, iconClass, bgClass, title, desc }: PageCoachProps) {
  const { show, dismiss } = useCoachPage(coachKey);

  if (!show) return null;

  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 mb-4", bgClass)}>
      <div className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className={cn("w-3.5 h-3.5", iconClass)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold", iconClass)}>{title}</p>
        <p className="text-xs mt-0.5 leading-relaxed opacity-80">{desc}</p>
      </div>
      <button onClick={dismiss} className="p-1 rounded-lg hover:bg-white/40 transition-colors shrink-0 mt-0.5" aria-label="Dismiss">
        <X className="w-3.5 h-3.5 opacity-60" />
      </button>
    </div>
  );
}
