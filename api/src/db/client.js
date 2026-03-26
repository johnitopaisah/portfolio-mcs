const { Pool } = require('pg');

const poolConfig = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
} : {
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'portfolio',
  user: process.env.DB_USER || 'portfolio_user',
  password: process.env.DB_PASSWORD || 'changeme',
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

module.exports = pool;
