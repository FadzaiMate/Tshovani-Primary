// Tshovani Primary School — shared data layer (no dependencies).
// Uses localStorage so the whole system works offline with no backend.
// Swap LS_KEY later for a real API — every page only calls these functions.

const TSHOVANI = (() => {
  const LS_KEY = 'tshovani.applications.v1';
  const SESSIONS_KEY = 'tshovani.enrollsessions.v1';

  // ---- Server mode ----
  // On the deployed site, /api exists (Vercel serverless + Supabase) and is used.
  // Locally (no /api), everything transparently falls back to localStorage.
  let SERVER_MODE = null; // null = unknown yet
  async function detectServer() {
    if (SERVER_MODE !== null) return SERVER_MODE;
    try {
      const r = await fetch('/api/stats', { method: 'GET' });
      // 404/405 = no backend on this host → localStorage demo mode.
      // 200 = healthy. 5xx = a backend exists but its database is down:
      // stay in server mode so submissions fail loudly instead of being
      // silently saved into a browser the school can never read.
      SERVER_MODE = r.ok || r.status >= 500;
    } catch { SERVER_MODE = false; }
    return SERVER_MODE;
  }
  const isServer = () => SERVER_MODE === true;

  const GRADES = [
    { id: 'ecd-a',  name: 'ECD A',          ages: '3–4 yrs',  fee: 20,  places: 25, desc: 'First steps: play, language and routine.' },
    { id: 'ecd-b',  name: 'ECD B',          ages: '4–5 yrs',  fee: 20,  places: 25, desc: 'School readiness through structured play.' },
    { id: 'g1',     name: 'Grade 1',        ages: '6 yrs',    fee: 30,  places: 30, desc: 'Learning to read, write and count with confidence.' },
    { id: 'g2',     name: 'Grade 2',        ages: '7 yrs',    fee: 30,  places: 30, desc: 'Building fluency in literacy and numeracy.' },
    { id: 'g3',     name: 'Grade 3',        ages: '8 yrs',    fee: 30,  places: 30, desc: 'Independent reading and problem solving.' },
    { id: 'g4',     name: 'Grade 4',        ages: '9 yrs',    fee: 40,  places: 32, desc: 'Content subjects begin alongside core skills.' },
    { id: 'g5',     name: 'Grade 5',        ages: '10 yrs',   fee: 40,  places: 32, desc: 'Deeper work in sciences and heritage studies.' },
    { id: 'g6',     name: 'Grade 6',        ages: '11 yrs',   fee: 40,  places: 32, desc: 'Leadership roles and exam technique.' },
    { id: 'g7',     name: 'Grade 7',        ages: '12 yrs',   fee: 50,  places: 32, desc: 'National examinations and secondary readiness.' },
  ];

  const STATUSES = ['pending', 'review', 'accepted', 'waitlist', 'declined'];

  const gradeById = id => GRADES.find(g => g.id === id);
  const gradeName = id => (gradeById(id) || {}).name || id;

  function load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch { return []; }
  }
  function save(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  function refCode() {
    const n = String(load().length + 1).padStart(4, '0');
    const r = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `TSP-${new Date().getFullYear()}-${n}${r}`;
  }

  // Create an application. Async; returns {ok, ref} or {ok:false, errors}.
  // In server mode it POSTs to /api/applications; otherwise saves to localStorage.
  async function createApplication(data) {
    const errors = validate(data);
    if (errors.length) return { ok: false, errors };
    if (await detectServer()) {
      try {
        const r = await fetch('/api/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) return { ok: false, errors: j.errors || ['The server could not save the application. Please try again.'] };
        return { ok: true, ref: j.ref };
      } catch {
        return { ok: false, errors: ['Network problem — please check your connection and try again.'] };
      }
    }
    const app = {
      ref: refCode(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      learner: {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        dob: data.dob,
        gender: data.gender,
        grade: data.grade,
        notes: (data.notes || '').trim(),
      },
      guardian: {
        name: data.guardianName.trim(),
        phone: data.phone.trim(),
        email: (data.email || '').trim(),
        relation: data.relation,
      },
    };
    const list = load();
    list.push(app);
    save(list);
    return { ok: true, ref: app.ref };
  }

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
    if (!gradeById(d.grade)) errors.push('Please choose a grade.');
    if (!['female', 'male'].includes(d.gender)) errors.push('Please choose a gender.');
    req(d.guardianName, 'Parent/Guardian name is required.');
    req(d.phone, 'Contact phone is required.');
    if (d.phone && !/^[+0-9()\s-]{7,20}$/.test(d.phone.trim())) errors.push('Phone number looks invalid.');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) errors.push('Email address looks invalid.');
    if (!['parent', 'guardian', 'other'].includes(d.relation)) errors.push('Please say how you are related to the learner.');
    return errors;
  }

  function allLocal() { return load(); }

  // Dashboard listing. Server mode: from the API (optionally with admin token).
  async function all(adminToken) {
    if (await detectServer()) {
      try {
        const r = await fetch('/api/applications', { headers: adminToken ? { 'x-admin-token': adminToken } : {} });
        if (!r.ok) throw 0;
        const j = await r.json();
        return (j.applications || []).map(normalizeServerRow);
      } catch {
        return { error: 'Could not load applications from the server.' };
      }
    }
    return allLocal();
  }
  function normalizeServerRow(row) {
    return {
      ref: row.ref,
      status: row.status,
      createdAt: (row.created_at || '').replace('T', ' ').slice(0, 10),
      updatedAt: (row.updated_at || '').replace('T', ' ').slice(0, 10),
      learner: row.learner,
      guardian: row.guardian,
    };
  }
  function byRef(ref) { return load().find(a => a.ref === ref) || null; }

  // Status change + delete need admin rights in server mode.
  async function setStatus(ref, status, adminToken) {
    if (!STATUSES.includes(status)) return false;
    if (await detectServer()) {
      try {
        const r = await fetch('/api/applications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken || '' },
          body: JSON.stringify({ ref, status }),
        });
        return r.ok;
      } catch { return false; }
    }
    const list = load();
    const app = list.find(a => a.ref === ref);
    if (!app) return false;
    app.status = status;
    app.updatedAt = new Date().toISOString();
    save(list);
    return true;
  }
  async function remove(ref, adminToken) {
    if (await detectServer()) {
      try {
        const r = await fetch('/api/applications?ref=' + encodeURIComponent(ref), {
          method: 'DELETE',
          headers: { 'x-admin-token': adminToken || '' },
        });
        return r.ok;
      } catch { return false; }
    }
    save(load().filter(a => a.ref !== ref));
    return true;
  }

  // Public "how many places" view. Server mode reads live counts from /api/stats.
  async function gradeStats() {
    if (await detectServer()) {
      try {
        const r = await fetch('/api/stats');
        if (r.ok) {
          const j = await r.json();
          return j.gradeStats || [];
        }
      } catch { /* fall through to local */ }
    }
    const apps = load();
    return GRADES.map(g => {
      const mine = apps.filter(a => a.learner.grade === g.id);
      const taken = mine.filter(a => a.status !== 'declined').length;
      const pending = mine.filter(a => a.status === 'pending' || a.status === 'review').length;
      return { ...g, taken, pending, remaining: Math.max(g.places - taken, 0) };
    });
  }

  async function summary(adminToken) {
    if (await detectServer()) {
      try {
        const r = await fetch('/api/stats');
        if (r.ok) {
          const j = await r.json();
          if (j.summary) {
            // enrich with grade counts for the dashboard table
            const byGrade = {};
            (j.gradeStats || []).forEach(g => { byGrade[g.id] = g.taken; });
            return { ...j.summary, byGrade };
          }
        }
      } catch { /* fall through to local */ }
    }
    const apps = load();
    const s = { total: apps.length, byStatus: {}, byGrade: {} };
    STATUSES.forEach(st => { s.byStatus[st] = apps.filter(a => a.status === st).length; });
    GRADES.forEach(g => { s.byGrade[g.id] = apps.filter(a => a.learner.grade === g.id).length; });
    return s;
  }

  function toCSV(rows) {
    const head = ['Ref', 'Status', 'Submitted', 'Learner', 'DOB', 'Gender', 'Grade', 'Guardian', 'Phone', 'Email', 'Relation', 'Notes'];
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [head.join(',')];
    rows.forEach(a => {
      lines.push([
        a.ref, a.status, a.createdAt.slice(0, 10),
        `${a.learner.firstName} ${a.learner.lastName}`,
        a.learner.dob, a.learner.gender, gradeName(a.learner.grade),
        a.guardian.name, a.guardian.phone, a.guardian.email, a.guardian.relation, a.learner.notes,
      ].map(esc).join(','));
    });
    return lines.join('\r\n');
  }

  function downloadCSV(rows) {
    const blob = new Blob(['\ufeff' + toCSV(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tshovani-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Demo data so the dashboard is not empty on first look.
  function seedDemo() {
    if (localStorage.getItem(SESSIONS_KEY)) return;
    const demo = [
      ['Tariro', 'Moyo', '2019-03-14', 'female', 'g1', 'Ropafadzo Moyo', '+263 77 111 2233', 'parent', 'pending'],
      ['Kudzai', 'Sithole', '2014-08-02', 'male', 'g6', 'Nyasha Sithole', '+263 71 445 8890', 'guardian', 'review'],
      ['Anesu', 'Chikafu', '2020-01-20', 'male', 'ecd-b', 'Rudo Chikafu', '+263 78 220 4411', 'parent', 'accepted'],
      ['Tadiwa', 'Ncube', '2018-11-05', 'female', 'g3', 'Sikhanyiso Ncube', '+263 77 909 1122', 'parent', 'pending'],
      ['Panashe', 'Murwira', '2013-05-30', 'male', 'g7', 'Tendai Murwira', '+263 71 664 0099', 'other', 'waitlist'],
    ];
    const list = load();
    const exists = new Set(list.map(a => a.learner.firstName + ' ' + a.learner.lastName));
    demo.forEach(([fn, ln, dob, gen, grade, gname, phone, rel, status]) => {
      const key = fn + ' ' + ln;
      if (exists.has(key)) return;
      list.push({
        ref: refCode(), status,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 12) * 864e5).toISOString(),
        updatedAt: new Date().toISOString(),
        learner: { firstName: fn, lastName: ln, dob, gender: gen, grade, notes: '' },
        guardian: { name: gname, phone, email: '', relation: rel },
      });
    });
    save(list);
    localStorage.setItem(SESSIONS_KEY, '1');
  }

  return { GRADES, STATUSES, gradeById, gradeName, validate, createApplication, all, allLocal, byRef, setStatus, remove, gradeStats, summary, toCSV, downloadCSV, seedDemo, isServer: () => SERVER_MODE === true, detectServer };
})();
