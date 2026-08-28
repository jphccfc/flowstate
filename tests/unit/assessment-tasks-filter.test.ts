import { describe, expect, it } from "vitest";
import { filterAssessmentTasks, type AssessmentTaskFilters } from "@/lib/tasks/filter";

type Task = { id: string; title: string; status: string; dueDate: string; assignee?: { id: string } | null };
const tasks: Task[] = [
  { id: "open-alice", title: "Request evidence", status: "OPEN", dueDate: "2026-09-10", assignee: { id: "alice" } },
  { id: "blocked-alice", title: "Resolve blocker", status: "BLOCKED", dueDate: "2026-09-11", assignee: { id: "alice" } },
  { id: "done-bob", title: "Complete report", status: "COMPLETED", dueDate: "2026-09-12", assignee: { id: "bob" } },
  { id: "open-unassigned", title: "Schedule interview", status: "OPEN", dueDate: "2026-09-13", assignee: null },
];
const noFilters: AssessmentTaskFilters = { assigneeId: "ALL", status: "ALL", dueDate: "ALL" };
describe("filterAssessmentTasks", () => {
  it("returns all tasks when no filters are selected", () => expect(filterAssessmentTasks(tasks, noFilters).map((task) => task.id)).toEqual(["open-alice", "blocked-alice", "done-bob", "open-unassigned"]));
  it("filters by assigned user, including unassigned tasks", () => {
    expect(filterAssessmentTasks(tasks, { ...noFilters, assigneeId: "alice" }).map((task) => task.id)).toEqual(["open-alice", "blocked-alice"]);
    expect(filterAssessmentTasks(tasks, { ...noFilters, assigneeId: "UNASSIGNED" }).map((task) => task.id)).toEqual(["open-unassigned"]);
  });
  it("filters by status and due date together", () => expect(filterAssessmentTasks(tasks, { assigneeId: "ALL", status: "OPEN", dueDate: "2026-09-13" }).map((task) => task.id)).toEqual(["open-unassigned"]));
  it("supports overdue due-date filtering and excludes tasks without a due date", () => {
    expect(filterAssessmentTasks(tasks, { ...noFilters, dueDate: "OVERDUE" }, new Date("2026-09-12T12:00:00Z")).map((task) => task.id)).toEqual(["open-alice", "blocked-alice"]);
    expect(filterAssessmentTasks([{ ...tasks[0], dueDate: "" }], { ...noFilters, dueDate: "OVERDUE" }, new Date("2026-09-12T12:00:00Z"))).toEqual([]);
  });
});
