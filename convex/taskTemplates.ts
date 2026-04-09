import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  workstreamValidator,
  priorityValidator,
  recurringValidator,
} from "./schema";
import { getAuthUserId } from "./authHelpers";
import { insertTaskCore } from "./tasks";

// ── Queries ──────────────────────────────────────────

const templateDocValidator = v.object({
  _id: v.id("taskTemplates"),
  _creationTime: v.number(),
  userId: v.id("users"),
  category: v.string(),
  title: v.string(),
  workstream: workstreamValidator,
  priority: priorityValidator,
  recurring: v.optional(recurringValidator),
  notes: v.optional(v.string()),
  subtasks: v.optional(v.array(v.string())),
  sortOrder: v.number(),
  createdAt: v.number(),
});

export const listTemplates = query({
  args: {},
  returns: v.array(templateDocValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return await ctx.db
      .query("taskTemplates")
      .withIndex("by_userId_category", (q) => q.eq("userId", userId))
      .take(500);
  },
});

// ── Template CRUD ────────────────────────────────────

export const addTemplate = mutation({
  args: {
    category: v.string(),
    title: v.string(),
    workstream: workstreamValidator,
    priority: priorityValidator,
    recurring: v.optional(recurringValidator),
    notes: v.optional(v.string()),
    subtasks: v.optional(v.array(v.string())),
  },
  returns: v.id("taskTemplates"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!args.title.trim()) throw new Error("Title is required");
    if (args.title.length > 200) throw new Error("Title max 200 characters");
    if (args.notes && args.notes.length > 2000) throw new Error("Notes max 2000 characters");
    if (!args.category.trim()) throw new Error("Category is required");
    if (args.category.length > 100) throw new Error("Category max 100 characters");
    if (args.subtasks && args.subtasks.length > 20) throw new Error("Max 20 subtasks");

    const existing = await ctx.db
      .query("taskTemplates")
      .withIndex("by_userId_category", (q) =>
        q.eq("userId", userId).eq("category", args.category),
      )
      .take(200);
    const maxSort = existing.reduce((m, t) => Math.max(m, t.sortOrder), 0);

    return await ctx.db.insert("taskTemplates", {
      userId,
      category: args.category.trim(),
      title: args.title.trim(),
      workstream: args.workstream,
      priority: args.priority,
      recurring: args.recurring,
      notes: args.notes?.trim() || undefined,
      subtasks: args.subtasks?.filter((s) => s.trim()),
      sortOrder: maxSort + 1000,
      createdAt: Date.now(),
    });
  },
});

export const updateTemplate = mutation({
  args: {
    templateId: v.id("taskTemplates"),
    title: v.optional(v.string()),
    category: v.optional(v.string()),
    workstream: v.optional(workstreamValidator),
    priority: v.optional(priorityValidator),
    recurring: v.optional(v.union(recurringValidator, v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    subtasks: v.optional(v.union(v.array(v.string()), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { templateId, ...updates }) => {
    const userId = await getAuthUserId(ctx);
    const tmpl = await ctx.db.get(templateId);
    if (!tmpl || tmpl.userId !== userId) throw new Error("Template not found");

    const patch: Record<string, unknown> = {};
    if (updates.title !== undefined) {
      const t = updates.title.trim();
      if (!t) throw new Error("Title is required");
      if (t.length > 200) throw new Error("Title max 200 characters");
      patch.title = t;
    }
    if (updates.category !== undefined) {
      const c = updates.category.trim();
      if (!c) throw new Error("Category is required");
      if (c.length > 100) throw new Error("Category max 100 characters");
      patch.category = c;
    }
    if (updates.workstream !== undefined) patch.workstream = updates.workstream;
    if (updates.priority !== undefined) patch.priority = updates.priority;
    if (updates.recurring !== undefined) {
      patch.recurring = updates.recurring === null ? undefined : updates.recurring;
    }
    if (updates.notes !== undefined) {
      patch.notes = updates.notes === null ? undefined : updates.notes.trim() || undefined;
    }
    if (updates.subtasks !== undefined) {
      if (updates.subtasks !== null && updates.subtasks.length > 20) {
        throw new Error("Max 20 subtasks");
      }
      patch.subtasks =
        updates.subtasks === null
          ? undefined
          : updates.subtasks.filter((s) => s.trim());
    }

    if (Object.keys(patch).length === 0) return null;
    await ctx.db.patch(templateId, patch);
    return null;
  },
});

export const deleteTemplate = mutation({
  args: { templateId: v.id("taskTemplates") },
  returns: v.null(),
  handler: async (ctx, { templateId }) => {
    const userId = await getAuthUserId(ctx);
    const tmpl = await ctx.db.get(templateId);
    if (!tmpl || tmpl.userId !== userId) throw new Error("Template not found");
    await ctx.db.delete(templateId);
    return null;
  },
});

// ── Seed defaults ────────────────────────────────────

export const seedDefaults = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const existing = await ctx.db
      .query("taskTemplates")
      .withIndex("by_userId_category", (q) => q.eq("userId", userId))
      .first();
    if (existing) return null;

    for (const cat of DEFAULT_TEMPLATES) {
      let sortOrder = 1000;
      for (const tmpl of cat.templates) {
        await ctx.db.insert("taskTemplates", {
          userId,
          category: cat.label,
          title: tmpl.title,
          workstream: tmpl.workstream,
          priority: tmpl.priority,
          recurring: tmpl.recurring,
          notes: tmpl.notes,
          subtasks: tmpl.subtasks,
          sortOrder,
          createdAt: Date.now(),
        });
        sortOrder += 1000;
      }
    }
    return null;
  },
});

// ── Create task from template ────────────────────────

export const createFromTemplate = mutation({
  args: {
    title: v.string(),
    workstream: workstreamValidator,
    priority: priorityValidator,
    recurring: v.optional(recurringValidator),
    notes: v.optional(v.string()),
    subtasks: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
    assignedStaffId: v.optional(v.id("staffMembers")),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    // Recurring tasks need a dueDate to function — default to today if not provided
    let dueDate = args.dueDate;
    if (args.recurring && !dueDate) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      dueDate = now.getTime();
    }

    const taskId = await insertTaskCore(ctx, userId, {
      title: args.title,
      workstream: args.workstream,
      priority: args.priority,
      status: "todo",
      recurring: args.recurring,
      notes: args.notes,
      dueDate,
      assignedStaffId: args.assignedStaffId,
    });

    if (args.subtasks && args.subtasks.length > 0) {
      const capped = args.subtasks.slice(0, 20);
      let nextOrder = 1000;
      for (const title of capped) {
        await ctx.db.insert("subtasks", {
          parentTaskId: taskId,
          userId,
          title: title.trim().slice(0, 200),
          isComplete: false,
          sortOrder: nextOrder,
          createdAt: Date.now(),
        });
        nextOrder += 1000;
      }
      await ctx.db.patch(taskId, {
        subtaskTotal: capped.length,
        subtaskCompleted: 0,
      });
    }

    return taskId;
  },
});

// ── Default template seed data ───────────────────────

type TemplateSeed = {
  title: string;
  workstream: "practice" | "personal" | "family";
  priority: "high" | "normal";
  recurring?: "daily" | "weekdays" | "weekly" | "monthly";
  notes?: string;
  subtasks?: string[];
};

const DEFAULT_TEMPLATES: { label: string; templates: TemplateSeed[] }[] = [
  {
    label: "Quick Tasks",
    templates: [
      { title: "Payday", workstream: "practice", priority: "high", recurring: "monthly", notes: "Staff payday. Confirm payroll was processed and deposits are correct." },
      { title: "Post next week's staff schedule", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Deadline to finalize and post the upcoming week's schedule for all staff." },
      { title: "Supply order day", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Weekly supply ordering deadline. Check stock and place orders by end of day." },
      { title: "Prepare bank deposit", workstream: "practice", priority: "normal", recurring: "daily", notes: "End-of-day deposit run. Tally payments and prepare deposit slip." },
      { title: "Morning huddle", workstream: "practice", priority: "normal", recurring: "weekdays", notes: "Quick team standup before first patient. Review schedule and flag any issues." },
      { title: "Confirm tomorrow's appointments", workstream: "practice", priority: "normal", recurring: "weekdays", notes: "Call or text patients to confirm appointments for tomorrow." },
      { title: "Check lab case status", workstream: "practice", priority: "normal", recurring: "weekdays", notes: "Verify all lab cases (crowns, bridges, dentures) are on track for scheduled appointments." },
      { title: "Quarterly tax payment due", workstream: "practice", priority: "high", notes: "Estimated quarterly tax payment deadline. Coordinate with accountant." },
      { title: "Office rent due", workstream: "practice", priority: "high", recurring: "monthly", notes: "Monthly office lease payment due." },
      { title: "Review insurance and license renewals", workstream: "practice", priority: "high", recurring: "monthly", notes: "Check upcoming renewal dates for malpractice, business insurance, DEA license, and state dental license." },
    ],
  },
  {
    label: "Payroll & Finance",
    templates: [
      { title: "Run payroll (biweekly)", workstream: "practice", priority: "high", recurring: "monthly", notes: "Process biweekly payroll for all staff. Set this to recur on your pay schedule. Verify hours, PTO, and overtime before submitting.", subtasks: ["Review timesheets and attendance", "Verify PTO and sick day balances", "Calculate overtime hours", "Submit payroll to processor", "Distribute pay stubs to staff", "File payroll tax deposits"] },
      { title: "Reconcile daily deposits", workstream: "practice", priority: "high", recurring: "daily", notes: "End-of-day financial reconciliation. Match payments received to treatment rendered.", subtasks: ["Tally cash, check, and card payments", "Match totals to practice management system", "Prepare bank deposit", "Log any discrepancies"] },
      { title: "Submit and follow up on insurance claims", workstream: "practice", priority: "high", recurring: "daily", notes: "Submit new claims and follow up on outstanding/denied claims over 30 days.", subtasks: ["Submit claims for today's completed treatments", "Review claim rejections and fix errors", "Follow up on claims over 30 days outstanding", "Appeal denied claims with supporting docs", "Post insurance payments received"] },
      { title: "Review accounts receivable", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Review aging report and patient balances. Send statements for accounts 30+ days overdue.", subtasks: ["Run aging report from practice software", "Review 30/60/90 day buckets", "Send patient statements for overdue balances", "Call patients with balances over $500", "Note accounts to send to collections if needed"] },
      { title: "Review monthly P&L statement", workstream: "practice", priority: "normal", recurring: "monthly", notes: "Review financials with accountant. Compare to budget and prior year.", subtasks: ["Collect P&L from bookkeeper or accountant", "Compare revenue to monthly goal", "Review overhead ratio (target under 60%)", "Flag any unusual expenses", "Update cash flow forecast"] },
      { title: "Pay bills and accounts payable", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Process vendor invoices, lab bills, and recurring expenses.", subtasks: ["Review incoming invoices", "Match invoices to purchase orders", "Schedule payments by due date", "Record payments in bookkeeping system"] },
    ],
  },
  {
    label: "Scheduling & Staff",
    templates: [
      { title: "Morning team huddle", workstream: "practice", priority: "high", recurring: "weekdays", notes: "10-minute standup with the team before first patient. Review schedule, flag complex cases, and set daily goals.", subtasks: ["Review today's schedule and production goals", "Identify complex or high-value cases", "Confirm any schedule gaps or cancellations", "Assign follow-up calls for open slots", "Review yesterday's production numbers"] },
      { title: "Confirm next-day appointments", workstream: "practice", priority: "high", recurring: "weekdays", notes: "Contact patients to confirm appointments for tomorrow. Fill any open slots from wait list.", subtasks: ["Call or text unconfirmed patients for tomorrow", "Update confirmation status in system", "Fill cancellations from wait list", "Confirm lab cases are ready for tomorrow", "Prepare patient charts and treatment plans"] },
      { title: "Weekly staff meeting", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Team meeting to review weekly performance, address concerns, and plan ahead.", subtasks: ["Review weekly production and collection numbers", "Discuss new patient acquisition stats", "Address any patient complaints or concerns", "Review upcoming schedule for next week", "Share practice updates and announcements"] },
      { title: "Create staff schedule for next week", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Build next week's staff schedule. Check PTO requests and ensure adequate coverage.", subtasks: ["Check PTO and vacation requests", "Ensure hygienist coverage for all columns", "Confirm front desk and assistant coverage", "Post schedule and notify staff"] },
      { title: "Review new patient phone calls", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Listen to recorded new patient calls to ensure leads are handled correctly and appointments are being booked.", subtasks: ["Select 5-10 new patient calls to review", "Evaluate phone etiquette and scheduling skills", "Note conversion rate (calls to appointments)", "Provide coaching feedback to front desk"] },
      { title: "Quarterly staff performance reviews", workstream: "practice", priority: "normal", notes: "Conduct performance evaluations for each team member. Set goals for next quarter.", subtasks: ["Prepare evaluation forms for each employee", "Review individual production metrics", "Schedule 1-on-1 meetings", "Discuss strengths and improvement areas", "Set goals and development plan for next quarter", "Document reviews in personnel files"] },
    ],
  },
  {
    label: "Supplies & Inventory",
    templates: [
      { title: "Weekly supply inventory check", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Check stock levels for commonly used dental supplies. Reorder items at or below minimum levels.", subtasks: ["Check composite and bonding agent levels", "Check anesthetic and needle stock", "Check glove, mask, and PPE supply", "Check prophy paste, fluoride, and sealant supply", "Check impression material and temporary crowns", "Check sterilization pouches and disinfectant", "Update inventory spreadsheet"] },
      { title: "Place dental supply orders", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Order supplies that are below minimum stock levels. Compare prices across vendors.", subtasks: ["Compile order list from inventory check", "Compare prices across main vendors", "Place order with primary supplier", "Confirm delivery timeline", "Update budget tracking for supply spend"] },
      { title: "Check supply and medication expiration dates", workstream: "practice", priority: "high", recurring: "monthly", notes: "Review all medications and perishable supplies for expiration. Remove expired items and reorder replacements.", subtasks: ["Check anesthetic cartridge expiration dates", "Check medication and prescription pad stock", "Check composite and bonding expiration dates", "Check emergency kit medication dates", "Remove and dispose of expired items", "Reorder replacements"] },
      { title: "Receive and store deliveries", workstream: "practice", priority: "normal", notes: "Unpack deliveries, verify against purchase orders, and store properly.", subtasks: ["Verify items received against packing slip", "Check for damaged or incorrect items", "Store items in proper locations (FIFO)", "Update inventory records", "File invoice for accounts payable"] },
      { title: "Equipment maintenance check", workstream: "practice", priority: "normal", recurring: "monthly", notes: "Preventive maintenance on dental equipment. Schedule repairs for any issues found.", subtasks: ["Test handpieces and lubricate per manufacturer", "Check compressor and vacuum system", "Test autoclave with biological indicator", "Inspect X-ray equipment and sensors", "Check operatory light function", "Review equipment service contracts and warranties", "Schedule any needed repairs"] },
    ],
  },
  {
    label: "Compliance & Safety",
    templates: [
      { title: "Monthly autoclave spore testing", workstream: "practice", priority: "high", recurring: "monthly", notes: "Biological monitoring of sterilization equipment. Required by state dental board and OSHA.", subtasks: ["Run biological indicator (spore test) in autoclave", "Send test to monitoring service or incubate in-office", "Log results in sterilization records", "Post results in sterilization area", "If positive: pull autoclave from service and investigate"] },
      { title: "OSHA compliance monthly review", workstream: "practice", priority: "high", recurring: "monthly", notes: "Monthly OSHA compliance checkpoint. Ensure all safety protocols are current.", subtasks: ["Verify SDS sheets are current and accessible", "Check eyewash station function", "Inspect fire extinguishers", "Review sharps container disposal schedule", "Verify PPE stock levels", "Check hazardous waste pickup schedule", "Update exposure control plan if needed"] },
      { title: "HIPAA compliance review", workstream: "practice", priority: "high", recurring: "monthly", notes: "Review HIPAA compliance measures. Protect patient PHI and ensure staff adherence.", subtasks: ["Verify computer screens are locked when unattended", "Check that patient records are stored securely", "Review user access logs in practice software", "Confirm patient sign-in sheets protect PHI", "Verify shredding of documents with PHI", "Review any breach incidents or near-misses"] },
      { title: "Annual OSHA and safety training", workstream: "practice", priority: "high", notes: "Annual bloodborne pathogen and hazard communication training for all staff. Required by OSHA.", subtasks: ["Schedule training session for all staff", "Update bloodborne pathogen training materials", "Review hazard communication program", "Conduct training session", "Collect signed acknowledgment forms", "File training records in compliance binder", "Update Hepatitis B vaccination records"] },
      { title: "Annual HIPAA training", workstream: "practice", priority: "high", notes: "Annual HIPAA privacy and security awareness training for all employees who handle PHI.", subtasks: ["Schedule training for all staff (including interns)", "Review updates to HIPAA regulations", "Conduct training session", "Collect signed acknowledgment forms", "Update Notice of Privacy Practices if needed", "File training documentation"] },
      { title: "Infection control audit", workstream: "practice", priority: "high", recurring: "monthly", notes: "Audit infection control protocols and ensure CDC guidelines are followed.", subtasks: ["Observe hand hygiene compliance", "Verify proper PPE use in operatories", "Check instrument sterilization workflow", "Inspect surface disinfection procedures", "Review waterline treatment protocol", "Document findings and corrective actions"] },
    ],
  },
  {
    label: "Patient Experience",
    templates: [
      { title: "Post-treatment patient follow-up calls", workstream: "practice", priority: "normal", recurring: "daily", notes: "Call patients from previous day who had major procedures (extractions, crowns, root canals) to check on recovery.", subtasks: ["Pull list of yesterday's major procedures", "Call each patient to check on comfort", "Document any concerns or complications", "Schedule follow-up appointment if needed"] },
      { title: "Contact overdue recall patients", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Reach out to patients overdue for hygiene visits. Target 6+ months since last cleaning.", subtasks: ["Run overdue recall report", "Send reminder postcards or emails", "Call patients 3+ months overdue", "Offer flexible scheduling options", "Update patient contact info as needed"] },
      { title: "Request and monitor patient reviews", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Follow up with happy patients for Google/Yelp reviews. Respond to any new reviews.", subtasks: ["Send review request to satisfied patients", "Check Google and Yelp for new reviews", "Respond to all new reviews (positive and negative)", "Flag any negative reviews for manager attention"] },
      { title: "Follow up on unscheduled treatment plans", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Contact patients with diagnosed but unscheduled treatment. Help overcome barriers to scheduling.", subtasks: ["Run unscheduled treatment report", "Prioritize urgent cases first", "Call patients about pending treatment", "Discuss financial options and insurance coverage", "Schedule appointments for ready patients"] },
    ],
  },
  {
    label: "Marketing & Growth",
    templates: [
      { title: "Social media content for the week", workstream: "practice", priority: "normal", recurring: "weekly", notes: "Plan and schedule social media posts. Mix educational content, team highlights, and patient testimonials.", subtasks: ["Plan 3-5 posts for the week", "Create or source images and graphics", "Write captions with calls to action", "Schedule posts across platforms", "Review engagement on last week's posts"] },
      { title: "Track new patient metrics", workstream: "practice", priority: "normal", recurring: "monthly", notes: "Review new patient acquisition numbers, sources, and conversion rates.", subtasks: ["Count total new patients this month", "Break down by referral source", "Calculate cost per acquisition by channel", "Compare to monthly goal", "Adjust marketing spend based on ROI"] },
      { title: "Review and update practice website", workstream: "practice", priority: "normal", notes: "Ensure website content, hours, team bios, and services are current.", subtasks: ["Verify hours and contact info are correct", "Update team photos and bios", "Check that online scheduling is working", "Review SEO and Google Business profile", "Add any new services or promotions"] },
    ],
  },
  {
    label: "Opening & Closing",
    templates: [
      { title: "Office opening checklist", workstream: "practice", priority: "normal", recurring: "weekdays", notes: "Daily opening procedures to prepare the office before the first patient.", subtasks: ["Unlock office and disarm alarm", "Turn on lights and equipment", "Boot up computers and practice software", "Check voicemails and overnight messages", "Review and print daily schedule", "Verify operatories are stocked and ready", "Turn on water to dental units"] },
      { title: "End of day closing checklist", workstream: "practice", priority: "normal", recurring: "weekdays", notes: "Daily closing procedures. Secure the office and prepare for next day.", subtasks: ["Verify all charts and notes are completed", "Reconcile daily payments and prepare deposit", "Run end-of-day reports", "Confirm next day's appointments", "Flush dental unit waterlines", "Clean and disinfect common areas", "Shut down computers and equipment", "Set alarm and lock up"] },
    ],
  },
];
