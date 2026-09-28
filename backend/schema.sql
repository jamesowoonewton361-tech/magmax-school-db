CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  adm_no VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  surname VARCHAR(100) NOT NULL,
  dob DATE,
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('Male', 'Female')),
  class_name VARCHAR(50) NOT NULL,
  father_name VARCHAR(150),
  father_phone VARCHAR(20),
  mother_name VARCHAR(150),
  mother_phone VARCHAR(20),
  guardian_name VARCHAR(150),
  guardian_phone VARCHAR(20),
  address TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);