# Dunesday

Tracks English showtimes for **Avengers: Doomsday** and **Dune: Part Three** in Hyderabad on [District](https://www.district.in). Every 10 minutes a GitHub Action loads every bookable date and emails people when new shows appear. A dashboard with invite-only login runs at `dunesday.ayushk08.com`.

```
tracker/        Python: fetch District, diff against MongoDB, send emails
web/            Next.js 16: dashboard, email-code login, admin settings
.github/        check-shows (cron, every 10 min) and test (on push)
tests/          tracker tests against saved District pages
```

## How it works

- District's movie page (`/movies/<slug>-movie-tickets-in-<city>-MV<id>`) embeds every session for one date in `__NEXT_DATA__`. `?fromdate=YYYY-MM-DD` selects other dates, and `&frmtid=<key>` selects the language.
- Each session gets a key: cinema + session id + date + time + format. Any key not already in MongoDB counts as **new**. That includes extra shows added on dates that were already bookable, and shows that changed time or format.
- Each person gets at most one email per check, filtered by their films and formats under **My alerts**.
- If a check fails, admins get one email when the failures start and one when the tracker recovers.

## One-time setup

### 1. MongoDB Atlas
1. Create a free **M0** cluster, preferably in Mumbai (AWS `ap-south-1`).
2. Under **Database Access**, add a user with a long random password.
3. Under **Network Access**, allow `0.0.0.0/0`. GitHub Actions and Vercel don't have fixed IPs, so the password is the protection.
4. Copy the connection string (`mongodb+srv://…`). This is `MONGODB_URI`.

### 2. Gmail
1. Turn on 2-Step Verification for the Google account.
2. Create an app password at <https://myaccount.google.com/apppasswords>. The 16 characters are `GMAIL_APP_PASSWORD`.

### 3. Initialize the database (once, from this PC)
```powershell
python -m venv .venv; .venv\Scripts\pip install -r requirements.txt
copy .env.example .env        # fill in MONGODB_URI, GMAIL_USER, GMAIL_APP_PASSWORD
.venv\Scripts\python -m tracker init --admin you@gmail.com
.venv\Scripts\python -m tracker --no-email   # first fill: stores the current shows without emailing hundreds of them
```
Skip the `--no-email` run if you *want* one big email listing every show that's already bookable.

### 4. GitHub
1. Create a **public** repo named `dunesday` and push this folder to it.
2. Go to **Settings > Secrets and variables > Actions**:
   - Secrets: `MONGODB_URI`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`
   - Variables: `SITE_URL` = `https://dunesday.ayushk08.com`
3. Under **Actions**, open *check-shows* and click **Run workflow** once to confirm it works.
4. For the site's **Check now** button, create a fine-grained token under **Settings > Developer settings > Fine-grained tokens**. Give it access to only this repo, with **Actions: Read and write**. This is `GITHUB_TOKEN` in Vercel.

### 5. Vercel
1. Import the repo and set **Root Directory** to `web`.
2. Under **Settings > Functions**, set the region to Mumbai (`bom1`).
3. Add these environment variables:

| Name | Value |
|---|---|
| `MONGODB_URI` | same as above |
| `AUTH_SECRET` | 32+ random characters (`openssl rand -base64 32`) |
| `ADMIN_EMAIL` | your email; it becomes admin on first sign-in |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | same as above (used for login codes) |
| `GITHUB_TOKEN` | the fine-grained token |
| `GITHUB_REPO` | `your-username/dunesday` |
| `SITE_URL` | `https://dunesday.ayushk08.com` |

4. Under **Settings > Domains**, add `dunesday.ayushk08.com`. At your DNS provider, create `CNAME dunesday → cname.vercel-dns.com`.

### 6. Invite friends
Sign in, open **People**, and add their emails. They sign in with a code emailed to them.

## Local development

```powershell
# tracker
.venv\Scripts\python -m pytest -q
.venv\Scripts\python -m tracker --dry-run     # live fetch, prints a summary, touches nothing

# web (needs a MongoDB; MAIL_DEV_LOG=1 prints emails to the console instead of sending them)
cd web; npm install
$env:MONGODB_URI="..."; $env:AUTH_SECRET="any-long-string-here"; $env:ADMIN_EMAIL="you@gmail.com"; $env:MAIL_DEV_LOG="1"
npm run dev
```

## Things to know

- **GitHub's cron is best effort.** "Every 10 minutes" often means 10 to 20 minutes, and runs can be skipped under load. Use **Check now** when you want a check right away.
- **GitHub disables scheduled workflows** in public repos after 60 days with no commits. The Health page warns when the last check is over an hour old.
- **District has no public API.** If it changes its page format, checks fail and admins get an email. The fix is usually in `tracker/sources/district.py`. Save a new fixture and update the tests.
- **Keep the volume low.** This is one request per film per date every 10 minutes, for personal use only.
