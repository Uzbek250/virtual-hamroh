export interface SyncConfig<T> {
  endpoint: string;
  userId: string;
  items: T[];
  toPayload: (item: T) => Record<string, unknown>;
}

export async function syncUserCollection<T>({ endpoint, userId, items, toPayload }: SyncConfig<T>) {
  await Promise.all(
    items.map(async (item) => {
      try {
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, ...toPayload(item) }),
        });
      } catch (error) {
        console.warn(`Sync failed for ${endpoint}:`, error);
      }
    }),
  );
}
