# Dunesday

Tracks English showtimes for **Avengers: Doomsday** and **Dune: Part Three** in Hyderabad on [District](https://www.district.in) and [BookMyShow](https://in.bookmyshow.com). Every 20 minutes a GitHub Action, running on a self-hosted runner on a home PC, loads every bookable date and emails people when new shows appear. A dashboard with invite-only login runs at `dunesday.ayushk08.com`.

```
tracker/        Python: fetch District / BookMyShow, diff against MongoDB, send emails
web/            Next.js 16: dashboard, email-code login, admin settings
.github/        check-shows (cron, every 20 min; District and BookMyShow in parallel) and test (on push)
tests/          tracker tests against saved District pages
```

## How it works

- District's movie page (`/movies/<slug>-movie-tickets-in-<city>-MV<id>`) embeds every session for one date in `__NEXT_DATA__`. `?fromdate=YYYY-MM-DD` selects other dates, and `&frmtid=<key>` selects the language.
- Each session gets a key: cinema + session id + date + time + format. Any key not already in MongoDB counts as **new**. That includes extra shows added on dates that were already bookable, and shows that changed time or format.
- Each person gets at most one email per check, filtered by their films and formats under **My alerts**.
- If a check fails, admins get one email when the failures start and one when the tracker recovers. District and BookMyShow are tracked separately.

### BookMyShow

- The showtimes page (`/movies/<city>/<slug>/buytickets/<ET code>/<YYYYMMDD>`) embeds the shows for one format and one date in `window.__INITIAL_STATE__`. Each format (2D, 4DX, EPIQ…) has its own ET code, listed in the page's format picker, so one check is one request per format per bookable date.
- It runs as a parallel job in the same GitHub workflow (`python -m tracker --source bookmyshow`), so neither site waits for or is stopped by the other. BookMyShow's Cloudflare often blocks GitHub's IPs. Its job is allowed to fail without turning the run red, and admins get one "BookMyShow check is failing" email.
- A show on both sites (same film, date, time and cinema, matched by name in `tracker/cinemas.py`) is stored twice but emailed only once, by whichever site's check stored it first (an earlier `first_seen_at`). If both store it in the same instant, it's emailed twice, never zero times.
- BookMyShow doesn't publish seat counts, so its shows have prices but no fill bar.

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
Skip the `--no-email` run if you *want* one big email listing every show that's already bookable. Do the same first fill for BookMyShow with `.venv\Scripts\python -m tracker --source bookmyshow --no-email`.

### 4. GitHub
1. Create a **public** repo named `dunesday` and push this folder to it.
2. Go to **Settings > Secrets and variables > Actions**:
   - Secrets: `MONGODB_URI`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`
   - Variables: `SITE_URL` = `https://dunesday.ayushk08.com`. Optional: `BMS_IN_ACTIONS` = `false` turns off the BookMyShow step.
3. Install the self-hosted runners on a Windows PC on a home connection (District and BookMyShow both block GitHub's own machines). Needs `uv` and `gh auth login`, no admin rights:
   ```powershell
   .\scripts\setup-runner.ps1          # two runners, so District and BookMyShow run in parallel
   .\scripts\setup-runner.ps1 -Remove  # undo
   ```
   Each runner is a scheduled task that starts when you log on. Checks only run while the PC is on and awake; runs that come due while it's off wait in the queue, and only the newest waiting run per site is kept.
4. Under **Actions**, open *check-shows* and click **Run workflow** once to confirm it works.
5. For the site's **Check now** button, create a fine-grained token under **Settings > Developer settings > Fine-grained tokens**. Give it access to only this repo, with **Actions: Read and write**. This is `GITHUB_TOKEN` in Vercel.

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

- **GitHub's cron is best effort.** Scheduled runs are often late by an hour or more, or skipped entirely, especially on new or rarely active repos. The schedule (`7,27,47 * * * *`) stays as a backup. For checks that really run every 20 minutes, have an outside scheduler start the workflow:
  1. Create a fine-grained token with access to only this repo and **Actions: Read and write** (the **Check now** token works).
  2. At [cron-job.org](https://cron-job.org) (free), add a job every 20 minutes: `POST https://api.github.com/repos/<owner>/dunesday/actions/workflows/check.yml/dispatches`, headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, body `{"ref":"main","inputs":{"trigger":"cron"}}`. Sending `trigger: cron` makes the run respect **Pause**.
  3. A dispatch that lands while that site's check is still running waits for it instead of overlapping.
- **GitHub disables scheduled workflows** in public repos after 60 days with no commits. The Health page warns when the last check is over an hour old.
- **District has no public API.** If it changes its page format, checks fail and admins get an email. The fix is usually in `tracker/sources/district.py`. Save a new fixture and update the tests.
- **Why a self-hosted runner:** District (Akamai) and BookMyShow (Cloudflare) answer GitHub's IPs with HTTP 403, while the same pages load fine from home. Running the job in Docker on GitHub wouldn't help, since the container shares the GitHub machine's IP.
- **Without the runner workflow** (PC not available), a plain Task Scheduler job also works, every 20 minutes:
  ```powershell
  $a = New-ScheduledTaskAction -Execute "$PWD\.venv\Scripts\python.exe" -Argument "-m tracker --source bookmyshow" -WorkingDirectory "$PWD"
  $t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 20)
  Register-ScheduledTask -TaskName "Dunesday BookMyShow" -Action $a -Trigger $t -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)
  ```
  It reads `.env`, so it only runs while the PC is on. Remove it with `Unregister-ScheduledTask "Dunesday BookMyShow"`.
- **Keep the volume low.** This is one request per film per date (and, on BookMyShow, per format) every 20 minutes, for personal use only. BookMyShow answers 403 if requests come too fast, so its client waits 2.5 s between pages.
