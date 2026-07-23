// Dependency-free worker pool: each worker pulls the next index off a
// shared cursor until the list is exhausted. No ordering guarantee across
// items — fine for callers that only care about the aggregate result, not
// per-item order (sync.ts's classify loop only reports a processed count;
// candidates.ts's metadata fetch collects into a Set).
export async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
}
