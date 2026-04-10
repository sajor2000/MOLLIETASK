"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell } from "@/components/layout/AppShell";
import { Icon } from "@/components/ui/Icon";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function TeamPage() {
  const { isMember, isLoading: wsLoading } = useWorkspace();
  const router = useRouter();

  useEffect(() => {
    if (!wsLoading && isMember) router.push("/");
  }, [wsLoading, isMember, router]);

  // Show spinner while role is loading to prevent owner UI flash for members
  if (wsLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[calc(100dvh-64px)]">
          <p className="text-[13px] text-text-muted">Loading…</p>
        </div>
      </AppShell>
    );
  }

  if (isMember) return null;

  return <TeamPageContent />;
}

function TeamPageContent() {
  const user = useQuery(api.users.getMe);
  const staff = useQuery(
    api.staff.listStaff,
    user !== undefined && user !== null ? {} : "skip",
  );
  const invites = useQuery(api.workspaces.listInvites);
  const addStaff = useMutation(api.staff.addStaff);
  const updateStaff = useMutation(api.staff.updateStaff);
  const deleteStaff = useMutation(api.staff.deleteStaff);
  const reorderStaff = useMutation(api.staff.reorderStaff);
  const seedPresetTeamIfEmpty = useMutation(api.staff.seedPresetTeamIfEmpty);
  const generateInvite = useMutation(api.workspaces.generateInvite);
  const revokeInvite = useMutation(api.workspaces.revokeInvite);
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [bio, setBio] = useState("");
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [editingId, setEditingId] = useState<Id<"staffMembers"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editBio, setEditBio] = useState("");
  const [expandedBioId, setExpandedBioId] = useState<Id<"staffMembers"> | null>(null);
  const [inviteToken, setInviteToken] = useState<{ staffId: Id<"staffMembers">; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteByStaffId = useMemo(() => {
    const map = new Map<string, { _id: Id<"workspaceInvites">; token: string }>();
    for (const inv of invites ?? []) {
      map.set(inv.staffMemberId as string, { _id: inv._id, token: inv.token });
    }
    return map;
  }, [invites]);

  const orderedIds = useMemo(() => (staff ?? []).map((s) => s._id), [staff]);

  const handleAdd = useCallback(async () => {
    const n = name.trim();
    const r = roleTitle.trim();
    if (!n || !r) return;
    setAdding(true);
    setError(null);
    try {
      const b = bio.trim();
      await addStaff({
        name: n,
        roleTitle: r,
        ...(b ? { bio: b } : {}),
      });
      setName("");
      setRoleTitle("");
      setBio("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    }
    setAdding(false);
  }, [name, roleTitle, bio, addStaff]);

  const startEdit = useCallback(
    (
      id: Id<"staffMembers">,
      currentName: string,
      currentRole: string,
      currentBio: string,
    ) => {
      setEditingId(id);
      setEditName(currentName);
      setEditRole(currentRole);
      setEditBio(currentBio);
      setError(null);
    },
    [],
  );

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    setError(null);
    try {
      const b = editBio.trim();
      await updateStaff({
        staffId: editingId,
        name: editName,
        roleTitle: editRole,
        bio: b ? b : null,
      });
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }, [editingId, editName, editRole, editBio, updateStaff]);

  const handleSeedPreset = useCallback(async () => {
    setSeeding(true);
    setError(null);
    try {
      await seedPresetTeamIfEmpty();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load preset");
    }
    setSeeding(false);
  }, [seedPresetTeamIfEmpty]);

  const handleDelete = useCallback(
    async (id: Id<"staffMembers">) => {
      if (!confirm("Remove this person from the team? Assigned tasks will become unassigned.")) return;
      setError(null);
      try {
        await deleteStaff({ staffId: id });
        if (editingId === id) setEditingId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete");
      }
    },
    [deleteStaff, editingId],
  );

  const handleGenerateInvite = useCallback(
    async (staffMemberId: Id<"staffMembers">) => {
      setError(null);
      try {
        const token = await generateInvite({ staffMemberId });
        setInviteToken({ staffId: staffMemberId, token });
        setCopied(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate invite");
      }
    },
    [generateInvite],
  );

  const handleCopyInvite = useCallback(async () => {
    if (!inviteToken) return;
    const url = `${window.location.origin}/invite/${inviteToken.token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [inviteToken]);

  const handleRevokeInvite = useCallback(
    async (inviteId: Id<"workspaceInvites">) => {
      setError(null);
      try {
        await revokeInvite({ inviteId });
        setInviteToken(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to revoke invite");
      }
    },
    [revokeInvite],
  );

  const move = useCallback(
    async (index: number, direction: -1 | 1) => {
      const next = index + direction;
      if (!staff || next < 0 || next >= staff.length) return;
      const ids = [...orderedIds];
      [ids[index], ids[next]] = [ids[next], ids[index]];
      setError(null);
      try {
        await reorderStaff({ orderedIds: ids });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to reorder");
      }
    },
    [staff, orderedIds, reorderStaff],
  );

  // Show spinner for both undefined (query in-flight) and null (Clerk authenticated
  // but StoreUser hasn't written the record yet). Middleware handles truly
  // unauthenticated users before they reach this page.
  if (!user) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[calc(100dvh-64px)]">
          <p className="text-[13px] text-text-muted">Loading...</p>
        </div>
      </AppShell>
    );
  }

  if (staff === undefined) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[calc(100dvh-64px)]">
          <p className="text-[13px] text-text-muted">Loading...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-[15px] font-medium text-text-primary">Team</h1>
          <p className="text-[12px] text-text-muted mt-1">
            Practice roster for task assignment. Order sets hotkeys 1–9 in the task dialog (0 clears).
          </p>
        </div>

        {error && (
          <p className="text-[12px] text-destructive bg-destructive/10 border border-destructive/20 rounded-[4px] px-3 py-2">
            {error}
          </p>
        )}

        <section>
          <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-3">
            Add team member
          </label>
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              maxLength={120}
              className="w-full bg-bg-base border border-border/15 rounded-[4px] px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200"
            />
            <input
              type="text"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="Role (e.g. Lead hygienist)"
              maxLength={120}
              className="w-full bg-bg-base border border-border/15 rounded-[4px] px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200"
            />
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Bio (optional, Meet-the-Team style)"
              rows={4}
              maxLength={12000}
              className="w-full bg-bg-base border border-border/15 rounded-[4px] px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200 resize-y min-h-[88px]"
            />
            <button
              type="button"
              disabled={adding || !name.trim() || !roleTitle.trim()}
              onClick={handleAdd}
              className="flex items-center gap-2 px-3 py-2 bg-accent text-bg-base rounded-[4px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity duration-200"
            >
              <Icon name="add" className="w-4 h-4" />
              Add
            </button>
          </div>
        </section>

        <section>
          <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-3">
            Roster
          </label>
          {staff.length === 0 ? (
            <div className="space-y-4 py-2">
              <p className="text-[13px] text-text-muted">No team members yet.</p>
              <button
                type="button"
                disabled={seeding}
                onClick={handleSeedPreset}
                className="text-[13px] text-accent font-medium hover:underline disabled:opacity-50"
              >
                {seeding ? "Loading…" : "Load preset practice team (8 people + bios)"}
              </button>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Adds dentists, hygienists, and front office roles with full bios. Only works while the roster is empty.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {staff.map((member, index) => (
                <li
                  key={member._id}
                  className="bg-surface border border-border/15 rounded-[4px] p-3"
                >
                  {editingId === member._id ? (
                    <div className="space-y-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-bg-base border border-border/15 rounded-[4px] px-2 py-1.5 text-[13px] text-text-primary focus:outline-none focus:border-accent"
                        maxLength={120}
                      />
                      <input
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="w-full bg-bg-base border border-border/15 rounded-[4px] px-2 py-1.5 text-[13px] text-text-primary focus:outline-none focus:border-accent"
                        maxLength={120}
                      />
                      <textarea
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        placeholder="Bio (optional)"
                        rows={5}
                        maxLength={12000}
                        className="w-full bg-bg-base border border-border/15 rounded-[4px] px-2 py-1.5 text-[13px] text-text-primary focus:outline-none focus:border-accent resize-y min-h-[100px]"
                      />
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="text-[12px] text-accent font-medium"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-[12px] text-text-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          type="button"
                          aria-label="Move up"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                          className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30"
                        >
                          <Icon name="chevron_left" className="w-4 h-4 -rotate-90" />
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          disabled={index === staff.length - 1}
                          onClick={() => move(index, 1)}
                          className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30"
                        >
                          <Icon name="chevron_left" className="w-4 h-4 rotate-90" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-medium text-text-primary">{member.name}</p>
                          {member.linkedUserId ? (
                            <span className="text-[10px] font-medium text-success bg-success/15 px-1.5 py-0.5 rounded-[3px]">
                              Active
                            </span>
                          ) : inviteByStaffId.has(member._id) ? (
                            <span className="text-[10px] font-medium text-accent bg-accent/15 px-1.5 py-0.5 rounded-[3px]">
                              Invite pending
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[12px] text-text-muted">{member.roleTitle}</p>
                        {index < 9 && (
                          <p className="text-[11px] text-text-muted/80 mt-1">Hotkey: {index + 1}</p>
                        )}
                        {member.bio && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedBioId((id) =>
                                  id === member._id ? null : member._id,
                                )
                              }
                              className="text-[11px] text-accent hover:underline"
                            >
                              {expandedBioId === member._id ? "Hide bio" : "Show bio"}
                            </button>
                            {expandedBioId === member._id && (
                              <p className="text-[12px] text-text-secondary mt-2 whitespace-pre-wrap leading-relaxed">
                                {member.bio}
                              </p>
                            )}
                          </div>
                        )}
                        {/* Invite link display */}
                        {inviteToken?.staffId === member._id && (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${inviteToken.token}`}
                              className="flex-1 bg-bg-base border border-border/15 rounded-[4px] px-2 py-1 text-[11px] text-text-muted"
                            />
                            <button
                              type="button"
                              onClick={handleCopyInvite}
                              className="text-[11px] text-accent font-medium shrink-0"
                            >
                              {copied ? "Copied!" : "Copy"}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            startEdit(
                              member._id,
                              member.name,
                              member.roleTitle,
                              member.bio ?? "",
                            )
                          }
                          className="text-[12px] text-text-secondary hover:text-accent"
                        >
                          Edit
                        </button>
                        {!member.linkedUserId && !inviteByStaffId.has(member._id) && (
                          <button
                            type="button"
                            onClick={() => handleGenerateInvite(member._id)}
                            className="text-[12px] text-accent hover:underline"
                          >
                            Invite
                          </button>
                        )}
                        {inviteByStaffId.has(member._id) && (
                          <button
                            type="button"
                            onClick={() => handleRevokeInvite(inviteByStaffId.get(member._id)!._id)}
                            className="text-[12px] text-text-muted hover:text-destructive"
                          >
                            Revoke
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(member._id)}
                          className="text-[12px] text-destructive/80 hover:text-destructive"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
