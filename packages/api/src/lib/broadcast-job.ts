import { z } from "zod";

/** Recipients per queue message: small enough to send within one consumer invocation, and to stay under D1's 100 binds. */
export const RECIPIENTS_PER_JOB = 50;

export const broadcastJobSchema = z.object({
  kind: z.literal("broadcast.send"),
  broadcastId: z.string().min(1),
  recipientIds: z.array(z.string().min(1)).min(1).max(RECIPIENTS_PER_JOB),
});

export type BroadcastJob = z.infer<typeof broadcastJobSchema>;

/** One job per slice of recipients, in order. */
export function broadcastJobs(
  broadcastId: string,
  recipientIds: readonly string[],
): BroadcastJob[] {
  const jobs: BroadcastJob[] = [];
  for (let i = 0; i < recipientIds.length; i += RECIPIENTS_PER_JOB) {
    jobs.push({
      kind: "broadcast.send",
      broadcastId,
      recipientIds: recipientIds.slice(i, i + RECIPIENTS_PER_JOB),
    });
  }
  return jobs;
}
