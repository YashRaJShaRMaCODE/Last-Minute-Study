import assert from "node:assert/strict";
import test from "node:test";
import { parseSavedState } from "../app/study-state.ts";

const parseDate = (examDate) => parseSavedState(JSON.stringify({ subjects: [], examDate })).examDate;

test("keeps valid calendar dates, including leap days", () => {
  assert.equal(parseDate("2024-02-29"), "2024-02-29");
});

test("discards impossible or malformed exam dates from backups", () => {
  for (const value of ["2026-02-31", "2025-02-29", "2026-13-01", "2026-00-10", "2026-04-00", "2026/04/01"]) {
    assert.equal(parseDate(value), "", value);
  }
});
