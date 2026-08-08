# Trikut Snacks Ledger

A full business management app for Trikut Snacks — sales, purchases, production, stock (FIFO costed), customers/suppliers, accrual-basis accounting, fixed assets, and more. This is the deployable version of the Claude-artifact app, adapted to run as a normal website backed by Supabase.

What changed from the Claude-artifact version:

- `window.storage` (Claude-only) → `src/storage.js`, backed by a Supabase table, so it works in a normal browser.
- Added login/sign-up (`src/AuthContext.jsx`) using Supabase Auth.
- Added three roles: **Super Admin** (full access, plus manages everyone's role from the in-app **Team** tab), **Admin** (full business access — everything except Team), and **Staff** (day-to-day operations only — no Orders, Partner Capital, Accounting, Backup, Insights, Activity, or Team).
- Everyone who signs in sees the same shared company data — this isn't per-user private storage.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project (free tier is fine).
2. Once it's ready, go to **SQL Editor → New query**, paste the contents of `supabase-schema.sql`, and run it. This creates the `kv_store` and `profiles` tables with the right security rules.
   - **Already had this app running before Team was added?** Use `supabase-migration-team-roles.sql` instead — it safely upgrades your existing tables (adds the email column, moves the old check constraint, migrates any `partner` accounts to `admin`) without touching your data.
3. Go to **Project Settings → API** and copy:
   - Project URL
   - `anon` public key

## 2. Configure the app

```bash
cp .env.example .env
```

Edit `.env` and paste in your Project URL and anon key:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 3. Install and run locally

```bash
npm install
npm run dev
```

Open the local URL it prints (usually `http://localhost:5173`).

## 4. Create your accounts

1. On the login screen, click **"Create an account"** and sign up with your email — this becomes your first **Staff** account.
2. By default, **email confirmation is on** in Supabase, so check your inbox and confirm before signing in. (You can turn this off under Authentication → Providers → Email → "Confirm email" if you want faster local testing.)
3. Every project starts with no Super Admin — there's nobody who can use the Team tab yet. Promote your own first account once, by hand:
   ```sql
   update profiles set role = 'super_admin' where id = 'paste-the-user-uuid-here';
   ```
   Find the UUID under **Authentication → Users**, or match on email instead:
   ```sql
   update profiles set role = 'super_admin' where email = 'your-email@example.com';
   ```
4. Repeat sign-up for Ashish, Kapil, and any staff — they'll all see the same shared ledger data once logged in. From here on, use the **Team** tab (visible only to Super Admins) to set everyone's role — Admin or Staff — no more SQL needed.

## 5. Deploy it for real

**Netlify (what this project has been using):**

1. Push this folder to a GitHub repo.
2. Go to [netlify.com](https://netlify.com) → New site → import the repo.
3. Build command: `npm run build`. Publish directory: `dist`.
4. Add your environment variables under **Site settings → Environment variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Since this is a single-page app, add a `_redirects` file in `public/` (create the folder if it doesn't exist) containing:
   ```
   /*  /index.html  200
   ```
   This makes client-side routing work on refresh/deep links.
6. Deploy. You'll get a live URL you can share with the team (or point a custom domain at).

**Vercel** works the same way — connect the repo, same two environment variables, Vercel auto-detects Vite and handles SPA routing automatically.

## Notes & limitations

- **Role changes happen in-app now** — any Super Admin can promote or demote anyone from the **Team** tab. This is enforced by a Supabase Row Level Security policy (only accounts whose own role is `super_admin` can update the `profiles` table), not just the UI — so it can't be bypassed by tampering with client requests.
- **The very first Super Admin still has to be set by hand** (step 4.3 above), since there's no one to promote it from inside the app yet on a brand-new project.
- **All business data is shared**, not per-user — this matches how a small business ledger should work, but means anyone with a login (Staff included) can see customers, sales, stock, and transactions. Orders, Partner Capital, Accounting, Insights, Activity, and Backup are restricted to Admin and Super Admin; Team is restricted to Super Admin only.
- **Supabase's free tier pauses a project after about a week of inactivity** — the first request after that will be slow while it wakes back up, that's normal.
- If you later want finer-grained permissions (e.g. staff can add sales but not delete them), that would mean adding per-action role checks in `App.jsx` — happy to help with that if it becomes useful.
