import { getPool } from './pool';
import { logSlowQuery, logDebug } from './logger';
import { QueryParams, TransactionQuery } from './types';
import { hashQuery, extractTables, isWriteQuery } from './fingerprint';
import { getCached, setCached, invalidateTables, clearCache, epochOf } from './cache';
import { coalesce } from './coalesce';
import { recordQuery, recordError } from './stats';
import { prepareQuery, plainRows } from './params';

const SLOW_QUERY_MS = parseInt(GetConvar('nbmysql_slow_query_ms', '150'), 10) || 150;
const DEFAULT_CACHE_TTL_MS = parseInt(GetConvar('nbmysql_cache_ttl_ms', '5000'), 10) || 5000;
const MAX_RETRIES = parseInt(GetConvar('nbmysql_max_retries', '3'), 10) || 3;
const RETRYABLE_CODES = new Set(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ER_CON_COUNT_ERROR']);

export function currentResource(): string {
    try {
        return GetInvokingResource() || 'unknown';
    } catch {
        return 'unknown';
    }
}

async function withRetry<T>(fn: () => Promise<T>, retry: boolean): Promise<T> {
    let attempt = 0;

    for (;;) {
        try {
            return await fn();
        } catch (err: any) {
            attempt++;

            if (!retry || attempt > MAX_RETRIES || !RETRYABLE_CODES.has(err?.code)) throw err;

            await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1)));
        }
    }
}

async function timed<T>(sql: string, resource: string, fn: () => Promise<T>, retry = true): Promise<T> {
    const start = Date.now();

    try {
        const result = await withRetry(fn, retry);
        const elapsed = Date.now() - start;
        const slow = elapsed >= SLOW_QUERY_MS;

        recordQuery(resource, elapsed, slow);
        logDebug(`${resource}: ${elapsed}ms ${sql}`);
        if (slow) logSlowQuery(sql, elapsed, resource);

        return result;
    } catch (err) {
        recordError(resource);
        throw err;
    }
}

function invalidateFor(sql: string): void {
    const tables = extractTables(sql);

    if (tables.length) invalidateTables(tables);
    else clearCache();
}

async function run(sql: string, params: QueryParams | null | undefined, resource: string): Promise<any> {
    const prepared = prepareQuery(sql, params);


    const write = isWriteQuery(prepared.sql);

    return timed(
        prepared.sql,
        resource,
        async () => {
            const [result] = await getPool().query(prepared.sql, prepared.params as any);
            if (write) invalidateFor(prepared.sql);
            return result;
        },
        !write,
    );
}

export async function query(sql: string, params?: QueryParams | null): Promise<any[]> {
    const resource = currentResource();
    return plainRows(await run(sql, params, resource));
}

export async function cachedQuery(sql: string, params?: QueryParams | null, ttlMs?: number | null): Promise<any[]> {
    const resource = currentResource();
    const prepared = prepareQuery(sql, params);
    const ttl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : DEFAULT_CACHE_TTL_MS;
    const key = hashQuery(prepared.sql, prepared.params as any);
    const cached = getCached(key);

    if (cached !== undefined) return cached;

    return coalesce(key, async () => {
        const tables = extractTables(prepared.sql);
        const epoch = epochOf(tables);
        const rows = plainRows(await run(prepared.sql, prepared.params as any, resource));

        setCached(key, rows, ttl, tables, epoch);
        return rows;
    });
}

export async function scalar(sql: string, params?: QueryParams | null): Promise<any> {
    const rows = await query(sql, params);
    if (!Array.isArray(rows) || !rows.length || !rows[0] || typeof rows[0] !== 'object') return null;

    const values = Object.values(rows[0]);
    return values.length ? values[0] : null;
}

export async function single(sql: string, params?: QueryParams | null): Promise<any | null> {
    const rows = await query(sql, params);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function insert(sql: string, params?: QueryParams | null): Promise<number> {
    const resource = currentResource();
    const result = await run(sql, params, resource);
    return result?.insertId ?? 0;
}

export async function update(sql: string, params?: QueryParams | null): Promise<number> {
    const resource = currentResource();
    const result = await run(sql, params, resource);
    return result?.affectedRows ?? 0;
}

export async function prepare(sql: string, params?: QueryParams | null): Promise<any[]> {
    return query(sql, params);
}

type RawTransactionEntry = string | any[] | (Partial<TransactionQuery> & { sql?: string; values?: any; parameters?: any });

function normalizeTransaction(queries: unknown, shared?: QueryParams | null): { sql: string; params: any }[] {
    let list: any[];

    if (Array.isArray(queries)) list = queries;
    else if (queries && typeof queries === 'object') list = Object.values(queries as Record<string, any>);
    else throw new Error(`transaction expects an array of queries (got ${queries === null || queries === undefined ? 'nil' : typeof queries})`);

    return list.map((entry: RawTransactionEntry) => {
        if (typeof entry === 'string') return prepareQuery(entry, shared);

        if (Array.isArray(entry)) return prepareQuery(entry[0], entry[1] ?? shared);

        if (entry && typeof entry === 'object') {
            const sql = entry.query ?? entry.sql ?? (entry as any)[1];
            const params = entry.params ?? entry.values ?? entry.parameters ?? (entry as any)[2] ?? shared;
            return prepareQuery(sql, params);
        }

        throw new Error('transaction entries must be strings, arrays or { query, params } tables');
    });
}

export async function transaction(queries: TransactionQuery[], shared?: QueryParams | null): Promise<boolean> {
    const resource = currentResource();
    const entries = normalizeTransaction(queries, shared);

    if (!entries.length) return true;

    const label = `TRANSACTION (${entries.length} statements)`;

    return timed(
        label,
        resource,
        async () => {
            const connection = await getPool().getConnection();
            let broken = false;

            try {
                await connection.beginTransaction();

                for (const { sql, params } of entries) await connection.query(sql, params as any);

                await connection.commit();
            } catch (err) {
                try {
                    await connection.rollback();
                } catch {
                    broken = true;
                }

                throw err;
            } finally {
                if (broken) connection.destroy();
                else connection.release();
            }

            const touched = new Set<string>();
            let unknown = false;

            for (const { sql } of entries) {
                const tables = extractTables(sql);
                if (!tables.length && isWriteQuery(sql)) unknown = true;
                tables.forEach((table) => touched.add(table));
            }

            if (unknown) clearCache();
            else invalidateTables([...touched]);

            return true;
        },
        false,
    );
}
