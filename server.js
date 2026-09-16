// Tiny static file server + local API for the Tshovani Primary School site.
// Run: node server.js  (defaults to port 8000; override: node server.js 8080)
// The API routes mirror the Vercel serverless functions in api/ and use the
// same MONGODB_URI and ADMIN_TOKEN environment variables. Without MONGODB_URI
// the API answers 503 and the site falls back to localStorage demo mode.
// Bind is dual-stack (IPv4 + IPv6) so 'localhost' always resolves.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, isConfigured, COLLECTION } from './api/_db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8000;
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const GRADES = ['ecd-a', 'ecd-b', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'];
const STATUSES = ['pending', 'review', 'accepted', 'waitlist', 'declined'];

function validate(d) {
  const errors = [];
  const req = (v, msg) => { if (!v || !String(v).trim()) errors.push(msg); };
  req(d.firstName, 'Learner first name is required.');
  req(d.lastName, 'Learner surname is required.');
  req(d.dob, 'Date of birth is required.');
  if (d.dob) {
    const dob = new Date(d.dob);
    if (isNaN(dob)) errors.push('Date of birth is not a valid date.');
    else {
      const age = (Date.now() - dob.getTime()) / 3.15576e10;
      if (age < 2.5 || age > 16) errors.push('Age must be between 3 and 15 years.');
    }
  }
  if (!GRADES.includes(d.grade)) errors.push('Please choose a grade.');
  if (!['female', 'male'].includes(d.gender)) errors.push('Please choose a gender.');
  req(d.guardianName, 'Parent/Guardian name is required.');
  req(d.phone, 'Contact phone is required.');
  if (d.phone && !/^[+0-9()\s-]{7,20}$/.test(String(d.phone).trim())) errors.push('Phone number looks invalid.');
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.email).trim())) errors.push('Email address looks invalid.');
  if (!['parent', 'guardian', 'other'].includes(d.relation)) errors.push('Please say how you are related to the learner.');
  return errors;
}

function refCode(count) {
  const n = String(count + 1).padStart(4, '0');
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TSP-${new Date().getFullYear()}-${n}${r}`;
}

function checkAdmin(req) {
  return Boolean(process.env.ADMIN_TOKEN) && req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, x-admin-token',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

async function handleApi(req, res, pathname, query) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }
  if (!isConfigured()) { json(res, 503, { ok: false, error: 'Database not configured (MONGODB_URI missing)' }); return true; }

  const col = (await getDb()).collection(COLLECTION);

  if (pathname === '/api/stats' && req.method === 'GET') {
    const rows = await col.aggregate([
      { $group: { _id: { status: '$status', grade: '$learner.grade' }, n: { $sum: 1 } } },
    ]).toArray();
    const count = (status, grade) => rows.find(r => r._id.status === status && r._id.grade === grade)?.n || 0;
    const GRADES_META = [
      { id: 'ecd-a', name: 'ECD A', ages: '3–4 yrs', fee: 20, places: 25 },
      { id: 'ecd-b', name: 'ECD B', ages: '4–5 yrs', fee: 20, places: 25 },
      { id: 'g1', name: 'Grade 1', ages: '6 yrs', fee: 30, places: 30 },
      { id: 'g2', name: 'Grade 2', ages: '7 yrs', fee: 30, places: 30 },
      { id: 'g3', name: 'Grade 3', ages: '8 yrs', fee: 30, places: 30 },
      { id: 'g4', name: 'Grade 4', ages: '9 yrs', fee: 40, places: 32 },
      { id: 'g5', name: 'Grade 5', ages: '10 yrs', fee: 40, places: 32 },
      { id: 'g6', name: 'Grade 6', ages: '11 yrs', fee: 40, places: 32 },
      { id: 'g7', name: 'Grade 7', ages: '12 yrs', fee: 50, places: 32 },
    ];
    const gradeStats = GRADES_META.map(g => {
      const mine = rows.filter(r => r._id.grade === g.id);
      const total = mine.reduce((s, r) => s + r.n, 0);
      const taken = total - count('declined', g.id);
      const pending = count('pending', g.id) + count('review', g.id);
      return { ...g, taken, pending, remaining: Math.max(g.places - taken, 0) };
    });
    const byStatus = {};
    STATUSES.forEach(s => { byStatus[s] = rows.filter(r => r._id.status === s).reduce((sum, r) => sum + r.n, 0); });
    json(res, 200, { gradeStats, summary: { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus } });
    return true;
  }

  if (pathname === '/api/applications') {
    if (req.method === 'GET') {
      const filter = {};
      if (query.get('ref')) filter.ref = query.get('ref').trim();
      if (query.get('status')) filter.status = query.get('status');
      if (query.get('grade')) filter['learner.grade'] = query.get('grade');
      if (query.get('q')) {
        const q = query.get('q');
        const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        filter.$or = [{ ref: rx }, { 'learner.firstName': rx }, { 'learner.lastName': rx }, { 'guardian.name': rx }, { 'guardian.phone': rx }];
      }
      const apps = await col.find(filter).sort({ createdAt: -1 }).limit(500).toArray();
      json(res, 200, { applications: apps });
      return true;
    }
    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const d = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const errors = validate(d);
      if (errors.length) { json(res, 400, { ok: false, errors }); return true; }
      const count = await col.countDocuments();
      const doc = {
        ref: refCode(count),
        status: 'pending',
        learner: {
          firstName: String(d.firstName).trim(),
          lastName: String(d.lastName).trim(),
          dob: d.dob, gender: d.gender, grade: d.grade,
          notes: String(d.notes || '').trim().slice(0, 1000),
        },
        guardian: {
          name: String(d.guardianName).trim(),
          phone: String(d.phone).trim(),
          email: String(d.email || '').trim(),
          relation: d.relation,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await col.insertOne(doc);
      json(res, 201, { ok: true, ref: doc.ref });
      return true;
    }
    if (req.method === 'PATCH') {
      if (!checkAdmin(req)) { json(res, 401, { ok: false, error: 'Unauthorized' }); return true; }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const d = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (!d.ref || !STATUSES.includes(d.status)) { json(res, 400, { ok: false, error: 'ref and valid status required' }); return true; }
      const r = await col.updateOne({ ref: String(d.ref) }, { $set: { status: d.status, updatedAt: new Date().toISOString() } });
      if (r.matchedCount === 0) { json(res, 404, { ok: false, error: 'Application not found' }); return true; }
      json(res, 200, { ok: true });
      return true;
    }
    if (req.method === 'DELETE') {
      if (!checkAdmin(req)) { json(res, 401, { ok: false, error: 'Unauthorized' }); return true; }
      const ref = (query.get('ref') || '').trim();
      if (!ref) { json(res, 400, { ok: false, error: 'ref query param required' }); return true; }
      const r = await col.deleteOne({ ref });
      if (r.deletedCount === 0) { json(res, 404, { ok: false, error: 'Application not found' }); return true; }
      json(res, 200, { ok: true });
      return true;
    }
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    // ---- API routes (same contract as the Vercel functions) ----
    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname, url.searchParams);
      if (handled) return;
      json(res, 404, { ok: false, error: 'Unknown API route' });
      return;
    }

    // ---- Static files ----
    let rel = pathname.replace(/^\/+/, '');
    if (rel === '' || rel === '/') rel = 'index.html';
    let full = path.normalize(path.join(ROOT, rel));
    if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let stat = fs.existsSync(full) ? fs.statSync(full) : null;
    if (stat && stat.isDirectory()) {
      full = path.join(full, 'index.html');
      stat = fs.existsSync(full) ? fs.statSync(full) : null;
    }
    if (!stat) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        .end('<h1>404 Not Found</h1><p><a href="/">Back to the Tshovani home page</a></p>');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Length': stat.size,
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(full).pipe(res);
  } catch (err) {
    console.error('server error:', err);
    if (!res.headersSent) res.writeHead(500).end('Server error');
  }
});

// No host argument = dual-stack (IPv4 + IPv6), so 'localhost' always works
// even when Windows resolves it to ::1 first.
server.listen(PORT, () => {
  console.log(`Tshovani Primary School site: http://localhost:${PORT}/index.html`);
  console.log(`Database: ${isConfigured() ? 'MongoDB connected path active' : 'NOT configured - API returns 503, site uses localStorage demo mode'}`);
});
