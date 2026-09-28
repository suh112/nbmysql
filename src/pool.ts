import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import { logInfo, logError } from './logger';

let pool: Pool | null = null;

function parseKeyValue(input: string): PoolOptions {
    const options: Record<string, any> = {};

    for (const part of input.split(';')) {
        const index = part.indexOf('=');
        if (index < 1) continue;

        const key = part.slice(0, index).trim().toLowerCase();
        const value = part.slice(index + 1).trim();

        switch (key) {
            case 'host':
            case 'server':
                options.host = value;
                break;
            case 'port':
                options.port = parseInt(value, 10) || 3306;
                break;
            case 'user':
            case 'userid':
            case 'uid':
            case 'username':
                options.user = value;
                break;
            case 'password':
            case 'pwd':
                options.password = value;
                break;
            case 'database':
            case 'db':
                options.database = value;
                break;
            case 'charset':
                options.charset = value;
                break;
            case 'socketpath':
                options.socketPath = value;
                break;
        }
    }

    if (!options.host && !options.socketPath) options.host = 'localhost';

    return options as PoolOptions;
}

function connectionOptions(connectionString: string): PoolOptions {
    const trimmed = connectionString.trim();

    if (/^(mysql|mariadb):\/\//i.test(trimmed)) {
        return { uri: trimmed.replace(/^mariadb:/i, 'mysql:') } as PoolOptions;
    }

    return parseKeyValue(trimmed);
}

export function initPool(): Pool {
    const connectionString = GetConvar('mysql_connection_string', '');

    if (!connectionString) {
        throw new Error('No connection string configured. Set `mysql_connection_string` in your server.cfg.');
    }

    const poolSize = parseInt(GetConvar('nbmysql_pool_size', '10'), 10) || 10;

    pool = mysql.createPool({
        ...connectionOptions(connectionString),
        connectionLimit: poolSize,
        waitForConnections: true,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        namedPlaceholders: true,
        decimalNumbers: true,
        multipleStatements: false,
        dateStrings: true,
    });

    return pool;
}

export function getPool(): Pool {
    return pool ?? initPool();
}

export async function closePool(): Promise<void> {
    const current = pool;
    pool = null;

    if (!current) return;

    try {
        await current.end();
    } catch (err) {
        logError(`Failed to close pool: ${(err as Error).message}`);
    }
}

export async function testConnection(): Promise<void> {
    const connection = await getPool().getConnection();

    try {
        await connection.ping();
    } finally {
        connection.release();
    }

    logInfo('Connection pool established.');
}
