// Usage: node createAdmin.js <username> <password>
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: node createAdmin.js <username> <password>');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
(async () => {
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [username, hash]
    );
    console.log(`Admin "${username}" is ready.`);
  } catch (err) {
    console.error('Failed:', err.message);
  } finally {
    await pool.end();
  }
})();