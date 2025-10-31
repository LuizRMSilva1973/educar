import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const DATA_DIR = path.resolve('data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
}

function initDb() {
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Garantir coluna 'name' (migracao leve)
  const cols = db.prepare("PRAGMA table_info(users)").all();
  const hasName = cols.some(c => c.name === 'name');
  if (!hasName) {
    db.exec("ALTER TABLE users ADD COLUMN name TEXT");
  }

  const adminEmail = 'mantovani36@gmail.com';
  const adminPassword = 'senha123';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const { salt, hash } = hashPassword(adminPassword);
    db.prepare('INSERT INTO users (email, password_hash, password_salt, role, name) VALUES (?, ?, ?, ?, ?)')
      .run(adminEmail, hash, salt, 'admin', 'Admin');
    console.log(`Admin criado: ${adminEmail}`);
  } else {
    console.log('Admin já existe, nenhuma ação necessária.');
  }

  return db;
}

const app = express();

// CORS básico
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

const db = initDb();

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email e password são obrigatórios' });
  const row = db.prepare('SELECT id, email, password_hash, password_salt, role, name FROM users WHERE email = ?').get(email);
  if (!row) return res.status(401).json({ error: 'credenciais inválidas' });
  const ok = verifyPassword(password, row.password_salt, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'credenciais inválidas' });
  // Token simples (não-JWT) com HMAC para demo
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({ sub: row.id, email: row.email, role: row.role, name: row.name || null, iat: issuedAt })).toString('base64url');
  const secret = process.env.AUTH_SECRET || 'dev-secret-change-me';
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const token = `${payload}.${sig}`;
  res.json({ token, user: { id: row.id, email: row.email, role: row.role, name: row.name || null } });
});

app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email e password são obrigatórios' });
  try {
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) return res.status(409).json({ error: 'email já cadastrado' });
    const { salt, hash } = hashPassword(password);
    const info = db.prepare('INSERT INTO users (name, email, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?)')
      .run(name, email, hash, salt, 'student');
    res.status(201).json({ id: info.lastInsertRowid, name, email, role: 'student' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'erro ao cadastrar' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
