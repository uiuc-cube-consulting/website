export const STATUSES = ["todo", "in_progress", "blocked", "in_review", "done"] as const;
export type Status = typeof STATUSES[number];
export const STATUS_LABEL: Record<Status, string> = { todo: "To do", in_progress: "In progress", blocked: "Blocked", in_review: "In review", done: "Done" };
export type Project = { id: string; name: string; client: string | null; cohort: string; active: boolean };
export type Teammate = { member_id: string; seat: string; full_name: string };
export type Workstream = { id: string; project_id: string; title: string; description: string };
export type WorkItem = {
  id: string; project_id: string; workstream_id: string | null; title: string; description: string;
  assignee_id: string | null; due_on: string | null; status: Status; deliverable_url: string;
  updated_at: string;
};
export type Board = { project: Project; member_id: string; can_manage: boolean; members: Teammate[]; workstreams: Workstream[]; tasks: WorkItem[] };
export class WorkError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function identifier(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new WorkError("Invalid project or work item.");
  return value;
}
function text(value: unknown, name: string, limit: number, required = false): string {
  if (typeof value !== "string" || value.length > limit || (required && !value.trim())) throw new WorkError(`${name} must be ${required ? "nonempty " : ""}text under ${limit} characters.`);
  return value.trim();
}
function link(value: unknown): string {
  const valueText = text(value, "Deliverable URL", 500);
  if (!valueText) return "";
  try {
    const url = new URL(valueText);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw new WorkError("Use an http or https deliverable link without credentials."); }
}
export type Action =
  | { action: "create_stream"; project_id: string; title: string; description: string }
  | { action: "create_task" | "edit_task"; project_id: string; task_id?: string; expected_updated_at?: string; workstream_id: string | null; assignee_id: string | null; title: string; description: string; due_on: string | null; status: Status; deliverable_url: string }
  | { action: "progress"; project_id: string; task_id: string; expected_updated_at: string; status: Status; deliverable_url: string };
export function parseAction(value: unknown): Action {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkError("Expected a work item.");
  const v = value as Record<string, unknown>;
  const project_id = identifier(v.project_id);
  if (v.action === "create_stream") return { action: v.action, project_id, title: text(v.title, "Workstream title", 120, true), description: text(v.description, "Description", 1000) };
  if (!["create_task", "edit_task", "progress"].includes(v.action as string)) throw new WorkError("Unknown work action.");
  if (!(STATUSES as readonly unknown[]).includes(v.status)) throw new WorkError("Choose a task status.");
  let update = {};
  if (v.action !== "create_task") {
    if (typeof v.expected_updated_at !== "string" || !Number.isFinite(Date.parse(v.expected_updated_at))) throw new WorkError("Reload this item before updating it.");
    update = { task_id: identifier(v.task_id), expected_updated_at: v.expected_updated_at };
  }
  const base = { project_id, status: v.status as Status, deliverable_url: link(v.deliverable_url) };
  if (v.action === "progress") return { action: "progress", ...base, ...update } as Action;
  const due = v.due_on;
  if (due !== null && (typeof due !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due)) || new Date(due).toISOString().slice(0,10) !== due)) throw new WorkError("Choose a valid deadline date.");
  return { action: v.action as "create_task" | "edit_task", ...base, ...update,
    workstream_id: v.workstream_id === null ? null : identifier(v.workstream_id),
    assignee_id: v.assignee_id === null ? null : identifier(v.assignee_id),
    title: text(v.title, "Deliverable title", 160, true), description: text(v.description, "Success criteria", 2000),
    due_on: due as string | null };
}
export function canManage(role: string, seat: string | null): boolean {
  return role === "exec" || seat === "project_manager" || seat === "senior_consultant";
}
/** Deadline is a calendar date; not a midnight-UTC timestamp. */
export function overdue(task: WorkItem, today: string): boolean {
  return Boolean(task.due_on && task.due_on < today && task.status !== "done");
}
