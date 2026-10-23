# Traffic readiness checklist

Do these in the dashboards before sending real traffic. Nothing here needs a secret in the repo.

## 1. Vercel Speed Insights and Web Analytics

1. vercel.com > team > project `rigzea-website` > **Speed Insights** tab > **Enable**.
2. Same project > **Analytics** tab > **Enable** (Web Analytics, cookieless).
3. Both need one script tag on the pages you want measured (ask a developer; the site is plain HTML):
   `<script defer src="/_vercel/insights/script.js"></script>` and
   `<script defer src="/_vercel/speed-insights/script.js"></script>`.
   Both are same-origin, so the CSP in `vercel.json` already allows them.
4. The privacy page says no analytics is used. Update `rigzea/legal/privacy/` before turning analytics on.

## 2. Uptime monitoring

1. Create a free monitor (UptimeRobot, Better Stack or similar): HTTPS check, every 1-5 minutes.
2. Monitor A: `https://rigzea.com/` expects 200.
3. Monitor B: `https://rigzea.com/p/<a-real-listing-slug>/` expects 200 and a keyword from the listing title
   (this proves the function and Supabase both work).
4. `/api/cron-reminders/` needs `Authorization: Bearer $CRON_SECRET`. Do not put the secret in a monitor.
   An unauthenticated GET returning 401 only proves the function is alive. For a real heartbeat, check the
   daily 05:00 UTC run: Vercel > project > **Settings > Cron Jobs** (last run and status), or later add a
   Healthchecks.io ping at the end of the cron handler.
5. Send alerts to email and a phone push channel, not only email.

## 3. Alerting on client and server errors

Browsers POST crashes to `/api/client-error`, which logs a line starting with `client-error` (kind, path, file, line).

1. Vercel > project > **Logs**. Filter: search `client-error`, then separately Level = **Error**.
2. Watch for the same `file:line` repeating, or a sudden jump after a deploy.
3. Vercel > project > **Settings > Notifications** (or team **Settings > Notifications**): turn on
   Deployment Failed and, if your plan has it, Error Anomaly / Usage alerts.
4. CLI check after a deploy: `npx vercel logs <deployment-url>` (or `npx vercel logs rigzea.com`).
5. Weekly: open **Observability** and look at error rate of `/api/p`, `/api/telegram`, `/api/link-event`.

## 4. Supabase (project `cuioodytwyzykqlrjfej`)

1. **Billing / Usage** (supabase.com/dashboard > project > Settings > Billing): check database size, egress,
   monthly active users and storage against the plan limits. Free plan projects pause after a week of
   inactivity and have small limits, so use at least Pro for real traffic.
2. **Connection pooling**: Project > Connect > copy the *Transaction pooler* string (port 6543) for anything
   that opens direct Postgres connections (scripts, future server code). The app itself uses the REST API
   and supabase-js, which already go through the API gateway.
3. **Backups**: Database > Backups. Daily backups are on for paid plans. Download one before risky changes.
4. **Point-in-time recovery**: Database > Backups > Point in Time (paid add-on). Enable it once there is
   customer data you cannot re-enter.
5. **Advisors**: Database > Advisors (Security and Performance). Fix every ERROR. Re-run after each
   `supabase/patches` change.
6. **Auth**: Authentication > Rate Limits and Providers. Confirm email confirmation and the site URL
   (`https://rigzea.com`) and redirect URLs are correct.
7. **Logs**: Logs > API and Postgres. Look for 429, 500 and slow queries during the first busy day.

## 5. Environment variables

Check with `npx vercel env ls` (names only, never print values). Production must have:

| Name | Needed for |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | all `/api` functions that write |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Telegram bot and webhook |
| `CRON_SECRET` | `/api/cron-reminders` |
| `RESEND_API_KEY` | email (`/api/plan-email`) |
| `KISA_CLIENT_ID`, `KISA_CLIENT_SECRET`, `KISA_WEBHOOK_SECRET` | KISA payments |

Optional: `APP_BASE_URL`, `EMAIL_FROM`, `KISA_API_URL`, `SUPABASE_URL` + `SUPABASE_ANON_KEY` (both or neither).
After changing `TELEGRAM_BOT_TOKEN` or the webhook secret, set the Telegram webhook again (see `CLAUDE.md`).
A changed env var only applies to the next deployment.

## 6. Content-Security-Policy (report-only)

`vercel.json` sends `Content-Security-Policy-Report-Only`. Nothing is blocked yet.

1. Open the live site and the CRM with the browser console open for a few days of normal use.
2. Any `[Report Only] Refused to ...` line means the policy is too strict for that resource. Add the origin.
3. When the console stays clean, rename the header to `Content-Security-Policy` in `vercel.json`.

## 7. Release routine

1. Work on a branch, open a pull request into `main`.
2. Wait for the **CI** check (`.github/workflows/ci.yml`, about 10-15 minutes) to be green. Do not merge red.
3. Merge to `main`, then `git checkout main && git pull`.
4. Deploy from `main` only: `npm run deploy`. Never deploy from a feature branch.
5. Smoke test on https://rigzea.com: landing page, sign in, `/app/`, open one public listing `/p/<slug>/`.
6. Database change? Follow the "Database changes" steps in `CLAUDE.md` first, and update `supabase/APPLIED.md`.
7. Something broke: Vercel > project > **Deployments** > previous good deployment > **Promote to Production**
   (instant rollback). Then fix forward.
