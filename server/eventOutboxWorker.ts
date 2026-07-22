import { processPendingOutbox } from "./eventBus";

const pollIntervalMs = Number(process.env.EVENT_OUTBOX_POLL_INTERVAL_MS || 1_000);
const batchSize = Number(process.env.EVENT_OUTBOX_BATCH_SIZE || 100);
let stopping = false;
let inFlight = false;

async function poll(): Promise<void> {
  if (stopping || inFlight) return;
  inFlight = true;
  try {
    const results = await processPendingOutbox(batchSize);
    const failed = results.filter((record) => record.deliveryStatus !== "published").length;
    if (results.length) {
      console.info(`[EventOutbox] processed=${results.length} published=${results.length - failed} deferred_or_dead_lettered=${failed}`);
    }
  } catch (error) {
    console.error("[EventOutbox] polling cycle failed", error);
  } finally {
    inFlight = false;
  }
}

async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.info(`[EventOutbox] received ${signal}; waiting for active delivery cycle`);
  while (inFlight) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  process.exit(0);
}

process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));

if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 100) {
  throw new Error("EVENT_OUTBOX_POLL_INTERVAL_MS must be a number of at least 100 milliseconds");
}
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
  throw new Error("EVENT_OUTBOX_BATCH_SIZE must be an integer between 1 and 1000");
}

console.info(`[EventOutbox] worker started interval_ms=${pollIntervalMs} batch_size=${batchSize}`);
void poll();
setInterval(() => void poll(), pollIntervalMs).unref();
