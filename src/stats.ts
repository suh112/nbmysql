import { ResourceStat } from './types';

const stats = new Map<string, ResourceStat>();

function getStat(resource: string): ResourceStat {
    let stat = stats.get(resource);

    if (!stat) {
        stat = { queries: 0, totalMs: 0, slowQueries: 0, errors: 0 };
        stats.set(resource, stat);
    }

    return stat;
}

export function recordQuery(resource: string, ms: number, slow: boolean): void {
    const stat = getStat(resource);
    stat.queries++;
    stat.totalMs += ms;
    if (slow) stat.slowQueries++;
}

export function recordError(resource: string): void {
    getStat(resource).errors++;
}

export function getStats(): Record<string, ResourceStat & { avgMs: number }> {
    const out: Record<string, ResourceStat & { avgMs: number }> = {};

    for (const [resource, stat] of stats) {
        out[resource] = {
            ...stat,
            avgMs: stat.queries ? Math.round((stat.totalMs / stat.queries) * 100) / 100 : 0,
        };
    }

    return out;
}
