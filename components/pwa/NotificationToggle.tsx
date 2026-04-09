"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/components/ui/Icon";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type PermState = "prompt" | "granted" | "denied" | "unsupported" | "loading";

export function NotificationToggle() {
  const saveSub = useMutation(api.pushNotifications.savePushSubscription);
  const removeSub = useMutation(api.pushNotifications.removePushSubscription);

  const [permState, setPermState] = useState<PermState>("loading");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermState("unsupported");
      return;
    }

    const perm = Notification.permission;
    if (perm === "denied") {
      setPermState("denied");
      return;
    }

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscription(sub);
        setPermState(perm === "granted" && sub ? "granted" : "prompt");
      });
    });
  }, []);

  async function handleToggle() {
    if (busy) return;
    setBusy(true);

    try {
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        setSubscription(null);
        setPermState("prompt");
        await removeSub({ endpoint });
      } else {
        const permission = await Notification.requestPermission();
        if (permission === "denied") {
          setPermState("denied");
          return;
        }

        const reg = await navigator.serviceWorker.ready;
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
        });

        setSubscription(sub);
        setPermState("granted");

        const serialized = sub.toJSON();
        const endpoint = serialized.endpoint;
        const p256dh = serialized.keys?.p256dh;
        const authKey = serialized.keys?.auth;
        if (!endpoint || !p256dh || !authKey) {
          await sub.unsubscribe();
          setSubscription(null);
          setPermState("prompt");
          console.error("Push subscription missing required keys");
          return;
        }
        await saveSub({
          endpoint,
          keys: { p256dh, auth: authKey },
        });
      }
    } catch (err) {
      console.error("Notification toggle failed:", err);
    } finally {
      setBusy(false);
    }
  }

  if (permState === "loading") return null;

  if (permState === "unsupported") {
    return (
      <p className="text-[13px] text-text-muted">
        Push notifications are not supported in this browser.
      </p>
    );
  }

  if (permState === "denied") {
    return (
      <p className="text-[13px] text-text-muted">
        Notifications are blocked. Enable them in your browser settings.
      </p>
    );
  }

  const isEnabled = permState === "granted" && subscription;

  return (
    <button
      onClick={handleToggle}
      disabled={busy}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-[4px] border transition-colors duration-200 text-left disabled:opacity-50 ${
        isEnabled
          ? "border-success/30 bg-success/5 text-success"
          : "border-border bg-surface text-text-secondary hover:border-accent/30"
      }`}
    >
      <Icon name="notifications" className="w-5 h-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium">
          {isEnabled ? "Notifications enabled" : "Enable notifications"}
        </p>
        <p className="text-[11px] text-text-muted mt-0.5">
          {isEnabled
            ? "You'll receive push alerts for reminders"
            : "Get push alerts for task reminders"}
        </p>
      </div>
      {busy && (
        <span className="text-[11px] text-text-muted animate-pulse">...</span>
      )}
    </button>
  );
}
