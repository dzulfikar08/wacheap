import { describe, expect, test } from "bun:test";

import { broadcastJobSchema, broadcastJobs, RECIPIENTS_PER_JOB } from "./broadcast-job";

describe("broadcastJobs", () => {
  test("slices recipients in order and every job passes the schema", () => {
    const ids = Array.from({ length: RECIPIENTS_PER_JOB * 2 + 3 }, (_, i) => `c${i}`);
    const jobs = broadcastJobs("b1", ids);
    expect(jobs.map((j) => j.recipientIds.length)).toEqual([
      RECIPIENTS_PER_JOB,
      RECIPIENTS_PER_JOB,
      3,
    ]);
    expect(jobs.flatMap((j) => j.recipientIds)).toEqual(ids);
    for (const job of jobs) expect(broadcastJobSchema.safeParse(job).success).toBe(true);
  });

  test("no recipients, no jobs", () => {
    expect(broadcastJobs("b1", [])).toEqual([]);
  });

  test("the schema rejects an oversized or empty job", () => {
    const tooMany = Array.from({ length: RECIPIENTS_PER_JOB + 1 }, (_, i) => `c${i}`);
    expect(
      broadcastJobSchema.safeParse({
        kind: "broadcast.send",
        broadcastId: "b",
        recipientIds: tooMany,
      }).success,
    ).toBe(false);
    expect(
      broadcastJobSchema.safeParse({ kind: "broadcast.send", broadcastId: "b", recipientIds: [] })
        .success,
    ).toBe(false);
  });
});
