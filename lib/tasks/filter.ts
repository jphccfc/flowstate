export const assessmentTaskFilters = ["ALL", "OPEN", "AWAITING_INPUT", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
export type AssessmentTaskFilter = (typeof assessmentTaskFilters)[number];

export function filterAssessmentTasks<T extends { status: string }>(tasks: T[], filter: AssessmentTaskFilter): T[] {
  if (filter === "ALL") return tasks;
  return tasks.filter((task) => task.status === filter);
}
