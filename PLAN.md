# Dunesday Tracker: Plan

Email alerts whenever a new English showtime for **Avengers: Doomsday** or **Dune: Part Three** appears in **Hyderabad** on **District**. A login-protected dashboard at **dunesday.ayushk08.com** lets you and a few friends browse shows, check the tracker's health, and (admin only) change settings.

## Decisions

| Topic | Choice |
|---|---|
| City / language | Hyderabad, English only |
| Trigger | Every new showtime (new theatre, date, time or format) |
| Formats | All, each tagged (IMAX / 4DX / Dolby / ICE / EPIQ / P[XL] / 2D / 3D) |
| Platforms | District and BookMyShow, both in GitHub Actions. BookMyShow's Cloudflare may block cloud IPs; its step can fail without affecting District, and can run from a home PC instead |
| Tracker | Python 3.12 on GitHub Actions, public repo, cron every 20 min |
| Database | MongoDB Atlas free tier (M0) holds all data and settings, nothing in the repo |
| Website | Next.js (App Router) on Vercel Hobby, at `dunesday.ayushk08.com` |
| Login | Email one-time code for an allowlist of emails |
| Roles | **Admin** (you): everything. **Viewer** (friends): browse shows, see health, set their own alert preferences |
| Alerts | Gmail SMTP + app password. Each person gets one grouped email per check, filtered by their own movie/format preferences |

## Architecture

```
GitHub Actions (cron */20, or "Check now" from the site)
  └─ python -m tracker
       1. read settings from MongoDB → exit early if paused
       2. fetch District Hyderabad shows for each enabled movie
       3. normalize + filter English
       4. upsert into `shows`; the ones not seen before are "new"
       5. for each user with alerts on → filter new shows by their prefs → send 1 email
       6. write a `runs` record (status, counts, error, emails sent)
       7. on failure → email admin once per failure streak

Vercel (Next.js)  dunesday.ayushk08.com
  ├─ middleware: every route requires a session except /login and /api/auth/*
  ├─ pages read and write MongoDB directly (server components / server actions)
  └─ "Check now" → GitHub API workflow_dispatch (fine-grained token)

MongoDB Atlas (M0)
  shows · runs · settings · users · otp_codes · sessions
```

### Repo layout (monorepo, public)

```
dunesday/
├─ tracker/                    # Python
│  ├─ __main__.py              # orchestration
│  ├─ db.py                    # pymongo access
│  ├─ models.py                # Show + stable key
│  ├─ sources/district.py      # fetch + parse
│  ├─ formats.py               # raw screen text → format tag
│  └─ notify.py                # per-user HTML email via smtplib
├─ tests/fixtures/             # saved District responses
├─ web/                        # Next.js app (Vercel root directory)
│  ├─ app/(auth)/login/
│  ├─ app/(app)/               # dashboard, shows, health, me, settings, users
│  ├─ lib/{db,auth,email,github}.ts
│  └─ middleware.ts
├─ requirements.txt
└─ .github/workflows/check.yml
```

## MongoDB collections

| Collection | Shape (key fields) | Notes |
|---|---|---|
| `shows` | `_id` = `district\|movie\|theatre_id\|date\|time\|format`, theatre_name, language, booking_url, `first_seen_at`, `last_seen_at`, `active` | `active=false` when a show vanishes (sold out or removed) |
| `runs` | started_at, finished_at, status (`ok`/`error`/`skipped`), shows_found, new_shows, emails_sent, error, trigger (`cron`/`manual`) | TTL index, 30 days |
| `settings` | one doc: movies `[{name, aliases[], enabled}]`, city, language, days_ahead, `paused`, failure_streak | The tracker reads this on every run |
| `users` | email, role (`admin`/`viewer`), prefs `{alerts_on, movies[], formats[]}` | This collection **is** the allowlist |
| `otp_codes` | email, code_hash, attempts, expires_at | TTL index, 10 min |
| `sessions` | token_hash, email, expires_at | TTL index, 30 days |

## Website

| Page | Who | What |
|---|---|---|
| `/login` | anyone | Enter email, get a 6-digit code, enter the code |
| `/` Dashboard | all | Show count per movie, recent new shows, health badge (last run, OK/failing). Admin also sees **Check now**, **Pause/Resume**, **Send test email** |
| `/shows` | all | Full table, filterable by movie / theatre / date / format / "new in last 24 h", with booking links |
| `/health` | all | Run history: time, trigger, duration, found/new, emails sent, errors |
| `/me` | all | My alert preferences: alerts on/off, which movies, which formats |
| `/settings` | admin | Movies + title aliases, enable/disable, city, language, days ahead |
| `/users` | admin | Add/remove allowed emails, set roles |

### Auth details (custom, roughly 150 lines, no auth library)

- **Requesting a code:** if the email is in `users`, generate a 6-digit code, store its SHA-256 hash, and email it via Gmail. The page shows the same response whether or not the email is allowed, so nobody can probe the list.
- **Limits:** 1 code request per email per minute and 5 per hour. Each code allows 5 tries and expires after 10 min.
- **Sessions:** on success, a random 32-byte token goes into an `httpOnly; Secure; SameSite=Lax` cookie. Only its hash is stored in `sessions`.
- **Admin checks** happen on the server in every admin server action and route, not just by hiding buttons.
- **Seeding:** your email is the initial admin, set via an `ADMIN_EMAIL` env var on first boot.

### Controls

- **Check now:** the server calls `POST /repos/{owner}/dunesday/actions/workflows/check.yml/dispatches` using a fine-grained GitHub token limited to this repo with *Actions: write*. The run appears on `/health` about a minute later.
- **Pause:** sets `settings.paused`. Cron runs still start but log `skipped` and exit.
- **Test email:** sends a sample alert to the admin from Vercel.

## Tracker details

- **Before bookings open:** "movie not found" and "zero shows" are normal states, not errors.
- **Title matching:** normalized aliases from settings (`avengers doomsday`, `dune part three`, `dune 3`). This also catches format-specific listings like "Avengers: Doomsday (IMAX 3D)" and avoids "Dune: Part Two" re-releases.
- **Date range:** today through `days_ahead` (default 21).
- **Email subject:** like `🎬 12 new shows: Dune Part Three (IMAX ×4), Avengers Doomsday (8)`. The body groups movie, then theatre, then date, with format badges and booking links.
- **Workflow:** `concurrency: tracker`, `timeout-minutes: 5`, triggered by `schedule` + `workflow_dispatch`.

## Secrets / env

| Where | Variables |
|---|---|
| GitHub Actions secrets | `MONGODB_URI`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` |
| Vercel env | `MONGODB_URI`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ADMIN_EMAIL`, `GITHUB_TOKEN` (fine-grained), `GITHUB_REPO`, `SITE_URL` |

## Setup you'll do (I'll guide each step)

1. **MongoDB Atlas:** free M0 cluster, ideally in the Mumbai region (AWS ap-south-1). Create a database user and allow `0.0.0.0/0` under Network Access, because GitHub and Vercel use changing IPs. The strong DB password is the protection here.
2. **Gmail:** turn on 2-Step Verification, then create an App Password.
3. **GitHub:** create a public repo and add the 3 secrets. Create a fine-grained token for **Check now**.
4. **Vercel:** import the repo with root directory `web`, add the env vars, and set the function region to Mumbai (`bom1`) so it's close to Atlas.
5. **DNS:** add the domain in Vercel, then at the DNS provider for ayushk08.com add `CNAME dunesday → cname.vercel-dns.com`.

## Build order

1. **Find the District data source:** use a movie showing now in Hyderabad, check DevTools > Network, and save a fixture.
2. **Tracker core:** scraper, parser, format tags, tests against the fixture.
3. **MongoDB layer:** collections, indexes (TTLs, unique keys), and the diff via upsert.
4. **Email:** per-user filtering, the HTML template, failure emails to admin.
5. **Workflow:** run it manually against a movie **showing now** to confirm data lands in Mongo and the email arrives.
6. **Website, part 1:** OTP login, middleware, sessions.
7. **Website, part 2:** dashboard, shows table, health, my preferences.
8. **Website, part 3:** admin settings, users, controls (Check now / Pause / Test email).
9. **Deploy:** Vercel + `dunesday.ayushk08.com`. Do an end-to-end test with a friend's account.
10. **Switch the movie settings** to Avengers: Doomsday + Dune: Part Three and leave it running.

## Caveats

- **GitHub cron is best effort.** "Every 10 min" is often 10 to 20 min apart, and runs can be skipped when GitHub is busy. Use **Check now** if you want a check right away.
- **GitHub disables scheduled workflows** in public repos after 60 days with no commits. The release is within that window, but the site will warn if the last run is over an hour old.
- **District's internal API is undocumented** and can change. Fixture tests plus the failure email make breakage obvious quickly.
- **Gmail's limit is about 500 emails a day**, which is plenty for a few friends.
- **Scraping may break District's terms of service.** Keep it low volume and for personal use.
- **BookMyShow may block GitHub's IPs.** If it does, run `python -m tracker --source bookmyshow` from a home PC. Many Hyderabad cinemas (Prasads, AAA, Aparna, Asian, AMB) are BookMyShow-only.
