const { Pool } = require('pg');
const { dbQueryDurationSeconds, dbErrorsTotal } = require('../metrics');

const poolConfig = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
} : {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

const pool = new Pool({
  ...poolConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error', err);
});

function inferOperation(queryConfig) {
  const text = typeof queryConfig === 'string' ? queryConfig : queryConfig?.text;
  const match = typeof text === 'string' && text.trim().match(/^(\w+)/);
  return match ? match[1].toUpperCase() : 'unknown';
}

const rawQuery = pool.query.bind(pool);

pool.query = (...args) => {
  const operation = inferOperation(args[0]);
  const endTimer = dbQueryDurationSeconds.startTimer({ operation });
  const result = rawQuery(...args);

  if (result && typeof result.then === 'function') {
    return result.then(
      (res) => {
        endTimer();
        return res;
      },
      (err) => {
        endTimer();
        dbErrorsTotal.inc({ type: err.code || err.name || 'unknown' });
        throw err;
      }
    );
  }

  endTimer();
  return result;
};

module.exports = pool;
