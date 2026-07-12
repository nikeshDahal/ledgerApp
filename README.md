# Trikut Snacks — Ledger

A bookkeeping, sales, stock (FIFO), customer/supplier, and production tracking app for Trikut Snacks, with staff login and shared data via Supabase.

## What changed from the Claude artifact version

- `window.storage` (Claude-only) → `src/storage.js`, backed by a Supabase table, so it works in a normal browser.
- Added login/sign-up (`src/AuthContext.jsx`) using Supabase Auth.
- Added roles: **partner** (full access, including Partner Capital) and **staff** (everything except Partner Capital).
- Everyone who signs in sees the same shared company data — this isn't per-user private storage.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project (free tier is fine).
2. Once it's ready, go to **SQL Editor → New query**, paste the contents of `supabase-schema.sql`, and run it. This creates the `kv_store` and `profiles` tables with the right security rules.
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

1. On the login screen, click **"Create an account"** and sign up with your email — this becomes your first **staff** account.
2. By default, **email confirmation is on** in Supabase, so check your inbox and confirm before signing in. (You can turn this off under Authentication → Providers → Email → "Confirm email" if you want faster local testing.)
3. To make yourself (or Ashish/Kapil) a **partner** (so you can see Partner Capital), go to Supabase → **Table Editor → profiles**, find your row, and change `role` from `staff` to `partner`. Or run in the SQL Editor:
   ```sql
   update profiles set role = 'partner' where id = 'paste-the-user-uuid-here';
   ```
   You can find the UUID under **Authentication → Users**.
4. Repeat sign-up for Ashish, Kapil, and any staff — they'll all see the same shared ledger data once logged in.

## 5. Deploy it for real

**Vercel (recommended, free tier is plenty):**

1. Push this folder to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) → New Project → import the repo.
3. Vercel auto-detects Vite. Before deploying, add your environment variables under **Settings → Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. You'll get a live URL you can share with the team (or point a custom domain at).

**Netlify** works the same way — connect the repo, set the same two environment variables, build command `npm run build`, publish directory `dist`.

## Notes & limitations

- **Role changes are manual by design** — staff can't promote themselves to partner from the app; only via the Supabase dashboard/SQL editor. This keeps Partner Capital data safe from accidental or unwanted access.
- **All business data is shared**, not per-user — this matches how a small business ledger should work, but means anyone with a login (staff included) can see customers, sales, stock, and transactions. Only Partner Capital is restricted.
- If you later want finer-grained permissions (e.g. staff can add sales but not delete them), that would mean adding per-action role checks in `App.jsx` — happy to help with that if it becomes useful.
