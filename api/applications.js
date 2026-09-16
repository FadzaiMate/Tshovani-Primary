// Vercel serverless function: /api/applications
// GET    -> list / lookup (?ref= public status check, ?status= ?grade= ?q= admin filters)
// POST   -> create an application (public)
// PATCH  -> update status (requires x-admin-token)
// DELETE -> remove (requires x-admin-token)
import { getDb, isConfigured, COLLECTION } from './_db.js';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-admin-token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!isConfigured()) {
    return res.status(503).json({ ok: false, error: 'Database not configured (MONGODB_URI missing)' });
  }

  try {
    const col = (await getDb()).collection(COLLECTION);

    // ---------- LIST / LOOKUP ----------
    if (req.method === 'GET') {
      const { ref, status, grade, q } = req.query;
      const filter = {};
      if (ref) filter.ref = String(ref).trim();
      if (status) filter.status = String(status);
      if (grade) filter['learner.grade'] = String(grade);
      if (q) {
        const rx = { $regex: String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        filter.$or = [
          { ref: rx },
          { 'learner.firstName': rx },
          { 'learner.lastName': rx },
          { 'guardian.name': rx },
          { 'guardian.phone': rx },
        ];
      }
      const apps = await col.find(filter).sort({ createdAt: -1 }).limit(500).toArray();
      return res.status(200).json({ applications: apps });
    }

    // ---------- CREATE (public) ----------
    if (req.method === 'POST') {
      const d = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const errors = validate(d);
      if (errors.length) return res.status(400).json({ ok: false, errors });

      const count = await col.countDocuments();
      const ref = refCode(count);

      const doc = {
        ref,
        status: 'pending',
        learner: {
          firstName: String(d.firstName).trim(),
          lastName: String(d.lastName).trim(),
          dob: d.dob,
          gender: d.gender,
          grade: d.grade,
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
      return res.status(201).json({ ok: true, ref });
    }

    // ---------- UPDATE STATUS (admin) ----------
    if (req.method === 'PATCH') {
      if (!checkAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const d = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!d.ref || !STATUSES.includes(d.status)) {
        return res.status(400).json({ ok: false, error: 'ref and valid status required' });
      }
      const r = await col.updateOne(
        { ref: String(d.ref) },
        { $set: { status: d.status, updatedAt: new Date().toISOString() } }
      );
      if (r.matchedCount === 0) return res.status(404).json({ ok: false, error: 'Application not found' });
      return res.status(200).json({ ok: true });
    }

    // ---------- DELETE (admin) ----------
    if (req.method === 'DELETE') {
      if (!checkAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const ref = (req.query.ref || '').trim();
      if (!ref) return res.status(400).json({ ok: false, error: 'ref query param required' });
      const r = await col.deleteOne({ ref });
      if (r.deletedCount === 0) return res.status(404).json({ ok: false, error: 'Application not found' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('applications API error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
