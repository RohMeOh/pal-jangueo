require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Load Supabase SSL certificate
const certificate = fs.readFileSync(
  path.join(__dirname, 'certs', 'supabase-ca.crt'),
  'utf8'
);

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    ca: certificate,
    rejectUnauthorized: true
  },
  max: 5,
  connectionTimeoutMillis: 10000
});

module.exports = pool;
