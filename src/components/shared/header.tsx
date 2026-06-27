"use client";

import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, LogOut, Settings, IndianRupee, Eye, EyeOff, BookOpen } from "lucide-react";
import Link from "next/link";
import { usePrivacy } from "@/contexts/privacy-context";
import { useState } from "react";
import { GuidePanel } from "./guide-sheet";

interface HeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function Header({ user }: HeaderProps) {
  const { hidden, toggleHidden } = usePrivacy();
  const [guideOpen, setGuideOpen] = useState(false);
  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "U";

  return (
    <>
    <header className="h-14 border-b bg-white flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="md:hidden flex items-center gap-2">
        <div className="w-7 h-7 bg-zinc-900 rounded-lg flex items-center justify-center shrink-0">
          <IndianRupee className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-bold text-foreground">FinanceOS</span>
      </div>
      <div className="hidden md:block" />

      <div className="flex items-center gap-3">
        <button
          onClick={() => setGuideOpen(true)}
          title="App guide"
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <BookOpen className="w-5 h-5" />
        </button>
        <button
          onClick={toggleHidden}
          title={hidden ? "Show numbers" : "Hide numbers"}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          {hidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
        <button className="text-slate-400 hover:text-slate-600">
          <Bell className="w-5 h-5" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 outline-none">
              <Avatar className="w-8 h-8 cursor-pointer">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
                <AvatarFallback className="bg-zinc-900 text-white text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              <p className="font-medium text-sm">{user.name}</p>
              <p className="text-xs text-muted-foreground font-normal truncate">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 cursor-pointer"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    <GuidePanel open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
