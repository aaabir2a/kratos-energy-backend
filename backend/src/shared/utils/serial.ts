/**
 * Run background work one-at-a-time per key.
 *
 * The messaging hooks are fire-and-forget so a stage change is not slowed by
 * enrolling a sequence. Two actions on the same deal in quick succession —
 * "quote sent" then "closed won" — would otherwise interleave, and a stop
 * belonging to the first could land after the enrol belonging to the second,
 * cancelling a sequence that should be running.
 *
 * Chaining by key keeps each entity's events in the order they happened while
 * leaving different entities fully concurrent. One API process handles this;
 * if that ever changes, the ordering guarantee has to move into the database.
 */
const chains = new Map<string, Promise<unknown>>();

export function runSerial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  // Run regardless of whether the previous task resolved or rejected — one
  // failure must not strand everything queued behind it.
  const next = previous.then(fn, fn);

  const tracked = next.catch(() => undefined);
  chains.set(key, tracked);
  void tracked.then(() => {
    // Only clear if nothing newer has queued behind us.
    if (chains.get(key) === tracked) chains.delete(key);
  });

  return next;
}

/** Wait for a key's queued work to finish. Tests and shutdown only. */
export async function drainSerial(key: string): Promise<void> {
  await (chains.get(key) ?? Promise.resolve());
}
