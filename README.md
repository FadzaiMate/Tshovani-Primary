# Tshovani Primary School — Website & Enrollment System

Website for Tshovani Primary School (Chiredzi, Zimbabwe) with a photo showcase
and a complete online enrollment flow: parents apply for any grade (ECD A –
Grade 7), and staff review applications in a dashboard.

Plain HTML/CSS/JS. No build step, no frameworks.

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Public showcase: photo hero, stats, programs, gallery + lightbox, testimonials |
| `enroll.html` | Grade overview with live place counts + validated application form, reference number on submit |
| `admin.html` | Staff dashboard (PIN-gated): stats, per-grade fill, search/filter, status changes, CSV export, print |

## How the data works

- **Deployed (Vercel):** applications are stored in Supabase (Postgres) via
  serverless functions in `api/`. Every parent application reaches the same
  dashboard. Status changes and deletions require the staff PIN (admin token).
- **Local (opened without the API):** the same pages fall back to
  `localStorage` on that browser and seed 5 demo applications, so everything
  is testable offline. The dashboard shows a "Local demo mode" tag.

`app.js` picks the mode automatically by probing `/api/stats`.

## Run locally

Any static server works. Two options are included:

```bash
# Option 1: Node (installed on this machine)
node server.js          # serves http://localhost:8000

# Option 2: double-click start-server.bat  (Windows, uses PowerShell)
```

Then open http://localhost:8000 · staff dashboard at /admin.html (local PIN: **1234**).

## Deploy to Vercel (with the real backend)

1. **Create the database (once, free):**
   - Create a project at [supabase.com](https://supabase.com)
   - SQL Editor → paste `api/schema.sql` → Run
   - Copy from Project Settings → API: the **Project URL** and the
     **service_role key** (keep it secret!)
2. **Deploy & configure (once):**
   ```bash
   npm i -g vercel
   vercel login
   vercel link
   vercel env add SUPABASE_URL          # paste the Project URL
   vercel env add SUPABASE_SERVICE_KEY  # paste the service key
   vercel env add ADMIN_TOKEN           # choose the staff PIN, e.g. 0413
   vercel --prod
   ```
3. **Auto-deploy:** in the Vercel dashboard open the project →
   Settings → Git → connect `FadzaiMate/Tshovani-Primary`. Every push to
   `main` then deploys production automatically.

The staff PIN on the live site is the `ADMIN_TOKEN` environment variable.
Entering it at `/admin.html` unlocks the dashboard and authorizes status
changes and deletions against the API.

## Image credits

All photos are freely licensed (Wikimedia Commons) — see
`images/CREDITS.md`. Replace them with real school photos (same filenames)
before launch and everything keeps working.
