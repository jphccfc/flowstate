import { describe, expect, it } from "vitest";
import { filterAssessmentTasks, type AssessmentTaskFilter } from "@/lib/tasks/filter";

type Task = { id: string; title: string; status: string; dueDate: string };

const tasks: Task[] = [
  { id: "open", title: "Request evidence", status: "OPEN", dueDate: "2026-09-10" },
  { id: "blocked", title: "Resolve blocker", status: "BLOCKED", dueDate: "2026-09-11" },
  { id: "done", title: "Complete report", status: "COMPLETED", dueDate: "2026-09-12" },
];

describe("filterAssessmentTasks", () => {
  it.each([
    ["ALL", 3],
    ["OPEN", 1],
    ["BLOCKED", 1],
    ["COMPLETED", 1],
  ] as const)("returns %s tasks for the selected status", (filter: AssessmentTaskFilter, count) => {
    expect(filterAssessmentTasks(tasks, filter)).toHaveLength(count);
  });

  it("keeps the original task order when showing all tasks", () => {
    expect(filterAssessmentTasks(tasks, "ALL").map((task) => task.id)).toEqual(["open", "blocked", "done"]);
  });
});
