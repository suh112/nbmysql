export type QueryParams = any[] | Record<string, any>;

export interface TransactionQuery {
    query: string;
    params?: QueryParams;
}

export interface ResourceStat {
    queries: number;
    totalMs: number;
    slowQueries: number;
    errors: number;
}
