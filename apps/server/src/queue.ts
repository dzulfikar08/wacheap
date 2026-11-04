import { broadcastJobSchema, type BroadcastJob } from "@wacheap/api/lib/broadcast-job";

/** Sends one slice of a broadcast. The Cloud API call, throttling and status rows arrive with WAB-7. */
async function sendBroadcastSlice(job: BroadcastJob): Promise<void> {
  console.log(
    `broadcast ${job.broadcastId}: ${job.recipientIds.length} recipients queued (sender not built yet)`,
  );
}

export async function handleQueue(batch: MessageBatch<unknown>): Promise<void> {
  for (const message of batch.messages) {
    const job = broadcastJobSchema.safeParse(message.body);
    if (!job.success) {
      // A malformed job never succeeds on retry; drop it, keep the reason in the logs.
      console.error(
        `queue ${batch.queue}: dropping malformed message ${message.id}`,
        job.error.issues,
      );
      message.ack();
      continue;
    }
    try {
      await sendBroadcastSlice(job.data);
      message.ack();
    } catch (error) {
      console.error(`queue ${batch.queue}: message ${message.id} failed, will retry`, error);
      message.retry();
    }
  }
}
