import { createHash } from 'crypto';
import { QueryParams } from './types';

const WRITE_PATTERN = /^\s*(?:\/\*[\s\S]*?\*\/\s*|--[^\n]*\n\s*|#[^\n]*\n\s*)*(insert|update|delete|replace|truncate|alter|drop|create|rename|call|load|merge|optimize)\b/i;
const IDENT = '(?:`[^`]+`|\\w+)';
const TABLE_REF = new RegExp(`^\\s*(?:${IDENT}\\s*\\.\\s*)?(${IDENT})`);

export function hashQuery(sql: string, params?: QueryParams): string {
    const raw = `${sql}\u0000${JSON.stringify(params ?? [])}`;
    return createHash('sha1').update(raw).digest('hex');
}

export function isWriteQuery(sql: string): boolean {
    return WRITE_PATTERN.test(sql);
}

function clean(name: string): string {
    return name.replace(/`/g, '').toLowerCase();
}

export function extractTables(sql: string): string[] {
    const tables = new Set<string>();
    const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");

    const single = new RegExp(`\\b(?:join|into|update|table|truncate(?:\\s+table)?)\\s+(?:if\\s+(?:not\\s+)?exists\\s+)?(?:${IDENT}\\s*\\.\\s*)?(${IDENT})`, 'gi');
    let match: RegExpExecArray | null;

    while ((match = single.exec(stripped)) !== null) tables.add(clean(match[1]));

    const lists = /\b(?:from|update)\s+([^;]*?)(?=\b(?:where|group|order|limit|having|union|set|values|select|on|using|window|for|lock)\b|\bjoin\b|[;)]|$)/gi;

    while ((match = lists.exec(stripped)) !== null) {
        for (const piece of match[1].split(',')) {
            const ref = TABLE_REF.exec(piece);
            if (ref && !/^\(/.test(piece.trim())) tables.add(clean(ref[1]));
        }
    }

    tables.delete('select');
    tables.delete('set');
    tables.delete('dual');

    return [...tables];
}
