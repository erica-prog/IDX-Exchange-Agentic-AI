import "../env.js";

import mysql, { type Pool } from "mysql2/promise";

let pool: Pool | null = null;

export function getPool(): Pool {
  pool ??= mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = null;
}
