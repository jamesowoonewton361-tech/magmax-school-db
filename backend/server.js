require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const JWT_SECRET = process.env.JWT_SECRET;
if (!process.env.DATABASE_URL || !JWT_SECRET) {
  console.error('DATABASE_URL and JWT_SECRET must be set in .env');
  process.exit(1);
}

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
});

app.use(cors());
app.use(express.json());

// Column list: database names -> the names your frontend uses
const STUDENT_COLS = `
  id,
  adm_no AS "admNo",
  first_name AS "firstName",
  surname,
  to_char(dob, 'YYYY-MM-DD') AS dob,
  gender,
  class_name AS "className",
  father_name AS "fatherName",
  father_phone AS "fatherPhone",
  mother_name AS "motherName",
  mother_phone AS "motherPhone",
  guardian_name AS "guardianName",
  guardian_phone AS "guardianPhone",
  address
`;

// Turn empty strings into null so optional fields store cleanly
const clean = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

function studentValues(b) {
  return [
    clean(b.admNo), clean(b.firstName), clean(b.surname), clean(b.dob),
    clean(b.gender), clean(b.className),
    clean(b.fatherName), clean(b.fatherPhone),
    clean(b.motherName), clean(b.motherPhone),
    clean(b.guardianName), clean(b.guardianPhone),
    clean(b.address)
  ];
}

function missingRequired(b) {
  const required = ['admNo', 'firstName', 'surname', 'gender', 'className'];
  return required.filter((f) => !clean(b[f]));
}

// Checks the login token on protected routes
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Not logged in.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }
}

function handleError(res, err) {
  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'That admission number already exists.' });
  }
  console.error(err);
  res.status(500).json({ success: false, message: 'Server error.' });
}

// ---------- Routes ----------

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/login', async (req, res) => {
  try {
    const username = clean(req.body.username);
    const password = req.body.password || '';
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Enter username and password.' });
    }
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ success: true, token });
  } catch (err) {
    handleError(res, err);
  }
});

app.get('/api/students', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT ${STUDENT_COLS} FROM students ORDER BY id`);
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/students', auth, async (req, res) => {
  const missing = missingRequired(req.body);
  if (missing.length) {
    return res.status(400).json({ success: false, message: 'Missing: ' + missing.join(', ') });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO students
        (adm_no, first_name, surname, dob, gender, class_name,
         father_name, father_phone, mother_name, mother_phone,
         guardian_name, guardian_phone, address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING ${STUDENT_COLS}`,
      studentValues(req.body)
    );
    res.status(201).json({ success: true, student: rows[0] });
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/students/:id', auth, async (req, res) => {
  const missing = missingRequired(req.body);
  if (missing.length) {
    return res.status(400).json({ success: false, message: 'Missing: ' + missing.join(', ') });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE students SET
        adm_no=$1, first_name=$2, surname=$3, dob=$4, gender=$5, class_name=$6,
        father_name=$7, father_phone=$8, mother_name=$9, mother_phone=$10,
        guardian_name=$11, guardian_phone=$12, address=$13
       WHERE id=$14
       RETURNING ${STUDENT_COLS}`,
      [...studentValues(req.body), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Student not found.' });
    res.json({ success: true, student: rows[0] });
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/students/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM students WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Student not found.' });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));