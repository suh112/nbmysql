const RESOURCE = GetCurrentResourceName();
const MAX_SQL_LOG = 500;

function trim(sql: string): string {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    return text.length > MAX_SQL_LOG ? `${text.slice(0, MAX_SQL_LOG)}...` : text;
}

export function isDebug(): boolean {
    return GetConvar('nbmysql_debug', 'false') === 'true';
}

export function logInfo(message: string): void {
    console.log(`^5[${RESOURCE}]^7 ${message}`);
}

export function logError(message: string): void {
    console.log(`^1[${RESOURCE}] ERROR:^7 ${message}`);
}

export function logDebug(message: string): void {
    if (isDebug()) console.log(`^6[${RESOURCE}] DEBUG:^7 ${message}`);
}

export function logSlowQuery(query: string, ms: number, resource?: string): void {
    const from = resource && resource !== 'unknown' ? ` from ${resource}` : '';
    console.log(`^3[${RESOURCE}] SLOW QUERY (${ms}ms)${from}:^7 ${trim(query)}`);
}
