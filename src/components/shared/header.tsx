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
import { LogOut, Settings, IndianRupee, Eye, EyeOff, BookOpen, Sparkles, Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivacy } from "@/contexts/privacy-context";
import { useState } from "react";
import { GuidePanel } from "./guide-sheet";
import { useImportsBadge } from "@/lib/use-imports-badge";

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
  const pathname = usePathname();
  const importsBadge = useImportsBadge();
  const syncActive = pathname === "/imports" || pathname.startsWith("/imports/");
  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "U";

  return (
    <>
    <header className="border-b border-border bg-card flex flex-col justify-end px-4 md:px-6 shrink-0" style={{ paddingTop: "env(safe-area-inset-top)", minHeight: "calc(3.5rem + env(safe-area-inset-top))" }}>
      <div className="h-14 flex items-center justify-between">
        <div className="md:hidden flex items-center gap-2">
          <div className="w-7 h-7 bg-primary rounded-xl flex items-center justify-center shrink-0">
            <IndianRupee className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground">Artha</span>
        </div>
        <div className="hidden md:block" />

        <div className="flex items-center gap-2">
          {/* Sync — mobile only (desktop has it in the sidebar). Kept out of
              the mobile bottom nav to leave that bar uncluttered. */}
          <Link
            href="/imports"
            title="Sync"
            className={`md:hidden relative p-2 rounded-xl transition-colors ${syncActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            <Inbox className="w-4 h-4" />
            {importsBadge > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                {importsBadge > 9 ? "9+" : importsBadge}
              </span>
            )}
          </Link>

          {/* Privacy toggle — stays in header bar */}
          <button
            onClick={toggleHidden}
            title={hidden ? "Show numbers" : "Hide numbers"}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 outline-none ml-1">
                <Avatar className="w-8 h-8 cursor-pointer">
                  <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
                  <AvatarFallback className="bg-primary text-white text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="pb-2">
                <p className="font-medium text-sm">{user.name}</p>
                <p className="text-xs text-muted-foreground font-normal truncate">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Guide */}
              <DropdownMenuItem onSelect={() => setGuideOpen(true)} className="cursor-pointer">
                <BookOpen className="w-4 h-4 mr-2 text-muted-foreground" />
                App guide
              </DropdownMenuItem>

              {/* Go Pro — subtle accent */}
              <DropdownMenuItem asChild>
                <Link href="/pricing" className="cursor-pointer">
                  <Sparkles className="w-4 h-4 mr-2 text-primary" />
                  <span className="flex-1">Subscription</span>
                  <span className="ml-2 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">Pro</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer">
                  <Settings className="w-4 h-4 mr-2 text-muted-foreground" />
                  Settings
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-negative cursor-pointer"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
    <GuidePanel open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
