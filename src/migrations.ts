import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getPool } from './pool';
import { logInfo, logError } from './logger';

const TRACKING_TABLE = 'nbmysql_migrations';

let running: Promise<void> | null = null;

function migrationsDir(): string {
    return join(GetResourcePath(GetCurrentResourceName()), 'migrations');
}

export function splitStatements(script: string): string[] {
    const source = script.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const statements: string[] = [];
    let delimiter = ';';
    let current = '';
    let i = 0;

    const push = () => {
        const text = current.trim();
        const meaningful = text.replace(/\/\*(?!!)[\s\S]*?\*\//g, '').replace(/(^|\n)\s*(--[ \t][^\n]*|--$|#[^\n]*)/g, '').trim();

        if (meaningful) statements.push(text);
        current = '';
    };

    while (i < source.length) {
        const atLineStart = i === 0 || source[i - 1] === '\n';

        if (atLineStart && !current.trim()) {
            const directive = /^[ \t]*delimiter[ \t]+(\S+)[ \t]*(?:\n|$)/i.exec(source.slice(i, i + 200));

            if (directive) {
                delimiter = directive[1];
                i += directive[0].length;
                continue;
            }
        }

        const char = source[i];
        const next = source[i + 1];

        if (char === "'" || char === '"' || char === '`') {
            let j = i + 1;

            while (j < source.length) {
                if (source[j] === '\\' && char !== '`') {
                    j += 2;
                    continue;
                }

                if (source[j] === char) {
                    if (source[j + 1] === char) {
                        j += 2;
                        continue;
                    }

                    break;
                }

                j++;
            }

            current += source.slice(i, j + 1);
            i = j + 1;
            continue;
        }

        if (char === '#' || (char === '-' && next === '-' && (source[i + 2] === ' ' || source[i + 2] === '\t' || source[i + 2] === '\n' || i + 2 >= source.length))) {
            const end = source.indexOf('\n', i);
            const stop = end === -1 ? source.length : end;

            current += source.slice(i, stop);
            i = stop;
            continue;
        }

        if (char === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            const stop = end === -1 ? source.length : end + 2;

            current += source.slice(i, stop);
            i = stop;
            continue;
        }

        if (source.startsWith(delimiter, i)) {
            push();
            i += delimiter.length;
            continue;
        }

        current += char;
        i++;
    }

    push();

    return statements;
}

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
    const [rows] = await getPool().query(`SELECT name FROM ${TRACKING_TABLE}`);
    return new Set((Array.isArray(rows) ? rows : []).map((row: any) => row.name));
}

async function applyAll(): Promise<void> {
    let files: string[];

    try {
        files = readdirSync(migrationsDir())
            .filter((f) => f.toLowerCase().endsWith('.sql'))
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
        const statements = splitStatements(readFileSync(join(migrationsDir(), file), 'utf8'));
        const connection = await getPool().getConnection();

        try {

            await connection.beginTransaction();

            for (const statement of statements) await connection.query(statement);

            await connection.query(`INSERT INTO ${TRACKING_TABLE} (name) VALUES (?)`, [file]);
            await connection.commit();
            connection.release();
            emit('nbmysql:migrationApplied', file);
        } catch (err) {
            try {
                await connection.rollback();
            } catch {

            }

            connection.release();

            const message = (err as Error).message;
            logError(`Migration failed (${file}): ${message}`);
            emit('nbmysql:migrationFailed', file, message);
            throw err;
        }
    }
}

export function runMigrations(): Promise<void> {
    if (running) return running;

    running = applyAll().finally(() => {
        running = null;
    });

    return running;
}
