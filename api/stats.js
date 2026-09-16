// Vercel serverless function: /api/stats
// Public per-grade fill counts + overall summary for the dashboard.
import { getDb, isConfigured, COLLECTION } from './_db.js';

const GRADES = [
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
const STATUSES = ['pending', 'review', 'accepted', 'waitlist', 'declined'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!isConfigured()) {
    return res.status(503).json({ ok: false, error: 'Database not configured (MONGODB_URI missing)' });
  }

  try {
    const col = (await getDb()).collection(COLLECTION);

    // One aggregation: counts per (status, grade)
    const rows = await col.aggregate([
      { $group: { _id: { status: '$status', grade: '$learner.grade' }, n: { $sum: 1 } } },
    ]).toArray();

    const count = (status, grade) =>
      rows.find(r => r._id.status === status && r._id.grade === grade)?.n || 0;

    const gradeStats = GRADES.map(g => {
      const mine = rows.filter(r => r._id.grade === g.id);
      const total = mine.reduce((s, r) => s + r.n, 0);
      const declined = count('declined', g.id);
      const taken = total - declined;
      const pending = count('pending', g.id) + count('review', g.id);
      return { ...g, taken, pending, remaining: Math.max(g.places - taken, 0) };
    });

    const byStatus = {};
    STATUSES.forEach(s => {
      byStatus[s] = rows.filter(r => r._id.status === s).reduce((sum, r) => sum + r.n, 0);
    });

    return res.status(200).json({ gradeStats, summary: { total: byStatus && Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus } });
  } catch (err) {
    console.error('stats API error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
