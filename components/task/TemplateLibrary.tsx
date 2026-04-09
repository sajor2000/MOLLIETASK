"use client";

import { useEffect, useMemo, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/components/ui/Icon";
import { WorkstreamPicker, PriorityPicker, RecurringPicker } from "@/components/ui/FormToggles";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { Workstream, Priority, Recurring } from "@/lib/constants";

interface TemplateLibraryProps {
  onClose: () => void;
  onEditTask: (task: Doc<"tasks">) => void;
}

export function TemplateLibrary({ onClose, onEditTask }: TemplateLibraryProps) {
  const convex = useConvex();
  const templates = useQuery(api.taskTemplates.listTemplates);
  const seedDefaults = useMutation(api.taskTemplates.seedDefaults);
  const createFromTemplate = useMutation(api.taskTemplates.createFromTemplate);
  const deleteTemplate = useMutation(api.taskTemplates.deleteTemplate);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [applying, setApplying] = useState<Id<"taskTemplates"> | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Doc<"taskTemplates"> | null>(null);
  const [creatingInCategory, setCreatingInCategory] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Id<"taskTemplates"> | null>(null);

  // Auto-seed defaults on first load
  useEffect(() => {
    if (templates !== undefined && templates.length === 0) {
      seedDefaults();
    }
  }, [templates, seedDefaults]);

  // Group templates by category
  const categories = useMemo(() => {
    if (!templates) return [];
    const map = new Map<string, Doc<"taskTemplates">[]>();
    for (const t of templates) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return Array.from(map.entries()).map(([label, items]) => ({
      label,
      templates: items.sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  }, [templates]);

  async function handleApply(tmpl: Doc<"taskTemplates">) {
    setApplying(tmpl._id);
    try {
      const taskId = await createFromTemplate({
        title: tmpl.title,
        workstream: tmpl.workstream,
        priority: tmpl.priority,
        recurring: tmpl.recurring,
        notes: tmpl.notes,
        subtasks: tmpl.subtasks,
      });
      const task = await convex.query(api.tasks.getTask, { taskId });
      onClose();
      if (task) onEditTask(task);
    } finally {
      setApplying(null);
    }
  }

  async function handleDelete(templateId: Id<"taskTemplates">) {
    await deleteTemplate({ templateId });
    setConfirmDelete(null);
  }

  const loading = templates === undefined;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-bg-base/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center md:p-6">
        <div
          className="bg-surface-elevated border-t border-x md:border border-border rounded-t-[8px] md:rounded-[4px] w-full md:max-w-[560px] max-h-[85dvh] md:max-h-[80vh] flex flex-col min-h-0 overflow-hidden animate-[slideUp_200ms_ease-out] md:animate-[fadeIn_150ms_ease-out]"
          role="dialog"
          aria-modal="true"
          aria-label="Task templates"
        >
          <div className="flex justify-center py-3 md:hidden">
            <div className="w-10 h-1 bg-border rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-6 pb-2 md:py-4 md:border-b md:border-border">
            <div className="flex items-center gap-3">
              {(selectedCategory || editingTemplate || creatingInCategory) && (
                <button
                  onClick={() => {
                    if (editingTemplate || creatingInCategory) {
                      setEditingTemplate(null);
                      setCreatingInCategory(null);
                    } else {
                      setSelectedCategory(null);
                    }
                  }}
                  className="text-text-muted hover:text-text-secondary transition-colors duration-200"
                >
                  <Icon name="chevron_left" className="w-5 h-5" />
                </button>
              )}
              <h2 className="text-[15px] font-medium text-text-primary">
                {editingTemplate
                  ? "Edit Template"
                  : creatingInCategory
                    ? "New Template"
                    : selectedCategory ?? "Task Templates"}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-secondary transition-colors duration-200"
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
            {loading ? (
              <p className="text-[13px] text-text-muted pt-4">Loading templates...</p>
            ) : editingTemplate ? (
              <TemplateEditor
                template={editingTemplate}
                categories={categories.map((c) => c.label)}
                onDone={() => setEditingTemplate(null)}
              />
            ) : creatingInCategory ? (
              <TemplateEditor
                category={creatingInCategory}
                categories={categories.map((c) => c.label)}
                onDone={() => setCreatingInCategory(null)}
              />
            ) : !selectedCategory ? (
              <div className="space-y-2 pt-2">
                <p className="text-[13px] text-text-muted mb-4">
                  Your task templates. Edit any template to customize it for your practice, or create your own.
                </p>
                {categories.map((cat) => (
                  <button
                    key={cat.label}
                    onClick={() => setSelectedCategory(cat.label)}
                    className="w-full text-left px-4 py-3 bg-bg-base border border-border/40 rounded-[4px] hover:border-accent/30 transition-colors duration-200 group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[14px] font-medium text-text-primary group-hover:text-accent transition-colors duration-200">
                          {cat.label}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-text-muted">
                          {cat.templates.length}
                        </span>
                        <Icon name="chevron_right" className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors duration-200" />
                      </div>
                    </div>
                  </button>
                ))}

                {categories.length === 0 && (
                  <p className="text-[13px] text-text-muted py-4">
                    Templates are being set up...
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                {categories
                  .find((c) => c.label === selectedCategory)
                  ?.templates.map((tmpl) => (
                    <TemplateCard
                      key={tmpl._id}
                      template={tmpl}
                      applying={applying}
                      confirmDelete={confirmDelete}
                      onApply={handleApply}
                      onEdit={setEditingTemplate}
                      onConfirmDelete={setConfirmDelete}
                      onDelete={handleDelete}
                    />
                  ))}

                {/* Add new template button */}
                <button
                  onClick={() => setCreatingInCategory(selectedCategory)}
                  className="w-full py-3 border border-dashed border-border/30 rounded-[4px] text-[13px] text-text-muted hover:text-accent hover:border-accent/30 transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <Icon name="add" className="w-4 h-4" />
                  New template
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Template Card ────────────────────────────────────

function TemplateCard({
  template,
  applying,
  confirmDelete,
  onApply,
  onEdit,
  onConfirmDelete,
  onDelete,
}: {
  template: Doc<"taskTemplates">;
  applying: Id<"taskTemplates"> | null;
  confirmDelete: Id<"taskTemplates"> | null;
  onApply: (t: Doc<"taskTemplates">) => void;
  onEdit: (t: Doc<"taskTemplates">) => void;
  onConfirmDelete: (id: Id<"taskTemplates"> | null) => void;
  onDelete: (id: Id<"taskTemplates">) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isApplying = applying === template._id;
  const isConfirmingDelete = confirmDelete === template._id;

  return (
    <div className="bg-bg-base border border-border/40 rounded-[4px] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 hover:bg-surface transition-colors duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium text-text-primary">
              {template.title}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {template.recurring && (
                <span className="text-[11px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                  {template.recurring}
                </span>
              )}
              {template.priority === "high" && (
                <span className="text-[11px] text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                  high
                </span>
              )}
              {template.subtasks && template.subtasks.length > 0 && (
                <span className="text-[11px] text-text-muted">
                  {template.subtasks.length} subtasks
                </span>
              )}
            </div>
          </div>
          <Icon
            name={expanded ? "chevron_left" : "chevron_right"}
            className={`w-4 h-4 text-text-muted mt-1 transition-transform duration-200 ${expanded ? "rotate-[-90deg]" : "rotate-90"}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/10">
          {template.notes && (
            <p className="text-[12px] text-text-secondary mt-3 mb-3">
              {template.notes}
            </p>
          )}
          {template.subtasks && template.subtasks.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] font-medium text-text-secondary uppercase tracking-widest mb-1.5">
                Subtasks
              </p>
              <ul className="space-y-1">
                {template.subtasks.map((st, i) => (
                  <li key={i} className="text-[12px] text-text-muted flex items-start gap-2">
                    <span className="w-1 h-1 bg-text-muted rounded-full mt-1.5 shrink-0" />
                    {st}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => onApply(template)}
              disabled={isApplying || applying !== null}
              className="flex-1 py-2 rounded-[4px] text-[13px] font-medium bg-accent text-bg-base hover:opacity-90 disabled:opacity-50 transition-colors duration-200"
            >
              {isApplying ? "Creating..." : "Use template"}
            </button>
            <button
              onClick={() => onEdit(template)}
              className="px-3 py-2 rounded-[4px] text-[13px] text-text-secondary bg-surface hover:bg-surface-elevated transition-colors duration-200"
            >
              Edit
            </button>
            {isConfirmingDelete ? (
              <div className="flex gap-1">
                <button
                  onClick={() => onDelete(template._id)}
                  className="px-3 py-2 rounded-[4px] text-[12px] font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors duration-200"
                >
                  Confirm
                </button>
                <button
                  onClick={() => onConfirmDelete(null)}
                  className="px-2 py-2 rounded-[4px] text-[12px] text-text-muted hover:text-text-secondary transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => onConfirmDelete(template._id)}
                className="px-3 py-2 rounded-[4px] text-[13px] text-text-muted hover:text-destructive hover:bg-destructive/10 transition-colors duration-200"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Template Editor (create + edit) ──────────────────

function TemplateEditor({
  template,
  category: defaultCategory,
  categories,
  onDone,
}: {
  template?: Doc<"taskTemplates">;
  category?: string;
  categories: string[];
  onDone: () => void;
}) {
  const addTemplate = useMutation(api.taskTemplates.addTemplate);
  const updateTemplate = useMutation(api.taskTemplates.updateTemplate);

  const [title, setTitle] = useState(template?.title ?? "");
  const [category, setCategory] = useState(template?.category ?? defaultCategory ?? "");
  const [customCategory, setCustomCategory] = useState("");
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [workstream, setWorkstream] = useState<Workstream>(template?.workstream ?? "practice");
  const [priority, setPriority] = useState<Priority>(template?.priority ?? "normal");
  const [recurring, setRecurring] = useState<Recurring | undefined>(template?.recurring ?? undefined);
  const [notes, setNotes] = useState(template?.notes ?? "");
  const [subtasksText, setSubtasksText] = useState(
    template?.subtasks?.join("\n") ?? "",
  );
  const [saving, setSaving] = useState(false);

  const effectiveCategory = useCustomCategory ? customCategory.trim() : category;

  async function handleSave() {
    if (!title.trim() || !effectiveCategory) return;
    setSaving(true);
    try {
      const subtasks = subtasksText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (template) {
        await updateTemplate({
          templateId: template._id,
          title: title.trim(),
          category: effectiveCategory,
          workstream,
          priority,
          recurring: recurring ?? null,
          notes: notes.trim() || null,
          subtasks: subtasks.length > 0 ? subtasks : null,
        });
      } else {
        await addTemplate({
          category: effectiveCategory,
          title: title.trim(),
          workstream,
          priority,
          recurring,
          notes: notes.trim() || undefined,
          subtasks: subtasks.length > 0 ? subtasks : undefined,
        });
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pt-2">
      {/* Title */}
      <div>
        <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-1.5">
          Template title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Run payroll"
          maxLength={200}
          autoFocus
          className="w-full bg-bg-base border border-border/40 rounded-[4px] px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200"
        />
      </div>

      {/* Category */}
      <div>
        <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-1.5">
          Category
        </label>
        {!useCustomCategory ? (
          <div className="space-y-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-bg-base border border-border/40 rounded-[4px] px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent transition-colors duration-200 [color-scheme:dark]"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setUseCustomCategory(true)}
              className="text-[12px] text-accent hover:underline"
            >
              + New category
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="New category name"
              maxLength={100}
              className="w-full bg-bg-base border border-border/40 rounded-[4px] px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200"
            />
            <button
              type="button"
              onClick={() => setUseCustomCategory(false)}
              className="text-[12px] text-text-muted hover:text-text-secondary"
            >
              Use existing category
            </button>
          </div>
        )}
      </div>

      {/* Workstream */}
      <div>
        <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-1.5">
          Workstream
        </label>
        <WorkstreamPicker value={workstream} onChange={setWorkstream} />
      </div>

      {/* Priority */}
      <div>
        <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-1.5">
          Priority
        </label>
        <PriorityPicker value={priority} onChange={setPriority} />
      </div>

      {/* Recurring */}
      <div>
        <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-1.5">
          Default recurrence
        </label>
        <RecurringPicker value={recurring} onChange={setRecurring} />
      </div>

      {/* Notes */}
      <div>
        <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-1.5">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Instructions or context for this task..."
          maxLength={2000}
          rows={2}
          className="w-full bg-bg-base border border-border/40 rounded-[4px] px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200 resize-none"
        />
      </div>

      {/* Subtasks */}
      <div>
        <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-1.5">
          Subtasks <span className="font-normal text-text-muted">(one per line)</span>
        </label>
        <textarea
          value={subtasksText}
          onChange={(e) => setSubtasksText(e.target.value)}
          placeholder={"Review timesheets\nSubmit to processor\nDistribute pay stubs"}
          rows={4}
          className="w-full bg-bg-base border border-border/40 rounded-[4px] px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200 resize-none font-mono"
        />
      </div>

      {/* Save / Cancel */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onDone}
          className="py-2.5 px-4 text-text-secondary text-[13px] hover:text-text-primary transition-colors duration-200"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!title.trim() || !effectiveCategory || saving}
          className="flex-1 py-2.5 bg-accent text-bg-base rounded-[4px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity duration-200"
        >
          {saving ? "Saving..." : template ? "Save changes" : "Create template"}
        </button>
      </div>
    </div>
  );
}
