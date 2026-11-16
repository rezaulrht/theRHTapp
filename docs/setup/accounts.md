# Putting the app online

A checklist for the owner. You create each account yourself and paste its keys
into Heroku or Vercel. Keys never go into chat or into git.

Prices and free allowances change. Check each provider's own site before you
rely on a number here.

Do the steps in order. R2 (file storage, step 9) can wait until you want to upload files.

## 1. GitHub

Vercel and Heroku both deploy from a GitHub repository.

1. Create a new **private** repository on GitHub. Do not add a README or
   .gitignore; the project has its own.
2. From the project folder, connect and push:

   ```bash
   git remote add origin <your repository address>
   ```

   ```bash
   git push -u origin main
   ```

   The work so far is on the `foundation` branch. Merge it into `main` first,
   or push that branch and deploy from it.

## 2. Neon (database)

1. Sign up at neon.tech and create a project. Pick the region nearest you
   (Singapore is the closest to Bangladesh).
2. Keep the default database, or name it `personal_apps`.
3. Open **Connection Details** and copy the connection string. Use the
   **direct** connection (not "pooled"). It starts with `postgresql://` and
   ends with `?sslmode=require`.

This is your `DATABASE_URL`. A separate test database is not needed: tests run
against a local PostgreSQL that lives inside the project.

## 3. Resend (email)

1. Sign up at resend.com.
2. Create an API key. This is your `RESEND_API_KEY`.
3. Choose a sender for `EMAIL_FROM`:
   - **Without your own domain:** use `The R.H.T App <onboarding@resend.dev>`.
     Resend only delivers these to the email address you signed up with, which
     is fine for a one-person app as long as that is the address you set for
     reminders.
   - **With your own domain:** add and verify it in Resend, then use an
     address on it, such as `The R.H.T App <reminders@yourdomain.com>`.

## 4. Web push keys

Run this once on your computer, in the project folder:

```bash
pnpm --filter api exec web-push generate-vapid-keys
```

It prints a public key and a private key. These are `VAPID_PUBLIC_KEY` and
`VAPID_PRIVATE_KEY`. Keep them: if they change, every device has to turn
notifications on again.

`VAPID_SUBJECT` is `mailto:` followed by your email address, for example
`mailto:you@example.com`.

## 5. Heroku (back end)

1. Create an app at heroku.com. Pick the Europe or US region.
2. **Resources tab:** change the dyno type to **Basic**. Do not use Eco: Eco
   dynos sleep when idle and your reminders would arrive late.
3. **Settings tab → Buildpacks:** add `heroku/nodejs`.
4. **Settings tab → Config Vars:** add these.

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | From step 2 |
   | `VAPID_PUBLIC_KEY` | From step 4 |
   | `VAPID_PRIVATE_KEY` | From step 4 |
   | `VAPID_SUBJECT` | From step 4 |
   | `RESEND_API_KEY` | From step 3 |
   | `EMAIL_FROM` | From step 3 |
   | `WEB_ORIGIN` | Your Vercel address from step 6, e.g. `https://your-app.vercel.app`. Fill this in after step 6. |

   Do not set `PORT` or `NODE_ENV`; Heroku sets both.
5. **Deploy tab:** connect the GitHub repository and deploy the branch.

   Each deploy builds the back end, then runs the database migrations before
   the new version starts (the `release` line in `Procfile`).
6. Note the app's address, such as `https://your-app-1234.herokuapp.com`.
   Opening `<that address>/api/health` should show `{"status":"ok"}`.

If the build fails with "Missing or invalid environment variables", the
message names the ones still to add.

## 6. Vercel (front end)

1. Sign up at vercel.com and import the GitHub repository.
2. Set **Root Directory** to `apps/web`. Leave the framework as Next.js. The
   build command comes from `apps/web/vercel.json`.
3. Add one environment variable **before the first deploy**:

   | Name | Value |
   |---|---|
   | `API_ORIGIN` | Your Heroku address from step 5, with no slash at the end |

   This is read when the site is built. If you change it later, redeploy.
4. Deploy, and note the address Vercel gives you.
5. Go back to Heroku and set `WEB_ORIGIN` to that address.

Opening `<your Vercel address>/api/health` should show `{"status":"ok"}`. That
proves the front end is reaching the back end.

## 7. Create your account

There is no sign-up page. Create the one account from your computer, pointed at
the production database.

1. In the project folder, make sure the back end is built:

   ```bash
   pnpm --filter api... build
   ```

2. Put your Neon connection string in the `.env` file at the project root as
   `DATABASE_URL=...` (temporarily replacing the local one).
3. Run:

   ```bash
   pnpm --filter api setup:owner
   ```

   It asks for your email and a password of at least 10 characters. Nothing
   you type for the password is shown.
4. Put the local `DATABASE_URL` back in `.env` afterwards, so local work does
   not touch your real data.

To change a forgotten password later, repeat with:

```bash
pnpm --filter api setup:owner --reset-password
```

## 8. Check it on your iPhone

1. Open your Vercel address in **Safari**. A guide to adding the app to your
   home screen appears.
2. Tap Share, then "Add to Home Screen". Open the app from its new icon: it
   should fill the screen with no Safari toolbar.
3. Log in.
4. Go to Settings → General, change the time zone, save, close and reopen the
   app, and confirm the change stayed. Change it back.
5. Go to Settings → Notifications. Enter your email for reminders and save.
   Tap "Turn on notifications on this device" and allow them.
6. Tap "Send test reminder". A notification should appear on the phone and an
   email should arrive. Both should read "Sent" on the page.
7. Lock the phone and send another test reminder from a computer, to confirm
   notifications arrive on the lock screen.

If the notification does not arrive: iOS needs version 16.4 or newer, and the
app must be opened from the home screen icon, not from Safari.

## 9. Cloudflare R2 (Vault files)

Until this is done, the Vault works online for folders, notes and links, and
refuses uploads with "File storage is not set up yet". On your own computer,
files are kept in `.localfiles/` instead, so nothing here is needed to try it.

1. Create a Cloudflare account, open **R2**, and create a bucket, for example
   `personal-vault`. Leave public access **off**: files are only ever reached
   through short-lived signed addresses the back end hands out.
2. Under **R2 → Manage API tokens**, create a token with **Object Read & Write**
   on that bucket only. Note the Access Key ID and Secret Access Key it shows
   once, and your Account ID (shown on the R2 overview page).
3. In the bucket's **Settings → CORS policy**, allow your front end to send and
   fetch files directly:

   ```json
   [
     {
       "AllowedOrigins": ["https://YOUR-APP.vercel.app"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Use the exact address of your Vercel site, with no slash at the end.
4. In Heroku, add the four config vars below (`R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`). The app restarts
   and uploads start working.

The free allowance is 10 GB of storage; Settings → Vault shows how much is used.

## Every variable in one place

| Variable | Where | What it is |
|---|---|---|
| `DATABASE_URL` | Heroku, local `.env` | PostgreSQL connection string |
| `VAPID_PUBLIC_KEY` | Heroku | Web push public key |
| `VAPID_PRIVATE_KEY` | Heroku | Web push private key |
| `VAPID_SUBJECT` | Heroku | `mailto:` address for push services |
| `RESEND_API_KEY` | Heroku | Resend API key |
| `EMAIL_FROM` | Heroku | Sender shown on reminder emails |
| `WEB_ORIGIN` | Heroku | Public address of the front end, for links in emails |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Heroku | Cloudflare R2 bucket for Vault files |
| `API_ORIGIN` | Vercel | Address of the back end |
| `PORT` | Local only | Back end port, 4000 by default |
| `DEV_OWNER_EMAIL`, `DEV_OWNER_PASSWORD` | Local only | Account for local development |
| `LOCAL_FILES_DIR` | Local only | Where Vault files are kept without R2, `.localfiles` by default |

## When the Heroku credit ends

The back end does not depend on Heroku. Any host that runs Node and keeps the
process awake will do. On a free host that sleeps when idle, add a free
outside timer service that requests `<back end address>/api/health` every few
minutes, so reminders keep firing on time.
