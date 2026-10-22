require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Use Render's certificate or the local development certificate
const certificatePath =
  process.env.SUPABASE_CA_PATH ||
  path.join(__dirname, 'certs', 'supabase-ca.crt');

const certificate = fs.readFileSync(
  certificatePath,
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
