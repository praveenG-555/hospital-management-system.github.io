-- SQLite schema for Hospital Management System

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    condition TEXT,
    status TEXT NOT NULL, -- 'admitted', 'outpatient', 'discharged'
    blood TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doctors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    dept TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    status TEXT NOT NULL, -- 'available', 'on-leave', 'in-surgery'
    patients INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    doctor_id TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    date TEXT NOT NULL, -- ISO date 'YYYY-MM-DD'
    time TEXT NOT NULL, -- 'HH:MM'
    reason TEXT NOT NULL,
    status TEXT NOT NULL, -- 'upcoming', 'completed', 'cancelled'
    contact_email TEXT,
    contact_phone TEXT,
    notified INTEGER DEFAULT 0, -- 0 = false, 1 = true
    FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY(doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS billing (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    items TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL, -- 'paid', 'unpaid'
    date TEXT NOT NULL,
    FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pharmacy (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER NOT NULL,
    reorder INTEGER NOT NULL,
    price REAL NOT NULL,
    expiry TEXT NOT NULL -- ISO date 'YYYY-MM-DD'
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    at INTEGER NOT NULL, -- Unix timestamp in ms
    channel TEXT NOT NULL, -- 'email', 'sms'
    patient_name TEXT NOT NULL,
    target TEXT NOT NULL,
    message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
