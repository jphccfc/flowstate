export const assessmentTaskStatuses = ["ALL", "OPEN", "AWAITING_INPUT", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
export type AssessmentTaskStatus = (typeof assessmentTaskStatuses)[number];
export const assessmentTaskDueDateFilters = ["ALL", "OVERDUE", "TODAY", "THIS_WEEK", "NO_DUE_DATE"] as const;
export type AssessmentTaskDueDateFilter = (typeof assessmentTaskDueDateFilters)[number];
export type AssessmentTaskFilters = {
  assigneeId: string;
  status: AssessmentTaskStatus;
  dueDate: AssessmentTaskDueDateFilter | string;
};

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDueDateMatch(value: string, filter: AssessmentTaskDueDateFilter, today: Date): boolean {
  if (filter === "ALL") return true;
  if (filter === "NO_DUE_DATE") return !value;
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(filter)) return value.slice(0, 10) === filter;
  const todayKey = localDateKey(today);
  if (filter === "TODAY") return value.slice(0, 10) === todayKey;
  if (filter === "OVERDUE") return value.slice(0, 10) < todayKey;
  const day = new Date(today);
  const dayOfWeek = day.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  day.setDate(day.getDate() + mondayOffset);
  const start = localDateKey(day);
  day.setDate(day.getDate() + 6);
  const end = localDateKey(day);
  const key = value.slice(0, 10);
  return key >= start && key <= end;
}

export function filterAssessmentTasks<T extends { status: string; dueDate: string; assignee?: { id: string } | null }>(
  tasks: T[], filters: AssessmentTaskFilters, today = new Date(),
): T[] {
  return tasks.filter((task) =>
    (filters.assigneeId === "ALL" || (filters.assigneeId === "UNASSIGNED" ? !task.assignee : task.assignee?.id === filters.assigneeId)) &&
    (filters.status === "ALL" || task.status === filters.status) &&
    isDueDateMatch(task.dueDate, filters.dueDate as AssessmentTaskDueDateFilter, today),
  );
}
