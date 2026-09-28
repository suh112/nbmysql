import { initPool, testConnection } from './pool';
import { query, cachedQuery, scalar, single, insert, update, prepare, transaction } from './query';
import { runMigrations } from './migrations';
import { registerMigrateCommand } from './oxmigrate';
import { getStats } from './stats';
import { clearCache } from './cache';
import { logInfo, logError } from './logger';
import { startVersionChecker } from './version';

initPool();

let ready = false;

(async () => {
    try {
        await testConnection();
        ready = true;
        emit('nbmysql:ready');
        await runMigrations();
    } catch (err) {
        const message = (err as Error).message;
        logError(`Startup failed: ${message}`);
        emit('nbmysql:connectionError', message);
    }
})();

function wrap(fn: (...args: any[]) => Promise<any>) {
    return (...args: any[]) => {
        const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
        const result = fn(...args);

        if (cb) {
            result.then(cb).catch((err: Error) => {
                logError(err.message);
                cb(null);
            });
            return;
        }

        return result;
    };
}

exports('query', wrap(query));
exports('cachedQuery', wrap(cachedQuery));
exports('scalar', wrap(scalar));
exports('single', wrap(single));
exports('insert', wrap(insert));
exports('update', wrap(update));
exports('prepare', wrap(prepare));
exports('transaction', wrap(transaction));

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
        runMigrations().catch((err: Error) => logError(err.message));
    },
    true,
);

registerMigrateCommand();

logInfo('nbmysql loaded.');

startVersionChecker();
