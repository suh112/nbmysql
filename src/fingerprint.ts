import { createHash } from 'crypto';
import { QueryParams } from './types';

export function hashQuery(sql: string, params?: QueryParams): string {
    const raw = sql + JSON.stringify(params ?? []);
    return createHash('sha1').update(raw).digest('hex');
}

export function extractTables(sql: string): string[] {
    const tables = new Set<string>();
    const patterns = [/\bfrom\s+`?(\w+)`?/gi, /\bjoin\s+`?(\w+)`?/gi, /\binto\s+`?(\w+)`?/gi, /\bupdate\s+`?(\w+)`?/gi];

    for (const pattern of patterns) {
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(sql)) !== null) {
            tables.add(match[1].toLowerCase());
        }
    }

    return [...tables];
}
