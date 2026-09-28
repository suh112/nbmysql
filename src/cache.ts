interface CacheEntry {
    data: any;
    expires: number;
}

const MAX_ENTRIES = 5000;
const SWEEP_INTERVAL_MS = 30000;

const store = new Map<string, CacheEntry>();
const keysByTable = new Map<string, Set<string>>();
const tableEpoch = new Map<string, number>();
let globalEpoch = 0;

export function epochOf(tables: string[]): number {
    let total = globalEpoch;
    for (const table of tables) total += tableEpoch.get(table) ?? 0;
    return total;
}

export function getCached(key: string): any {
    const entry = store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expires) {
        store.delete(key);
        return undefined;
    }

    return entry.data;
}

export function setCached(key: string, data: any, ttlMs: number, tables: string[], epoch?: number): void {

    if (epoch !== undefined && epoch !== epochOf(tables)) return;

    if (store.size >= MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
    }

    store.set(key, { data, expires: Date.now() + ttlMs });

    for (const table of tables) {
        let keys = keysByTable.get(table);

        if (!keys) {
            keys = new Set();
            keysByTable.set(table, keys);
        }

        keys.add(key);
    }
}

export function invalidateTables(tables: string[]): number {
    let invalidated = 0;

    for (const table of tables) {
        tableEpoch.set(table, (tableEpoch.get(table) ?? 0) + 1);

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
    globalEpoch++;
    store.clear();
    keysByTable.clear();
}

export function cacheSize(): number {
    return store.size;
}

function sweep(): void {
    const now = Date.now();

    for (const [key, entry] of store) {
        if (now > entry.expires) store.delete(key);
    }

    for (const [table, keys] of keysByTable) {
        for (const key of keys) {
            if (!store.has(key)) keys.delete(key);
        }

        if (!keys.size) keysByTable.delete(table);
    }
}

const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
if (typeof (timer as any).unref === 'function') (timer as any).unref();
