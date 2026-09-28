interface CacheEntry {
    data: any;
    expires: number;
}

const store = new Map<string, CacheEntry>();
const keysByTable = new Map<string, Set<string>>();

export function getCached(key: string): any {
    const entry = store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expires) {
        store.delete(key);
        return undefined;
    }

    return entry.data;
}

export function setCached(key: string, data: any, ttlMs: number, tables: string[]): void {
    store.set(key, { data, expires: Date.now() + ttlMs });

    for (const table of tables) {
        if (!keysByTable.has(table)) keysByTable.set(table, new Set());
        keysByTable.get(table)!.add(key);
    }
}

export function invalidateTables(tables: string[]): number {
    let invalidated = 0;

    for (const table of tables) {
        const keys = keysByTable.get(table);
        if (!keys) continue;

        for (const key of keys) {
            if (store.delete(key)) invalidated++;
        }

        keysByTable.delete(table);
    }

    return invalidated;
}

export function clearCache(): void {
    store.clear();
    keysByTable.clear();
}

export function cacheSize(): number {
    return store.size;
}
