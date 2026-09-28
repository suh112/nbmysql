import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getPool } from './pool';
import { logInfo, logError } from './logger';

const MIGRATIONS_DIR = join(GetResourcePath(GetCurrentResourceName()), 'migrations');
const TRACKING_TABLE = 'nbmysql_migrations';

async function ensureTrackingTable(): Promise<void> {
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
    const [rows] = await getPool().query<any[]>(`SELECT name FROM ${TRACKING_TABLE}`);
    return new Set(rows.map((row) => row.name));
}

export async function runMigrations(): Promise<void> {
    let files: string[];

    try {
        files = readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.sql'))
            .sort();
    } catch {
        return;
    }

    if (!files.length) return;

    await ensureTrackingTable();
    const applied = await getAppliedMigrations();
    const pending = files.filter((f) => !applied.has(f));

    if (!pending.length) {
        logInfo('No pending migrations.');
        return;
    }

    for (const file of pending) {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
        const connection = await getPool().getConnection();

        try {
            await connection.beginTransaction();
            const statements = sql
                .split(';')
                .map((s) => s.trim())
                .filter(Boolean);

            for (const statement of statements) {
                await connection.query(statement);
            }

            await connection.query(`INSERT INTO ${TRACKING_TABLE} (name) VALUES (?)`, [file]);
            await connection.commit();
            emit('nbmysql:migrationApplied', file);
        } catch (err) {
            await connection.rollback();
            connection.release();
            const message = (err as Error).message;
            logError(`Migration failed (${file}): ${message}`);
            emit('nbmysql:migrationFailed', file, message);
            throw err;
        }

        connection.release();
    }
}
