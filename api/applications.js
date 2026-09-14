// Vercel serverless function: /api/applications
// GET  -> list applications (public submit status check uses ?ref=)
// POST -> create an application (public)
// PATCH-> update status (requires x-admin-token)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-admin-token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // ---------- LIST / LOOKUP ----------
    if (req.method === 'GET') {
      const { ref, status, grade, q } = req.query;
      let query = supabase
        .from('applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (ref) query = query.eq('ref', ref);
      if (status) query = query.eq('status', status);
      if (grade) query = query.eq('learner->>grade', grade);
      if (q) query = query.or(
        `ref.ilike.%${q}%,learner->>firstName.ilike.%${q}%,learner->>lastName.ilike.%${q}%,guardian->>name.ilike.%${q}%,guardian->>phone.ilike.%${q}%`
      );

      const { data, error } = await query.limit(500);
      if (error) throw error;
      return res.status(200).json({ applications: data || [] });
    }

    // ---------- CREATE (public) ----------
    if (req.method === 'POST') {
      const d = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const errors = validate(d);
      if (errors.length) return res.status(400).json({ ok: false, errors });

      const { count } = await supabase
        .from('applications')
        .select('*', { count: 'exact', head: true });
      const ref = refCode(count || 0);

      const record = {
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
      };
      const { error } = await supabase.from('applications').insert(record);
      if (error) throw error;
      return res.status(201).json({ ok: true, ref });
    }

    // ---------- UPDATE STATUS (admin token required) ----------
    if (req.method === 'PATCH') {
      if (!process.env.ADMIN_TOKEN || req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      const d = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!d.ref || !STATUSES.includes(d.status)) {
        return res.status(400).json({ ok: false, error: 'ref and valid status required' });
      }
      const { error } = await supabase
        .from('applications')
        .update({ status: d.status, updated_at: new Date().toISOString() })
        .eq('ref', d.ref);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    // ---------- DELETE (admin token required) ----------
    if (req.method === 'DELETE') {
      if (!process.env.ADMIN_TOKEN || req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      const ref = (req.query.ref || '').trim();
      if (!ref) return res.status(400).json({ ok: false, error: 'ref query param required' });
      const { error } = await supabase.from('applications').delete().eq('ref', ref);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('applications API error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
