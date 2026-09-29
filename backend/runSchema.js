require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
});

(async () => {
  try {
    const sql = fs.readFileSync('./schema.sql', 'utf8');
    await pool.query(sql);
    console.log('Tables created successfully.');
  } catch (err) {
    console.error('Failed:', err.message);
  } finally {
    await pool.end();
  }
})();