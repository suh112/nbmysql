const RESOURCE = GetCurrentResourceName();

export function logInfo(message: string): void {
    console.log(`^5[${RESOURCE}]^7 ${message}`);
}

export function logError(message: string): void {
    console.log(`^1[${RESOURCE}] ERROR:^7 ${message}`);
}

export function logSlowQuery(query: string, ms: number): void {
    console.log(`^3[${RESOURCE}] SLOW QUERY (${ms}ms):^7 ${query}`);
}
