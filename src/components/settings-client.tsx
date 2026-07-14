"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Bell, BellOff, User, Sun, Moon, Monitor } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const APPEARANCE_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sun className="w-4 h-4" /> Appearance
        </CardTitle>
        <CardDescription>Choose how FinanceOS looks on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        {mounted ? (
          <SegmentedControl
            value={(theme ?? "system") as "light" | "dark" | "system"}
            onChange={setTheme}
            options={[...APPEARANCE_OPTIONS]}
          />
        ) : (
          <div className="h-8 w-56 rounded-full bg-muted animate-pulse" />
        )}
      </CardContent>
    </Card>
  );
}

interface SettingsClientProps {
  user: { name?: string | null; email?: string | null; image?: string | null; role?: string };
}

export function SettingsClient({ user }: SettingsClientProps) {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setPushEnabled(!!sub);
      });
    }
  }, []);

  async function togglePush(enable: boolean) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Push notifications not supported in this browser");
      return;
    }
    if (!vapidKey) {
      toast.error("Push notifications not configured (VAPID key missing)");
      return;
    }

    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (enable) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast.error("Notification permission denied");
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON(), label: navigator.userAgent.slice(0, 50) }),
        });
        setPushEnabled(true);
        toast.success("Push notifications enabled");
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch("/api/push", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        }
        setPushEnabled(false);
        toast.success("Push notifications disabled");
      }
    } catch (err) {
      toast.error("Failed to update push settings");
    } finally {
      setPushLoading(false);
    }
  }

  const initials = user.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "U";

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Profile and account preferences</p>
      </div>

      <div className="space-y-6">
      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="w-14 h-14">
            <AvatarImage src={user.image ?? undefined} />
            <AvatarFallback className="bg-primary text-white text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <Badge variant="secondary" className="text-xs mt-1">{user.role}</Badge>
          </div>
        </CardContent>
      </Card>

      <AppearanceCard />

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4" /> Payment Reminders
          </CardTitle>
          <CardDescription>
            Get push notifications for upcoming due payments. Requires the app to be installed (Add to Home Screen on iOS).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{pushEnabled ? "Reminders on" : "Reminders off"}</p>
                <p className="text-xs text-muted-foreground">
                  {pushEnabled ? "You'll be notified for pending payments" : "Enable to get payment reminders"}
                </p>
              </div>
              <Switch
                checked={pushEnabled}
                onCheckedChange={togglePush}
                disabled={pushLoading}
              />
            </div>
            {pushEnabled && (
              <Button
                variant="outline"
                size="sm"
                disabled={testLoading}
                onClick={async () => {
                  setTestLoading(true);
                  const res = await fetch("/api/push/test", { method: "POST" });
                  const data = await res.json();
                  if (res.ok) toast.success(`Sent ${data.sent} test notifications`);
                  else toast.error(data.error ?? "Failed to send");
                  setTestLoading(false);
                }}
              >
                <Bell className="w-3.5 h-3.5 mr-1.5" />
                {testLoading ? "Sending..." : "Send test notification"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gmail transaction import lives on its own page now */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-medium">Bank transaction import</p>
            <p className="text-xs text-muted-foreground">Connect Gmail and review imported transactions</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href="/imports">Open Sync</a>
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
