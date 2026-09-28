import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from './pool';
import { logSlowQuery } from './logger';
import { QueryParams, TransactionQuery } from './types';
import { hashQuery, extractTables } from './fingerprint';
import { getCached, setCached, invalidateTables } from './cache';
import { coalesce } from './coalesce';
import { recordQuery, recordError } from './stats';

const SLOW_QUERY_MS = parseInt(GetConvar('nbmysql_slow_query_ms', '150'), 10) || 150;
const DEFAULT_CACHE_TTL_MS = parseInt(GetConvar('nbmysql_cache_ttl_ms', '5000'), 10) || 5000;
const MAX_RETRIES = parseInt(GetConvar('nbmysql_max_retries', '3'), 10) || 3;
const RETRYABLE_CODES = new Set(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ETIMEDOUT', 'ER_CON_COUNT_ERROR']);

function currentResource(): string {
    try {
        return GetInvokingResource() || 'unknown';
    } catch {
        return 'unknown';
    }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;

    for (;;) {
        try {
            return await fn();
        } catch (err: any) {
            attempt++;

            if (attempt > MAX_RETRIES || !RETRYABLE_CODES.has(err?.code)) throw err;

            const delay = 100 * 2 ** (attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}

async function timed<T>(sql: string, resource: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();

    try {
        const result = await withRetry(fn);
        const elapsed = Date.now() - start;
        const slow = elapsed >= SLOW_QUERY_MS;

        recordQuery(resource, elapsed, slow);
        if (slow) logSlowQuery(sql, elapsed);

        return result;
    } catch (err) {
        recordError(resource);
        throw err;
    }
}

export async function query(sql: string, params?: QueryParams): Promise<RowDataPacket[]> {
    const resource = currentResource();

    return timed(sql, resource, async () => {
        const [rows] = await getPool().query<RowDataPacket[]>(sql, params as any);
        return rows;
    });
}

export async function cachedQuery(sql: string, params: QueryParams | undefined, ttlMs?: number | null): Promise<RowDataPacket[]> {
    const ttl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : DEFAULT_CACHE_TTL_MS;
    const key = hashQuery(sql, params);
    const cached = getCached(key);
    if (cached !== undefined) return cached;

    return coalesce(key, async () => {
        const rows = await query(sql, params);
        setCached(key, rows, ttl, extractTables(sql));
        return rows;
    });
}

export async function scalar(sql: string, params?: QueryParams): Promise<any> {
    const rows = await query(sql, params);
    if (!rows.length) return null;

    const values = Object.values(rows[0] as RowDataPacket);
    return values.length ? values[0] : null;
}

export async function single(sql: string, params?: QueryParams): Promise<RowDataPacket | null> {
    const rows = await query(sql, params);
    return rows.length ? rows[0] : null;
}

export async function insert(sql: string, params?: QueryParams): Promise<number> {
    const resource = currentResource();

    return timed(sql, resource, async () => {
        const [result] = await getPool().query<ResultSetHeader>(sql, params as any);
        invalidateTables(extractTables(sql));
        return result.insertId;
    });
}

export async function update(sql: string, params?: QueryParams): Promise<number> {
    const resource = currentResource();

    return timed(sql, resource, async () => {
        const [result] = await getPool().query<ResultSetHeader>(sql, params as any);
        invalidateTables(extractTables(sql));
        return result.affectedRows;
    });
}

export async function prepare(sql: string, params?: QueryParams): Promise<RowDataPacket[]> {
    return query(sql, params);
}

export async function transaction(queries: TransactionQuery[]): Promise<boolean> {
    const connection = await getPool().getConnection();
    const touchedTables = new Set<string>();

    try {
        await connection.beginTransaction();

        for (const { query: sql, params } of queries) {
            await connection.query(sql, params as any);
            extractTables(sql).forEach((t) => touchedTables.add(t));
        }

        await connection.commit();
        invalidateTables([...touchedTables]);
        return true;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}
