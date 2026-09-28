import mysql, { Pool } from 'mysql2/promise';
import { logInfo, logError } from './logger';

let pool: Pool | null = null;

export function initPool(): Pool {
    const connectionString = GetConvar('mysql_connection_string', '');

    if (!connectionString) {
        logError('No connection string configured. Set `mysql_connection_string` in your server.cfg.');
        throw new Error('nbmysql: missing connection string');
    }

    const poolSize = parseInt(GetConvar('nbmysql_pool_size', '10'), 10) || 10;

    pool = mysql.createPool({
        uri: connectionString,
        connectionLimit: poolSize,
        namedPlaceholders: true,
        decimalNumbers: true,
        multipleStatements: false,
        dateStrings: true,
    });

    return pool;
}

export function getPool(): Pool {
    if (!pool) {
        return initPool();
    }

    return pool;
}

export async function testConnection(): Promise<void> {
    const connection = await getPool().getConnection();
    await connection.ping();
    connection.release();
    logInfo('Connection pool established.');
}
