import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import Stripe from 'stripe';

// Minimal .env loader (avoids extra deps in sandbox)
function loadEnvLocal() {
  try {
    const envPath = path.resolve('.env.local');
    if (!fs.existsSync(envPath)) return;
    const txt = fs.readFileSync(envPath, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (e) {
    console.warn('Could not load .env.local:', e);
  }
}
loadEnvLocal();

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
      credits INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Garantir coluna 'name' (migracao leve)
  const cols = db.prepare("PRAGMA table_info(users)").all();
  const hasName = cols.some(c => c.name === 'name');
  if (!hasName) {
    db.exec("ALTER TABLE users ADD COLUMN name TEXT");
  }
  const hasCredits = cols.some(c => c.name === 'credits');
  if (!hasCredits) {
    db.exec("ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0");
  }

  const adminEmail = 'mantovani36@gmail.com';
  const adminPassword = 'senha123';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const { salt, hash } = hashPassword(adminPassword);
    db.prepare('INSERT INTO users (email, password_hash, password_salt, role, name, credits) VALUES (?, ?, ?, ?, ?, ?)')
      .run(adminEmail, hash, salt, 'admin', 'Admin', 0);
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

// Stripe webhook must be able to read the raw body, so define it BEFORE json parser
const rawParser = express.raw({ type: 'application/json' });
app.post('/api/payments/webhook', rawParser, (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta = session.metadata || {};
      const userId = Number(meta.userId);
      const pack = String(meta.pack || '0');
      const creditsMap = { '200': 200, '550': 550, '1200': 1200 };
      const creditsToAdd = creditsMap[pack] || 0;
      if (userId && creditsToAdd > 0) {
        db.prepare('UPDATE users SET credits = COALESCE(credits,0) + ? WHERE id = ?').run(creditsToAdd, userId);
      }
    }

    res.status(200).send('ok');
  } catch (err) {
    console.error('webhook error', err);
    res.status(500).send('internal error');
  }
});

// After webhook is registered, enable regular JSON parsing
app.use(express.json());

const db = initDb();

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email e password são obrigatórios' });
  const row = db.prepare('SELECT id, email, password_hash, password_salt, role, name, credits FROM users WHERE email = ?').get(email);
  if (!row) return res.status(401).json({ error: 'credenciais inválidas' });
  const ok = verifyPassword(password, row.password_salt, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'credenciais inválidas' });
  // Token simples (não-JWT) com HMAC para demo
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({ sub: row.id, email: row.email, role: row.role, name: row.name || null, iat: issuedAt })).toString('base64url');
  const secret = process.env.AUTH_SECRET || 'dev-secret-change-me';
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const token = `${payload}.${sig}`;
  res.json({ token, user: { id: row.id, email: row.email, role: row.role, name: row.name || null, credits: row.credits || 0 } });
});

app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email e password são obrigatórios' });
  try {
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) return res.status(409).json({ error: 'email já cadastrado' });
    const { salt, hash } = hashPassword(password);
    const startCredits = Number(process.env.NEW_USER_STARTING_CREDITS || 20) || 0;
    const info = db.prepare('INSERT INTO users (name, email, password_hash, password_salt, role, credits) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, email, hash, salt, 'student', startCredits);
    res.status(201).json({ id: info.lastInsertRowid, name, email, role: 'student', credits: startCredits });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'erro ao cadastrar' });
  }
});

// ---- Users API (simple fetch by id for refreshing credits) ----
app.get('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  const row = db.prepare('SELECT id, email, role, name, credits FROM users WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'não encontrado' });
  res.json(row);
});

// ---- Stripe: create checkout session ----
app.post('/api/payments/create-checkout', async (req, res) => {
  try {
    const { pack, userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const allowed = new Set(['200', '550', '1200']);
    const chosen = allowed.has(String(pack)) ? String(pack) : '200';

    const priceByPack = {
      '200': process.env.PRICE_ID_200,
      '550': process.env.PRICE_ID_550,
      '1200': process.env.PRICE_ID_1200,
    };
    const price = priceByPack[chosen];
    if (!price) return res.status(500).json({ error: 'Preço não configurado' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
    const successUrl = process.env.STRIPE_SUCCESS_URL || 'http://localhost:3001/?checkout=success';
    const cancelUrl = process.env.STRIPE_CANCEL_URL || 'http://localhost:3001/?checkout=cancel';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: { userId: String(userId), pack: chosen },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error', err);
    return res.status(500).json({ error: 'erro ao criar checkout' });
  }
});

// (webhook handler is defined above)

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
