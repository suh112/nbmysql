import { initPool, closePool, testConnection } from './pool';
import { query, cachedQuery, scalar, single, insert, update, prepare, transaction, currentResource } from './query';
import { runMigrations } from './migrations';
import { registerMigrateCommand } from './oxmigrate';
import { getStats } from './stats';
import { clearCache } from './cache';
import { logInfo, logError } from './logger';
import { startVersionChecker } from './version';

const RESOURCE = GetCurrentResourceName();
const CONNECT_RETRY_MS = 5000;
const CONNECT_ATTEMPTS = 12;

let ready = false;

try {
    initPool();
} catch (err) {
    logError((err as Error).message);
}

async function start(): Promise<void> {
    for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
        try {
            await testConnection();
            ready = true;
            emit('nbmysql:ready');
            break;
        } catch (err) {
            const message = (err as Error).message;
            logError(`Startup failed (attempt ${attempt}/${CONNECT_ATTEMPTS}): ${message}`);
            emit('nbmysql:connectionError', message);

            if (/No connection string/i.test(message) || attempt === CONNECT_ATTEMPTS) return;

            await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
        }
    }

    try {
        await runMigrations();
    } catch {

    }
}

start();

function safeCall(cb: (...args: any[]) => void, value: any): void {
    try {
        cb(value);
    } catch (err) {
        logError(`Callback error: ${(err as Error)?.message ?? err}`);
    }
}

function wrap(fn: (...args: any[]) => Promise<any>, fallback: any = null) {
    return (...args: any[]) => {
        const caller = currentResource();
        let cb: ((...a: any[]) => void) | null = null;

        for (let i = args.length - 1; i >= 0; i--) {
            if (typeof args[i] === 'function') {
                cb = args[i];
                args.splice(i, 1);
                break;
            }
        }


        while (args.length && (args[args.length - 1] === null || args[args.length - 1] === undefined)) args.pop();

        const result = fn(...args);

        if (!cb) return result;

        const callback = cb;

        result.then(
            (value) => safeCall(callback, value),
            (err: Error) => {
                logError(`${caller}: ${err?.message ?? err}`);
                safeCall(callback, fallback);
            },
        );
    };
}

exports('query', wrap(query));
exports('cachedQuery', wrap(cachedQuery));
exports('scalar', wrap(scalar));
exports('single', wrap(single));
exports('insert', wrap(insert));
exports('update', wrap(update));
exports('prepare', wrap(prepare));
exports('transaction', wrap(transaction, false));

exports('isReady', () => ready);
exports('stats', () => getStats());
exports('clearCache', () => clearCache());

RegisterCommand(
    'nbmysql:stats',
    () => {
        console.log(JSON.stringify(getStats(), null, 2));
    },
    true,
);

RegisterCommand(
    'nbmysql:migrate',
    () => {
        runMigrations().catch(() => undefined);
    },
    true,
);

registerMigrateCommand();

on('onResourceStop', (name: string) => {
    if (name === RESOURCE) {
        ready = false;
        closePool();
    }
});

logInfo(`v${GetResourceMetadata(RESOURCE, 'version', 0)} loaded.`);

startVersionChecker();
