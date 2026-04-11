"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { Icon } from "@/components/ui/Icon";
import { NotificationToggle } from "@/components/pwa/NotificationToggle";
import { TIMEZONE_OPTIONS } from "@/lib/constants";
import { useWorkspace } from "@/hooks/useWorkspace";


export default function SettingsPage() {
  const { isOwner } = useWorkspace();
  const user = useQuery(api.users.getMe);
  const workspace = useQuery(api.workspaces.getWorkspaceInfo);
  const updateSettings = useMutation(api.users.updateSettings);
  const updateWorkspaceName = useMutation(api.workspaces.updateWorkspaceName);
  const updateTelegramBotUsername = useMutation(api.workspaces.updateTelegramBotUsername);
  const generateToken = useMutation(api.users.generateTelegramLinkToken);
  const unlinkTelegram = useMutation(api.users.unlinkTelegram);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const router = useRouter();

  const [telegramToken, setTelegramToken] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [editingWorkspaceName, setEditingWorkspaceName] = useState(false);
  const [botUsername, setBotUsername] = useState("");
  const [editingBotUsername, setEditingBotUsername] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!user) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[calc(100dvh-64px)]">
          <p className="text-[13px] text-text-muted">Loading...</p>
        </div>
      </AppShell>
    );
  }

  async function handleTimezone(tz: string) {
    setSaving("timezone");
    setError(null);
    try {
      await updateSettings({ timezone: tz });
    } catch {
      setError("Failed to save timezone.");
    }
    setSaving(null);
  }

  async function handleDigestTime(time: string) {
    setSaving("digest");
    setError(null);
    try {
      await updateSettings({ digestTime: time || undefined });
    } catch {
      setError("Failed to save digest time.");
    }
    setSaving(null);
  }

  async function handleSaveWorkspaceName() {
    setSaving("workspace");
    setError(null);
    try {
      await updateWorkspaceName({ name: workspaceName });
      setEditingWorkspaceName(false);
    } catch {
      setError("Failed to save workspace name.");
    }
    setSaving(null);
  }

  function startEditWorkspaceName() {
    setWorkspaceName(workspace?.name ?? "");
    setEditingWorkspaceName(true);
  }

  async function handleSaveBotUsername() {
    setSaving("botUsername");
    setError(null);
    try {
      await updateTelegramBotUsername({ username: botUsername });
      setEditingBotUsername(false);
    } catch {
      setError("Failed to save bot username.");
    }
    setSaving(null);
  }

  function startEditBotUsername() {
    setBotUsername(workspace?.telegramBotUsername ?? "");
    setEditingBotUsername(true);
  }

  async function handleGenerateToken() {
    setError(null);
    try {
      const token = await generateToken();
      setTelegramToken(token);
    } catch {
      setError("Failed to generate link token.");
    }
  }

  async function handleCopyTelegramCommand() {
    if (!telegramToken) return;
    await navigator.clipboard.writeText(`/start ${telegramToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleUnlinkTelegram() {
    setError(null);
    try {
      await unlinkTelegram();
      setTelegramToken(null);
    } catch {
      setError("Failed to unlink Telegram.");
    }
  }

  async function handleDeleteAccount() {
    setError(null);
    try {
      await deleteAccount();
      router.push("/sign-out");
    } catch {
      setError("Failed to delete account.");
    }
  }

  const storedBotUsername = workspace?.telegramBotUsername ?? "";
  const telegramDeepLink = telegramToken && storedBotUsername
    ? `https://t.me/${storedBotUsername}?start=${telegramToken}`
    : null;

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 md:px-6 py-5 md:py-8 space-y-5 md:space-y-6">
        {error && (
          <p className="text-[12px] text-destructive bg-destructive/10 border border-destructive/20 rounded-[4px] px-3 py-2">
            {error}
          </p>
        )}

        {/* ── Profile ── */}
        <Section title="Profile">
          <div className="space-y-2">
            <Row label="Name" value={user.name ?? "—"} />
            <Row label="Email" value={user.email ?? "—"} />
          </div>
        </Section>

        {/* ── Workspace ── owner only */}
        {isOwner && workspace && (
          <Section title="Workspace">
            {editingWorkspaceName ? (
              <div className="flex gap-2">
                <input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  maxLength={100}
                  autoFocus
                  className="flex-1 bg-bg-base border border-border/15 rounded-[4px] px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent transition-colors duration-200"
                />
                <button
                  type="button"
                  disabled={saving === "workspace" || !workspaceName.trim()}
                  onClick={handleSaveWorkspaceName}
                  className="px-3 py-2 bg-accent text-bg-base rounded-[4px] text-[12px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingWorkspaceName(false)}
                  className="px-3 py-2 text-[12px] text-text-muted hover:text-text-secondary"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-text-primary">{workspace.name}</span>
                <button
                  type="button"
                  onClick={startEditWorkspaceName}
                  className="text-[12px] text-accent hover:underline"
                >
                  Rename
                </button>
              </div>
            )}
          </Section>
        )}

        {/* ── Preferences ── */}
        <Section title="Preferences">
          <label className="text-[12px] text-text-muted block mb-1.5">Timezone</label>
          <select
            value={user.timezone ?? "America/Chicago"}
            onChange={(e) => handleTimezone(e.target.value)}
            disabled={saving === "timezone"}
            className="w-full bg-bg-base border border-border/15 rounded-[4px] px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent transition-colors duration-200 [color-scheme:dark]"
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </Section>

        {/* ── Notifications ── */}
        <Section title="Notifications">
          <div className="space-y-4">
            <NotificationToggle />
            {isOwner && (
              <div>
                <label className="text-[12px] text-text-muted block mb-1.5">
                  Daily digest via Telegram
                </label>
                <input
                  type="time"
                  value={user.digestTime ?? ""}
                  onChange={(e) => handleDigestTime(e.target.value)}
                  disabled={saving === "digest"}
                  className="w-full bg-bg-base border border-border/15 rounded-[4px] px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent transition-colors duration-200 [color-scheme:dark]"
                />
                {user.digestTime && (
                  <button
                    type="button"
                    onClick={() => handleDigestTime("")}
                    className="mt-1.5 text-[12px] text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Disable digest
                  </button>
                )}
              </div>
            )}
          </div>
        </Section>

        {/* ── Telegram ── owner only */}
        {isOwner && (
          <Section title="Telegram">
            {/* Bot username — needed for the "Open in Telegram" deep link */}
            <div className="mb-4">
              <label className="text-[12px] text-text-muted block mb-1.5">Bot username</label>
              {editingBotUsername ? (
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center bg-bg-base border border-border/15 rounded-[4px] px-3 py-2 gap-1 focus-within:border-accent transition-colors">
                    <span className="text-[13px] text-text-muted">@</span>
                    <input
                      value={botUsername}
                      onChange={(e) => setBotUsername(e.target.value)}
                      placeholder="YourBotName"
                      maxLength={100}
                      autoFocus
                      className="flex-1 bg-transparent text-[13px] text-text-primary focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={saving === "botUsername"}
                    onClick={handleSaveBotUsername}
                    className="px-3 py-2 bg-accent text-bg-base rounded-[4px] text-[12px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingBotUsername(false)}
                    className="px-3 py-2 text-[12px] text-text-muted hover:text-text-secondary"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-text-secondary">
                    {storedBotUsername ? `@${storedBotUsername}` : <span className="text-text-muted italic">Not set</span>}
                  </span>
                  <button
                    type="button"
                    onClick={startEditBotUsername}
                    className="text-[12px] text-accent hover:underline"
                  >
                    {storedBotUsername ? "Change" : "Set"}
                  </button>
                </div>
              )}
              {!storedBotUsername && (
                <p className="text-[11px] text-text-muted mt-1">
                  Set your bot username to enable one-tap Telegram connection.
                </p>
              )}
            </div>

            {user.isTelegramLinked ? (
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
                  Open your Telegram bot and send it this command to connect your account.
                </p>

                {/* Deep link button — only if bot username is configured */}
                {telegramDeepLink && (
                  <a
                    href={telegramDeepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-accent text-bg-base rounded-[4px] text-[13px] font-medium hover:opacity-90 transition-opacity"
                  >
                    <Icon name="send" className="w-4 h-4" />
                    Open in Telegram
                  </a>
                )}

                {/* Manual fallback */}
                <div>
                  <p className="text-[11px] text-text-muted mb-1.5">Or send manually:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-bg-base border border-border/15 rounded-[4px] px-3 py-2 text-[13px] text-accent font-mono break-all select-all">
                      /start {telegramToken}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyTelegramCommand}
                      className="shrink-0 px-2.5 py-2 bg-surface border border-border/15 rounded-[4px] text-[12px] text-text-secondary hover:text-text-primary transition-colors"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-text-muted">Token expires in 10 minutes.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-text-muted">
                  Link your Telegram account to receive reminders and manage tasks via chat.
                </p>
                <button
                  type="button"
                  onClick={handleGenerateToken}
                  className="flex items-center gap-2 px-3 py-2 bg-surface border border-border/15 rounded-[4px] text-[13px] text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors duration-200"
                >
                  <Icon name="link" className="w-4 h-4" />
                  Connect Telegram
                </button>
              </div>
            )}
          </Section>
        )}

        {/* ── Account ── */}
        <Section title="Account">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => router.push("/sign-out")}
              className="flex items-center gap-2 px-3 py-2 bg-surface border border-border/15 rounded-[4px] text-[13px] text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors duration-200 w-full"
            >
              <Icon name="logout" className="w-4 h-4" />
              Sign out
            </button>

            {isOwner && (deleteConfirm ? (
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
            ))}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-[10px] border border-border p-4">
      <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-3">
        {title}
      </label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[12px] text-text-muted">{label}</span>
      <span className="text-[13px] text-text-secondary">{value}</span>
    </div>
  );
}
