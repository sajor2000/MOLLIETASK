"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { Icon } from "@/components/ui/Icon";
import { NotificationToggle } from "@/components/pwa/NotificationToggle";
import { TIMEZONE_OPTIONS } from "@/lib/constants";

export default function SettingsPage() {
  const user = useQuery(api.users.getMe);
  const updateSettings = useMutation(api.users.updateSettings);
  const generateToken = useMutation(api.users.generateTelegramLinkToken);
  const unlinkTelegram = useMutation(api.users.unlinkTelegram);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const router = useRouter();

  const [telegramToken, setTelegramToken] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  if (user === undefined) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[calc(100dvh-64px)]">
          <p className="text-[13px] text-text-muted">Loading...</p>
        </div>
      </AppShell>
    );
  }

  if (user === null) {
    router.push("/sign-in");
    return null;
  }

  async function handleTimezone(tz: string) {
    setSaving("timezone");
    try {
      await updateSettings({ timezone: tz });
    } catch (e) {
      console.error("Failed to save timezone:", e);
    }
    setSaving(null);
  }

  async function handleDigestTime(time: string) {
    setSaving("digest");
    try {
      await updateSettings({ digestTime: time || undefined });
    } catch (e) {
      console.error("Failed to save digest time:", e);
    }
    setSaving(null);
  }

  async function handleGenerateToken() {
    try {
      const token = await generateToken();
      setTelegramToken(token);
    } catch (e) {
      console.error("Failed to generate token:", e);
    }
  }

  async function handleUnlinkTelegram() {
    try {
      await unlinkTelegram();
      setTelegramToken(null);
    } catch (e) {
      console.error("Failed to unlink:", e);
    }
  }

  function handleSignOut() {
    router.push("/sign-out");
  }

  async function handleDeleteAccount() {
    try {
      await deleteAccount();
      router.push("/sign-out");
    } catch (e) {
      console.error("Failed to delete account:", e);
    }
  }

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-6 py-8 space-y-8">
        <h1 className="text-[15px] font-medium text-text-primary">Settings</h1>

        {/* Timezone */}
        <Section title="Timezone">
          <select
            value={user.timezone ?? "America/Chicago"}
            onChange={(e) => handleTimezone(e.target.value)}
            disabled={saving === "timezone"}
            className="w-full bg-bg-base border border-border/40 rounded-[4px] px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent transition-colors duration-200 [color-scheme:dark]"
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </Section>

        {/* Daily Digest */}
        <Section title="Daily Digest">
          <p className="text-[12px] text-text-muted mb-2">
            Receive a daily task summary via Telegram at this time.
          </p>
          <input
            type="time"
            value={user.digestTime ?? ""}
            onChange={(e) => handleDigestTime(e.target.value)}
            disabled={saving === "digest"}
            className="w-full bg-bg-base border border-border/40 rounded-[4px] px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent transition-colors duration-200 [color-scheme:dark]"
          />
          {user.digestTime && (
            <button
              type="button"
              onClick={() => handleDigestTime("")}
              className="mt-2 text-[12px] text-text-muted hover:text-text-secondary transition-colors"
            >
              Disable digest
            </button>
          )}
        </Section>

        {/* Telegram */}
        <Section title="Telegram">
          {user.telegramChatId ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-success" />
                <span className="text-[13px] text-text-secondary">Connected</span>
              </div>
              <button
                type="button"
                onClick={handleUnlinkTelegram}
                className="text-[12px] text-destructive hover:opacity-80 transition-opacity"
              >
                Unlink
              </button>
            </div>
          ) : telegramToken ? (
            <div className="space-y-3">
              <p className="text-[12px] text-text-muted">
                Send this command to your Telegram bot:
              </p>
              <code className="block bg-bg-base border border-border/40 rounded-[4px] px-3 py-2 text-[13px] text-accent font-mono break-all select-all">
                /start {telegramToken}
              </code>
              <p className="text-[11px] text-text-muted">
                Token expires in 10 minutes.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[12px] text-text-muted">
                Link your Telegram account to receive reminders and manage tasks via chat.
              </p>
              <button
                type="button"
                onClick={handleGenerateToken}
                className="flex items-center gap-2 px-3 py-2 bg-surface border border-border/40 rounded-[4px] text-[13px] text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors duration-200"
              >
                <Icon name="link" className="w-4 h-4" />
                Generate link token
              </button>
            </div>
          )}
        </Section>

        {/* Push Notifications */}
        <Section title="Notifications">
          <NotificationToggle />
        </Section>

        {/* Account */}
        <Section title="Account">
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2 bg-surface border border-border/40 rounded-[4px] text-[13px] text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors duration-200 w-full"
            >
              <Icon name="logout" className="w-4 h-4" />
              Sign out
            </button>

            {deleteConfirm ? (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="flex-1 py-2.5 bg-destructive/15 text-destructive rounded-[4px] text-[13px] font-medium hover:bg-destructive/25 transition-colors duration-200"
                >
                  Yes, delete everything
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="flex-1 py-2.5 bg-surface text-text-secondary rounded-[4px] text-[13px] font-medium hover:bg-surface-elevated transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/15 rounded-[4px] text-[13px] text-destructive hover:bg-destructive/20 transition-colors duration-200 w-full"
              >
                Delete account
              </button>
            )}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-3">
        {title}
      </label>
      {children}
    </div>
  );
}
