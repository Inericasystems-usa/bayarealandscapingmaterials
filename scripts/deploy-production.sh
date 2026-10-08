#!/usr/bin/env bash
# Production deploy for BALM on Host A. Builds a release next to the live tree,
# switches PM2 to it, checks it and goes back to the previous release when the
# checks fail. Dry run by default: prints each step and changes nothing.
# Read deploy/DEPLOY.md first.
#
#   scripts/deploy-production.sh [--source DIR] [--build-only] [--apply]   build (and switch)
#   scripts/deploy-production.sh --switch RELEASE_DIR [--apply]            switch to a built release
#   scripts/deploy-production.sh --rollback [--apply]                      back to the previous release
#
# Other options: --root DIR (default /var/www/bayarealandscapingmaterials.com),
# --keep N releases (default 3), --allow-root.
#
# Layout: ROOT-releases/<UTC stamp>/ per build, ROOT-releases/current and
# previous links, ROOT-shared/web.env and api.env (the owner's values, mode 600)
# linked into each release as apps/web/.env.production.local and apps/api/.env.
set -euo pipefail

ROOT=/var/www/bayarealandscapingmaterials.com
SOURCE=$(cd "$(dirname "$0")/.." && pwd)
APPLY=0
BUILD_ONLY=0
ROLLBACK=0
SWITCH_TO=""
KEEP=3
ALLOW_ROOT=0
APPS=(balm-web balm-api)
MIN_MEM_MB=2600 # next build peaks at about 2.1 GB

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case $1 in
    --apply) APPLY=1 ;;
    --source) SOURCE=${2:?--source needs a directory}; shift ;;
    --root) ROOT=${2:?--root needs a directory}; shift ;;
    --build-only) BUILD_ONLY=1 ;;
    --switch) SWITCH_TO=${2:?--switch needs a release directory}; shift ;;
    --rollback) ROLLBACK=1 ;;
    --keep) KEEP=${2:?--keep needs a number}; shift ;;
    --allow-root) ALLOW_ROOT=1 ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done

ROOT=${ROOT%/}
RELEASES="$ROOT-releases"
SHARED="$ROOT-shared"

say() { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
# Stops an --apply run; a dry run reports it and goes on, so it lists everything.
problem() { if [ "$APPLY" -eq 1 ]; then die "$*"; else warn "$*"; fi; }

# Prints a command that changes something; runs it only with --apply.
run() {
  if [ "$APPLY" -eq 1 ]; then
    printf '+ %s\n' "$*"
    "$@"
  else
    printf '[dry run] %s\n' "$*"
  fi
}

preflight() {
  if [ "$(id -u)" -eq 0 ] && [ "$ALLOW_ROOT" -ne 1 ]; then
    die "run this as the user that owns $ROOT and runs PM2, not root (or pass --allow-root)"
  fi
  local cmd major minor
  for cmd in node corepack tar curl ss; do
    command -v "$cmd" >/dev/null || die "$cmd is not installed"
  done
  if [ "$BUILD_ONLY" -ne 1 ]; then
    command -v pm2 >/dev/null || die "pm2 is not installed (npm install -g pm2)"
  fi
  IFS=. read -r major minor _ <<<"$(node -p 'process.versions.node')"
  if [ "$major" -lt 20 ] || { [ "$major" -eq 20 ] && [ "$minor" -lt 12 ]; }; then
    die "Node $(node -v) is too old: install Node 22 or 24 LTS"
  fi
  [ "$major" -ge 22 ] || warn "Node $(node -v) is end-of-life: move to Node 22 or 24 LTS and rebuild"
}

# Variable names only: values never reach the terminal or a log.
env_names() { grep -oE '^[A-Z][A-Z0-9_]*=' "$1" | tr -d '=' || true; }

check_env_files() {
  local f names n
  for f in "$SHARED/web.env" "$SHARED/api.env"; do
    if [ ! -f "$f" ]; then
      problem "$f is missing (names: deploy/production.env.example)"
      continue
    fi
    case $(stat -c %a "$f") in
      *00) ;;
      *) warn "$f can be read by other users: chmod 600 $f" ;;
    esac
  done
  if [ -f "$SHARED/api.env" ]; then
    grep -qx MONGODB_URL <<<"$(env_names "$SHARED/api.env")" ||
      problem "MONGODB_URL is not in $SHARED/api.env: the API would use an empty local database"
    # The API refuses to start without a key of 32+ characters. Only the length
    # is looked at; the value is never printed.
    local key_len
    key_len=$(sed -n 's/^DATA_ENCRYPTION_KEY=//p' "$SHARED/api.env" | tail -n 1 | tr -d "\"' \r" | wc -c)
    [ "$key_len" -gt 32 ] ||
      problem "DATA_ENCRYPTION_KEY is missing or shorter than 32 characters in $SHARED/api.env: the API would refuse to start (deploy/DEPLOY.md, section 9)"
    if grep -Eq '^MONGODB_ALLOW_STANDALONE=.?true' "$SHARED/api.env"; then
      warn "MONGODB_ALLOW_STANDALONE=true in $SHARED/api.env: writes are not atomic; run MongoDB as a replica set and delete the line (deploy/DEPLOY.md, section 9)"
    fi
    # A flag, not a secret. The API refuses to start with it (INERICA_PRODUCTION in
    # ecosystem.config.cjs), so stop before the switch rather than fail it.
    if grep -Eq '^ALLOW_PIN_LOGIN=.?true' "$SHARED/api.env"; then
      problem "ALLOW_PIN_LOGIN=true in $SHARED/api.env: PIN sign-in is for counter PCs, never this server; delete the line"
    fi
  fi
  [ -f "$SHARED/web.env" ] || return 0
  names=$(env_names "$SHARED/web.env")
  grep -qx NEXT_PUBLIC_API_URL <<<"$names" ||
    problem "NEXT_PUBLIC_API_URL is not in $SHARED/web.env: lead forms would post to port 4000"
  for n in NEXT_PUBLIC_GTM_ID NEXT_PUBLIC_GOOGLE_MAPS_KEY; do
    grep -qx "$n" <<<"$names" || warn "$n is not in $SHARED/web.env: that feature stays off in this build"
  done
  if grep -qx NEXT_PUBLIC_BRIDGE_TOKEN <<<"$names"; then
    warn "NEXT_PUBLIC_BRIDGE_TOKEN in $SHARED/web.env is no longer used: delete it and rotate the bridge token"
  fi
}

check_memory() {
  local avail_mb
  avail_mb=$(($(awk '/^MemAvailable:/ {print $2}' /proc/meminfo) / 1024))
  if [ "$avail_mb" -lt "$MIN_MEM_MB" ]; then
    problem "only $avail_mb MB of memory is available and the build needs about $MIN_MEM_MB MB: stop the dev server first or add swap (deploy/DEPLOY.md)"
  else
    say "memory available: $avail_mb MB"
  fi
}

copy_source() {
  local release=$1
  [ -f "$SOURCE/ecosystem.config.cjs" ] || die "$SOURCE is not a BALM checkout (no ecosystem.config.cjs)"
  run mkdir -p "$release"
  # Code only: no git data, dependencies, build output or env files.
  if [ "$APPLY" -eq 1 ]; then
    say "+ copy $SOURCE -> $release"
    tar -C "$SOURCE" --exclude=.git --exclude=node_modules --exclude=.next --exclude=.turbo \
      --exclude=dist --exclude=.env --exclude='.env.*' -cf - . | tar -C "$release" -xf -
  else
    say "[dry run] copy $SOURCE -> $release (without .git, node_modules, .next, .turbo, dist, .env*)"
  fi
  run ln -s "$SHARED/web.env" "$release/apps/web/.env.production.local"
  run ln -s "$SHARED/api.env" "$release/apps/api/.env"
}

build_release() {
  local release=$1 pnpm
  pnpm=$(node -p 'require(process.argv[1]).packageManager' "$SOURCE/package.json")
  # devDependencies are needed to build, so NODE_ENV must not be production here.
  run env -C "$release" -u NODE_ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 MONGOMS_DISABLE_POSTINSTALL=1 \
    corepack "$pnpm" install --frozen-lockfile
  run env -C "$release" NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    corepack "$pnpm" --filter @balm/web build
  run env -C "$release" -u NODE_ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    corepack "$pnpm" --filter @balm/api typecheck
}

check_build() {
  local next="$1/apps/web/.next"
  if [ "$APPLY" -ne 1 ]; then
    say "[dry run] check $next/BUILD_ID, and no jsxDEV or source maps under $next/static"
    return 0
  fi
  [ -s "$next/BUILD_ID" ] || die "no $next/BUILD_ID: the build did not finish"
  [ "$(cat "$next/BUILD_ID")" != development ] || die "$next is a development build"
  if grep -rlq jsxDEV "$next/static"; then die "development code (jsxDEV) in $next/static"; fi
  if [ -n "$(find "$next/static" -name '*.map' -print -quit)" ]; then die "source maps in $next/static"; fi
  say "build ok: BUILD_ID $(cat "$next/BUILD_ID")"
}

port_free() { [ -z "$(ss -Hltn "sport = :$1")" ]; }

pm2_running() {
  local pid
  pid=$(pm2 pid "$1" 2>/dev/null | tail -n 1)
  [[ $pid =~ ^[1-9][0-9]*$ ]]
}

stop_apps() {
  local app
  for app in "${APPS[@]}"; do
    run pm2 delete "$app" || true
  done
}

# Both servers answer, the API reports production, and the home page is not a
# dev server's (jsxDEV appears on every page next dev renders).
healthy() {
  local body
  body=$(curl -fsS --max-time 5 http://127.0.0.1:4000/health) || return 1
  case $body in *'"env":'*) [[ $body == *'"env":"production"'* ]] || return 1 ;; esac
  body=$(curl -fsS --max-time 15 http://127.0.0.1:3000/) || return 1
  [[ $body != *jsxDEV* ]]
}

wait_healthy() {
  local _
  for _ in $(seq 1 45); do
    if healthy; then return 0; fi
    sleep 2
  done
  return 1
}

# PM2 runs whatever release it was started from; `current` and `previous` record it.
switch_to() {
  local release=$1 prev
  if [ -d "$release" ]; then
    release=$(cd "$release" && pwd -P)
    [ -s "$release/apps/web/.next/BUILD_ID" ] || problem "$release has no build (apps/web/.next/BUILD_ID)"
  else
    [ "$APPLY" -ne 1 ] || die "$release does not exist"
  fi
  prev=$(readlink -e "$RELEASES/current" || true)
  [ "$prev" != "$release" ] || prev=$(readlink -e "$RELEASES/previous" || true)
  if [ "$APPLY" -ne 1 ]; then
    say "[dry run] pm2 delete ${APPS[*]}; pm2 start $release/ecosystem.config.cjs"
    say "[dry run] wait for http://127.0.0.1:3000/ and http://127.0.0.1:4000/health, then pm2 save"
    say "[dry run] on failure go back to: ${prev:-nothing (first switch)}"
    return 0
  fi
  pm2_running balm-web || port_free 3000 ||
    die "port 3000 is held by a process PM2 does not manage (the dev server?): stop it first (deploy/DEPLOY.md)"
  pm2_running balm-api || port_free 4000 ||
    die "port 4000 is held by a process PM2 does not manage (the dev API?): stop it first (deploy/DEPLOY.md)"

  stop_apps
  if run pm2 start "$release/ecosystem.config.cjs" && wait_healthy; then
    run pm2 save
    run ln -sfn "$release" "$RELEASES/current"
    if [ -n "$prev" ]; then run ln -sfn "$prev" "$RELEASES/previous"; fi
    say "live: $release"
    return 0
  fi

  warn "$release did not start or failed the health checks; 'pm2 logs balm-web' and 'pm2 logs balm-api' show why"
  stop_apps
  if [ -n "$prev" ]; then
    if run pm2 start "$prev/ecosystem.config.cjs" && wait_healthy; then say "back on $prev"; else warn "$prev is not healthy either"; fi
    run pm2 save
  else
    warn "no earlier release to go back to: start the old server again (deploy/DEPLOY.md, Rollback)"
  fi
  exit 1
}

rollback() {
  local prev
  prev=$(readlink -e "$RELEASES/previous" || true)
  if [ -z "$prev" ]; then die "no previous release recorded in $RELEASES/previous"; fi
  switch_to "$prev"
}

prune() {
  local dir cur prev old
  [ -d "$RELEASES" ] || return 0
  dir=$(cd "$RELEASES" && pwd -P)
  cur=$(readlink -e "$RELEASES/current" || true)
  prev=$(readlink -e "$RELEASES/previous" || true)
  while IFS= read -r old; do
    if [ "$old" = "$cur" ] || [ "$old" = "$prev" ]; then continue; fi
    run rm -rf -- "$old"
  done < <(find "$dir" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]' |
    sort -r | tail -n +"$((KEEP + 1))")
}

main() {
  [ "$APPLY" -eq 1 ] || say "Dry run: nothing is changed. Add --apply to do it."
  preflight
  if [ "$APPLY" -eq 1 ]; then
    mkdir -p "$RELEASES"
    exec 9>"$RELEASES/.deploy.lock"
    flock -n 9 || die "another deploy is running"
  fi

  # The apps read the shared env files at every start, so a switch checks them too.
  if [ "$ROLLBACK" -eq 1 ]; then
    check_env_files
    rollback
    return
  fi
  if [ -n "$SWITCH_TO" ]; then
    check_env_files
    switch_to "$SWITCH_TO"
    return
  fi

  local release
  release="$RELEASES/$(date -u +%Y%m%d-%H%M%S)"
  check_env_files
  check_memory
  copy_source "$release"
  build_release "$release"
  check_build "$release"
  if [ "$BUILD_ONLY" -eq 1 ]; then
    say "built: $release (PM2 untouched). Switch with: scripts/deploy-production.sh --switch $release --apply"
    return
  fi
  switch_to "$release"
  prune
}

main
