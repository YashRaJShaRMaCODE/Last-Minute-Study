import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyPlan, calendarDaysUntil, currentStudyStreak, parseSavedState, recentStudyWeek, recordFocusSession } from "../app/study-state.ts";

const parseDate = (examDate) => parseSavedState(JSON.stringify({ subjects: [], examDate })).examDate;

test("keeps valid calendar dates, including leap days", () => {
  assert.equal(parseDate("2024-02-29"), "2024-02-29");
});

test("discards impossible or malformed exam dates from backups", () => {
  for (const value of ["2026-02-31", "2025-02-29", "2026-13-01", "2026-00-10", "2026-04-00", "2026/04/01"]) {
    assert.equal(parseDate(value), "", value);
  }
});

test("counts calendar days correctly across daylight-saving changes", () => {
  assert.equal(calendarDaysUntil("2026-11-02", new Date(2026, 10, 1).getTime()), 1);
  assert.equal(calendarDaysUntil("2026-03-09", new Date(2026, 2, 8).getTime()), 1);
});

test("migrates older topics to normal priority and validates saved priorities", () => {
  const state = parseSavedState(JSON.stringify({ subjects: [{
    id: "math", name: "Math", topics: [
      { id: "old", title: "Older backup topic", minutes: 20, done: false },
      { id: "new", title: "Current topic", minutes: 15, done: false, priority: "high" },
      { id: "bad", title: "Invalid priority", minutes: 10, done: false, priority: "urgent" },
    ],
  }] }));
  assert.deepEqual(state.subjects[0].topics.map((topic) => topic.priority), ["medium", "high", "medium"]);
});

test("builds a priority-first daily plan within its time budget without completing topics", () => {
  const state = parseSavedState(JSON.stringify({ subjects: [{
    id: "math", name: "Math", topics: [
      { id: "large", title: "Long high priority", minutes: 30, done: false, priority: "high" },
      { id: "short", title: "Short high priority", minutes: 15, done: false, priority: "high" },
      { id: "medium", title: "Medium priority", minutes: 20, done: false, priority: "medium" },
      { id: "small", title: "Small low priority", minutes: 5, done: false, priority: "low" },
      { id: "done", title: "Already done", minutes: 5, done: true, priority: "high" },
    ],
  }] }));
  const plan = buildDailyPlan(state.subjects, 25);
  assert.deepEqual(plan.map((topic) => topic.id), ["short", "small"]);
  assert.equal(plan.reduce((sum, topic) => sum + topic.minutes, 0), 20);
  assert.equal(plan.some((topic) => topic.done), false);
  assert.equal(state.subjects[0].topics.find((topic) => topic.id === "done").done, true);
});

test("completed focus sessions update local study days and a consecutive streak only", () => {
  const state = parseSavedState(JSON.stringify({ subjects: [], focusSessions: 4, studyDays: ["2026-04-09"] }));
  const next = recordFocusSession(state, "2026-04-10");
  const today = new Date(2026, 3, 10, 12).getTime();
  assert.equal(next.focusSessions, 5);
  assert.deepEqual(next.studyDays, ["2026-04-09", "2026-04-10"]);
  assert.equal(currentStudyStreak(next.studyDays, today), 2);
  assert.equal(recentStudyWeek(next.studyDays, today).filter((day) => day.studied).length, 2);
  assert.equal(currentStudyStreak(next.studyDays, new Date(2026, 3, 12, 12).getTime()), 0);
  assert.equal(recordFocusSession(next, "not-a-date"), next);
});
