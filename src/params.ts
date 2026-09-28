import { QueryParams } from './types';

export interface Prepared {
    sql: string;
    params: any[] | Record<string, any>;
}

function clean(value: any): any {
    return value === undefined ? null : value;
}

function isNumericKeyed(obj: Record<string, any>): boolean {
    const keys = Object.keys(obj);
    return keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
}

export function prepareQuery(sql: unknown, params?: QueryParams | null): Prepared {
    if (typeof sql !== 'string' || !sql.trim()) {
        throw new Error(`query must be a non-empty string (got ${sql === null ? 'nil' : typeof sql})`);
    }

    if (params === null || params === undefined) return { sql, params: [] };

    if (Array.isArray(params)) return { sql, params: params.map(clean) };

    if (typeof params !== 'object') return { sql, params: [clean(params)] };

    if (isNumericKeyed(params)) {
        const keys = Object.keys(params).map(Number);
        const max = Math.max(...keys);
        const list: any[] = new Array(max).fill(null);

        for (const key of keys) list[key - 1] = clean(params[key]);

        return { sql, params: list };
    }

    const named: Record<string, any> = {};
    let text = sql;

    for (const [rawKey, value] of Object.entries(params)) {
        const key = rawKey.replace(/^[@:]/, '');
        if (!key) continue;

        named[key] = clean(value);

        if (rawKey.startsWith('@')) {
            const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            text = text.replace(new RegExp(`(?<![@\\w])@${escaped}(?!\\w)`, 'g'), `:${key}`);
        }
    }

    if (!Object.keys(named).length) return { sql, params: [] };

    return { sql: text, params: named };
}

export function plainRows<T>(rows: T): T {
    if (!Array.isArray(rows)) return rows;

    return rows.map((row) => (row && typeof row === 'object' && !Array.isArray(row) ? { ...row } : row)) as unknown as T;
}
