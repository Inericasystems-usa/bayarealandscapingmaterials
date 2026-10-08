# BALM production deploy (Host A)

The live site was served by the Next.js development server (`next dev`) and the
API by `tsx watch`. Dev mode put server paths and source code into every page,
which is why the PCI ASV scans failed (Full Path Disclosure, `/src/`), and it
turned off the API's production protections. This guide moves Host A
(187.127.252.156) to production servers once, in a way that keeps the current
site running until the new one is ready, and then covers routine deploys.

Run everything as the user that owns `/var/www/bayarealandscapingmaterials.com`
(`stat -c %U /var/www/bayarealandscapingmaterials.com`), not root, unless a
step says `sudo`. Commands never print secret values; checks look at variable
names only.

## What runs where

- **nginx** is the only public listener (80/443), from
  `deploy/nginx/bayarealandscapingmaterials.com.conf`. The canonical address is
  `https://bayarealandscapingmaterials.com`; `www` and plain http answer with a
  301 to it. Staff use `https://bayarealandscapingmaterials.com/pos`.
- **PM2** runs `ecosystem.config.cjs`:
  - `balm-web`: `next start -H 127.0.0.1 -p 3000`, `NODE_ENV=production`
  - `balm-api`: `node --import tsx src/server.ts` on `127.0.0.1:4000`,
    `NODE_ENV=production`, customer-display socket off, no demo seeding
- **Directories**
  - `/var/www/bayarealandscapingmaterials.com`: today's tree, where the dev
    server runs. Leave it alone during the switch; afterwards nothing is served
    from it.
  - `/var/www/bayarealandscapingmaterials.com-releases/<UTC stamp>/`: one
    installed and built copy per deploy, plus `current` and `previous` links.
    Building in a new directory means the running server's `.next` is never
    overwritten.
  - `/var/www/bayarealandscapingmaterials.com-shared/web.env` and `api.env`:
    the production values (mode 600). Each release links them as
    `apps/web/.env.production.local` and `apps/api/.env`.

`scripts/deploy-production.sh` does the release work. It is a dry run unless
you add `--apply`.

## 0. Look first (read-only)

```bash
node -v                      # v22 or v24; Node 20 is end-of-life (April 2026)
command -v pm2 corepack      # if pm2 is missing: npm install -g pm2
free -m; nproc; df -h /var/www
```

`next build` peaks at about 2.1 GB of memory and a release takes about 2 GB of
disk. Find what serves the site today; you need it to stop it later:

```bash
sudo ss -ltnp | grep -E ':(3000|3001|4000) '
ps -eo pid,user,lstart,args | grep -E 'next dev|next-server|tsx watch|turbo run dev|pnpm( run)? dev' | grep -v grep
pm2 ls; systemctl list-units --type=service --all | grep -iE 'balm|next|node|pnpm'
crontab -l; tmux ls; screen -ls
```

Which settings exist today, by name:

```bash
cd /var/www/bayarealandscapingmaterials.com
grep -o '^[A-Z0-9_]*=' apps/web/.env* apps/api/.env* 2>/dev/null
```

## 1. Today: demo accounts, sessions and logs

The dev build showed the demo admin sign-in on `/pos`, and the API seeded demo
staff. Check the production database now:

```bash
cd /var/www/bayarealandscapingmaterials.com/apps/api
# The URL holds the database password: pass it in the environment, because
# anything on a command line shows in `ps` for every user on the host.
export BALM_DB=$(sed -n 's/^MONGODB_URL=//p' .env)
mongosh --nodb --quiet --eval 'db = connect(process.env.BALM_DB);
  printjson(db.users.find({email:/@balm[.]local$/},{_id:0,email:1,role:1,active:1}).toArray())'
```

If any row is active:

1. If you sign in as `admin@balm.local` (the old default admin), first add an
   admin with your own e-mail in POS > Employees and sign in as that one.
   Deactivating the account you are signed in with locks you out of the POS.
2. POS > Employees: deactivate every `@balm.local` account.
3. Give the admin a new password (12+ characters, letters and digits) and a new PIN.
4. End every session (everyone signs in again):
   `mongosh --nodb --quiet --eval 'printjson(connect(process.env.BALM_DB).sessions.deleteMany({}))'`
5. Read the latest 200 entries of the audit trail:
   `mongosh --nodb --quiet --eval 'printjson(connect(process.env.BALM_DB).audit.find().sort({at:-1}).limit(200).toArray())'`

In a new shell, run the `cd` and `export` lines above again first; `unset
BALM_DB` when you are done.

In `api.env` (step 2.3): `SEED_DEMO=false`, and no `ADMIN_PASSWORD`/`ADMIN_PIN`
once the admin exists.

The dev API also wrote session cookies and bearer tokens into its logs. After
the switch (step 2.5):

```bash
mongosh --nodb --quiet --eval 'printjson(connect(process.env.BALM_DB).sessions.deleteMany({}))'   # every logged token is now useless
pm2 flush <old dev process name>                                   # if the dev server ran under PM2
rm -f ~/.pm2/logs/<old dev process name>-*.log*
ls /var/www/bayarealandscapingmaterials.com/nohup.out 2>/dev/null   # delete it if the dev server ran under nohup
```

If it ran as a systemd unit, its output is in the journal; the session purge
above makes those tokens worthless. Keep the rest of the journal (PCI DSS
10.5.1 asks for 12 months of logs).

## 2. One-time switch to production

### 2.1 Snapshot

hPanel > VPS > Snapshots: take one. It is the last-resort undo.

### 2.2 Bring the new code over, next to the live tree

On your PC, in the BALM repository, after the changes are committed:

```bash
pnpm handover:pack                                   # secrets check + git archive -> balm-handover.tar.gz
scp balm-handover.tar.gz <user>@187.127.252.156:/tmp/
```

On the server:

```bash
rm -rf ~/balm-incoming && mkdir ~/balm-incoming
tar -xzf /tmp/balm-handover.tar.gz -C ~/balm-incoming && rm /tmp/balm-handover.tar.gz
```

### 2.3 Production values

```bash
install -d -m 700 /var/www/bayarealandscapingmaterials.com-shared
cd /var/www/bayarealandscapingmaterials.com-shared
install -m 600 /var/www/bayarealandscapingmaterials.com/apps/api/.env api.env   # the API's current values
install -m 600 /dev/null web.env
```

Fill in `web.env` with the names in `deploy/production.env.example`. The
production build reads `.env.production.local` (this link), `.env.local`,
`.env.production` and `.env`. It does **not** read `.env.development` or
`.env.development.local`, the files `next dev` uses, so values kept only there
disappear from the production site. Copy them from wherever step 0 found them.
Every `NEXT_PUBLIC_*` value is compiled into the public pages, so none of them
may be a secret:

| Name | Value / what it does |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://bayarealandscapingmaterials.com`. Without it products and lead forms call port 4000, which is closed. Required. |
| `NEXT_PUBLIC_GTM_ID` | `GTM-5MXCJBSJ`. Without it no Google tags load. |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | browser Maps key (address autocomplete, store locator); restrict it to the site's referrers in Google Cloud |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | optional map style |
| `NEXT_PUBLIC_MAP_TILE_URL` | optional fleet-map tiles (OpenStreetMap when unset) |
| `NEXT_PUBLIC_BRIDGE_URL` | leave unset (`http://localhost:9110`, the counter-PC bridge) |
| `NEXT_PUBLIC_POS_EDITION` | leave unset (owned edition) |
| `GOOGLE_MAPS_SERVER_KEY` | server-only Routes key (driving distances) |
| `API_INTERNAL_URL` | `http://127.0.0.1:4000` (the API listens on IPv4 loopback only) |

Never set `NEXT_PUBLIC_BRIDGE_TOKEN`: counter PCs pair with their bridge
instead (section 4).

In `api.env`:

- Delete any `NODE_ENV`, `PORT`, `HOST` and `COOKIE_SECURE` lines (PM2 sets the
  first three; cookies are Secure outside development). Delete `CORS_ORIGINS`
  too unless it lists another real site: the two BALM origins are built in, and
  `http://localhost:3000` has no place on the server.
- Set `SEED_DEMO=false` (PM2 sets it as well) and delete any `DEMO_PASSWORD`
  and `ALLOW_PIN_LOGIN` lines. With `ALLOW_PIN_LOGIN=true` the API refuses to
  start, and the deploy script stops before the switch.
- Make sure `MONGODB_URL`, `DATA_ENCRYPTION_KEY` and, if inbound SMS is used,
  `RC_WEBHOOK_TOKEN` are there. A new `DATA_ENCRYPTION_KEY`
  (`openssl rand -hex 32`) encrypts customer fields from then on, and existing
  plaintext rows keep working. Keep a copy of it somewhere safe, because
  encrypted data cannot be read without it.

### 2.4 Build the release (the site stays up)

```bash
free -m      # "available" should be 2600 MB or more
bash ~/balm-incoming/scripts/deploy-production.sh --source ~/balm-incoming --build-only           # read the plan
bash ~/balm-incoming/scripts/deploy-production.sh --source ~/balm-incoming --build-only --apply   # takes a few minutes
```

It installs with pnpm 9.12.0 (`--frozen-lockfile`, devDependencies included,
because the build needs them), builds the web app, type-checks the API, and
refuses a build that contains dev code. It prints the release directory.

Short on memory? Either stop the dev server first (the site is down until 2.5
finishes, about 5 minutes), or add swap for the build:
`sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
(afterwards: `sudo swapoff /swapfile && sudo rm /swapfile`). If a build is
killed for lack of memory, never fall back to `next dev`.

### 2.5 Switch (about a minute of downtime)

1. Stop the dev server and the dev API with the tool that started them
   (step 0): `pm2 delete <name>`, or `sudo systemctl disable --now <unit>`, or
   `kill <pid>` plus removing the `@reboot` crontab line or tmux session.
   Then `ss -ltn | grep -E ':(3000|4000) '` must print nothing.
2. Start the release:
   `bash ~/balm-incoming/scripts/deploy-production.sh --switch /var/www/bayarealandscapingmaterials.com-releases/<stamp> --apply`.
   It runs `pm2 start <release>/ecosystem.config.cjs`, waits until
   `127.0.0.1:3000` serves a production page and `127.0.0.1:4000/health`
   reports production, then runs `pm2 save` and sets `current`. If the checks
   fail it stops the new apps; see Rollback.
3. Once: `pm2 startup` and run the `sudo` command it prints, then `pm2 save`,
   so the production apps (and not the dev server) come back after a reboot.
4. Do the end of section 1 (sessions, old logs), then the checks in section 5.

## 3. nginx

Needs the host kit's `infra/pci/host/30-nginx.sh` first (the two snippets,
`server_tokens off`, TLS 1.2+, the default server for the bare IP).

```bash
ls /etc/nginx/sites-enabled/                        # find the live BALM file
sudo cp /etc/nginx/sites-available/<live file> /root/<live file>.bak
sudo certbot certificates                           # the certificate directory for both names
diff -u /etc/nginx/sites-available/<live file> ~/balm-incoming/deploy/nginx/bayarealandscapingmaterials.com.conf
```

Install the reference file over the live one, keeping the certificate paths
certbot shows (and dropping the `[::]` listen lines if the host has no IPv6):

```bash
sudo cp ~/balm-incoming/deploy/nginx/bayarealandscapingmaterials.com.conf /etc/nginx/sites-available/<live file>
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run   # renewals still work with the new file
```

What it does: http and `www` 301 to the apex; HSTS, nosniff and
Referrer-Policy once per response; `X-Powered-By` and `x-nextjs-*` removed;
dev-server paths, `/src/` and other source folders answer 404; `/api/v1/` goes
to the API with a 12 MB body limit (photo uploads); `/api/maps/distance` is
limited to 10 requests a minute per client; `X-Forwarded-For` is overwritten
with the real client address. In the ASV portal, add
`https://bayarealandscapingmaterials.com/` as a target; `www` now only
redirects.

## 4. Counter PCs (hardware bridge)

On each counter PC, follow `apps/bridge/README.md`: update the bridge files,
`pnpm run pair`, put `TERMINAL_PROVIDER` and the Elavon/Datacap values in
`apps/bridge/.env`, `pnpm start`, then open the printed link once in the
browser the register uses (signed in to the POS on the apex address). The
bridge refuses to start without its token and only answers the POS origin.

## 5. Checks

From any computer:

```bash
curl -s https://bayarealandscapingmaterials.com/ | grep -c jsxDEV          # 0 (49 under next dev)
curl -s https://bayarealandscapingmaterials.com/ | grep -c /var/www        # 0
curl -s https://bayarealandscapingmaterials.com/ | grep -c GTM-5MXCJBSJ    # 1 or more; 0 = web.env was not read at build
curl -sI https://bayarealandscapingmaterials.com/ | grep -iE '^(server|cache-control|content-security-policy|strict-transport-security|x-powered-by):'
#   Server: nginx (no version), Cache-Control not no-store, no 'unsafe-eval', one HSTS line, no X-Powered-By
curl -s -o /dev/null -w '%{http_code}\n' https://bayarealandscapingmaterials.com/_next/static/chunks/main-app.js   # 404
curl -s -o /dev/null -w '%{http_code}\n' https://bayarealandscapingmaterials.com/_next/webpack-hmr                 # 404
curl -s -o /dev/null -w '%{http_code}\n' https://bayarealandscapingmaterials.com/src/                              # 404
curl -sI https://www.bayarealandscapingmaterials.com/contact | grep -iE '^(HTTP|location)'   # 301, https://bayarealandscapingmaterials.com/contact
curl -sI http://bayarealandscapingmaterials.com/ | grep -iE '^(HTTP|location)'               # 301, https://bayarealandscapingmaterials.com/
curl -s -D - -o /dev/null -H 'Origin: http://10.20.30.40:8080' https://bayarealandscapingmaterials.com/api/v1 | grep -ci '^access-control-allow-origin'   # 0
```

On the server:

```bash
curl -s http://127.0.0.1:4000/health            # "env":"production"
sudo ss -ltnp | grep -E ':(3000|3001|4000) '     # only 127.0.0.1:3000 and 127.0.0.1:4000, nothing on 3001
pm2 ls                                           # balm-web and balm-api online, no dev process
```

Then sign in to `/pos` on the apex, send a test quote from the apex site and
find it in POS > Leads.

## 6. Mark the host as production (last)

From the Inerica Systems repository (a copy on the server), once sections 2-5
are done and the checks pass:

```bash
sudo bash infra/pci/host/60-production-mode.sh                     # read-only: must list no dev server
sudo bash infra/pci/host/60-production-mode.sh --mark-production   # writes /etc/inerica/production
```

From then on `pnpm dev` and `next dev` refuse to start on this host, and the
API refuses any `NODE_ENV` other than production. Then request the ASV rescan.

## 7. Rollback

- **A routine deploy went wrong:** the script already returns to the previous
  release when its checks fail. To go back by hand:
  `bash /var/www/bayarealandscapingmaterials.com-releases/current/scripts/deploy-production.sh --rollback --apply`.
- **The one-time switch failed** (there is no earlier release yet):
  `pm2 delete balm-web; pm2 delete balm-api`, then start the old dev server the
  way step 0 found it. The site is back as it was this morning, still failing
  the scan; read `pm2 logs balm-web --lines 100` and `pm2 logs balm-api --lines 100`,
  fix the cause (usually a value missing from `web.env`/`api.env`, memory, or
  the Node version) and switch again.
- **nginx:** `sudo cp /root/<live file>.bak /etc/nginx/sites-available/<live file> && sudo nginx -t && sudo systemctl reload nginx`.
- **Anything else:** restore the hPanel snapshot.

## 8. Routine deploys

```bash
# on your PC, after committing
pnpm handover:pack && scp balm-handover.tar.gz <user>@187.127.252.156:/tmp/
# on the server
rm -rf ~/balm-incoming && mkdir ~/balm-incoming && tar -xzf /tmp/balm-handover.tar.gz -C ~/balm-incoming
bash ~/balm-incoming/scripts/deploy-production.sh --source ~/balm-incoming           # dry run
bash ~/balm-incoming/scripts/deploy-production.sh --source ~/balm-incoming --apply   # build, switch, check
```

The script keeps the last three releases (`--keep N`). A changed
`NEXT_PUBLIC_*` value needs a new deploy, because it is compiled into the
pages; other `web.env` values need `pm2 restart balm-web`, and `api.env`
changes need `pm2 restart balm-api`. PM2 remembers the Node binary it started
the apps with: after upgrading Node, run a deploy (or
`--switch /var/www/bayarealandscapingmaterials.com-releases/current --apply`)
so the apps move to the new one.

Logs: `pm2 logs balm-web`, `pm2 logs balm-api` (files in `~/.pm2/logs/`). Add
rotation once with `pm2 install pm2-logrotate`.
