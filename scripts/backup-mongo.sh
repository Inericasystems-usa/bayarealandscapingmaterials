#!/usr/bin/env bash
# Nightly backup of the BALM MongoDB database: mongodump to a timestamped,
# gzip-compressed archive, kept 30 days on this server and, when BACKUP_REMOTE
# names an rclone remote, copied off the host as well. One log line per run.
# Read deploy/DEPLOY.md (Backups) first.
#
#   scripts/backup-mongo.sh [--env-file FILE] [--dir DIR] [--keep-days N] [--timeout DURATION]
#
# Defaults: --env-file /var/www/bayarealandscapingmaterials.com-shared/api.env,
# --dir /var/backups/balm-mongo, --keep-days 30, --timeout 2h (a dump still
# running then is stopped and the run fails). BACKUP_REMOTE (environment or
# the env file), e.g. "b2:balm-backups/mongo", turns on the off-host copy.
#
# The connection string is read from MONGODB_URL in the env file and handed to
# mongodump in a mode-600 config file that is deleted on exit, never on a
# command line (anything there shows in `ps` for every user on the host).
set -euo pipefail
umask 077

ENV_FILE=/var/www/bayarealandscapingmaterials.com-shared/api.env
DIR=/var/backups/balm-mongo
KEEP_DAYS=30
TIMEOUT=2h

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case $1 in
    --env-file) ENV_FILE=${2:?--env-file needs a file}; shift ;;
    --dir) DIR=${2:?--dir needs a directory}; shift ;;
    --keep-days) KEEP_DAYS=${2:?--keep-days needs a number}; shift ;;
    --timeout) TIMEOUT=${2:?--timeout needs a duration such as 2h}; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="$DIR/backup.log"
TMP=""
DONE=0

# One line per run, to stdout (cron mails it) and to $LOG.
log() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) backup-mongo: $*"
  printf '%s\n' "$line"
  if [ -d "$DIR" ]; then printf '%s\n' "$line" >>"$LOG" || true; fi
}
die() {
  log "FAILED: $*"
  DONE=1
  exit 1
}
cleanup() {
  local status=$?
  if [ -n "$TMP" ]; then rm -rf -- "$TMP"; fi
  if [ "$status" -ne 0 ] && [ "$DONE" -eq 0 ]; then log "FAILED: exit status $status"; fi
}
trap cleanup EXIT

# A value from the env file, without running the file: the last NAME= line,
# surrounding quotes removed.
env_value() {
  local v
  v=$(sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1)
  v=${v%$'\r'}
  case $v in
    \"*\") v=${v#\"}; v=${v%\"} ;;
    \'*\') v=${v#\'}; v=${v%\'} ;;
  esac
  printf '%s' "$v"
}

# The database named in a connection string's path ("" when there is none).
url_db() {
  local rest=${1#*://}
  rest=${rest%%\?*}
  case $rest in
    */*) printf '%s' "${rest#*/}" ;;
  esac
}

[[ $KEEP_DAYS =~ ^[1-9][0-9]*$ ]] || die "--keep-days must be a whole number of days"
mkdir -p "$DIR" || die "cannot create $DIR"
chmod 700 "$DIR" || die "cannot restrict $DIR to its owner"
exec 9>"$DIR/.backup.lock"
flock -n 9 || die "another backup is running"

for cmd in mongodump mongosh gzip find timeout; do
  command -v "$cmd" >/dev/null || die "$cmd is not installed (mongodump: mongodb-database-tools; mongosh: the MongoDB shell)"
done
[ -r "$ENV_FILE" ] || die "$ENV_FILE is missing or unreadable"
URI=$(env_value MONGODB_URL)
[ -n "$URI" ] || die "MONGODB_URL is not set in $ENV_FILE"
DB=$(url_db "$URI")
db_args=()
# Without a database in the URL the API uses "test" (the driver's default);
# name it, or mongodump would take every database.
if [ -z "$DB" ]; then DB="test"; db_args=(--db=test); fi
REMOTE=${BACKUP_REMOTE:-$(env_value BACKUP_REMOTE)}

TMP=$(mktemp -d)
CONFIG="$TMP/mongodump.yaml"
# YAML double-quoted string: backslashes and quotes escaped.
esc=${URI//\\/\\\\}
esc=${esc//\"/\\\"}
printf 'uri: "%s"\n' "$esc" >"$CONFIG"
chmod 600 "$CONFIG"

# mongodump waits for ever on a server it can't reach, so check first. The
# shell gets the URL from its environment, not its command line.
BALM_BACKUP_URI="$URI" timeout 60 mongosh --nodb --quiet --eval '
  const c = connect(process.env.BALM_BACKUP_URI + (process.env.BALM_BACKUP_URI.includes("?") ? "&" : "?") + "serverSelectionTimeoutMS=15000");
  c.runCommand({ ping: 1 });' >/dev/null 2>&1 ||
  die "MongoDB did not answer (MONGODB_URL in $ENV_FILE)"

ARCHIVE="$DIR/balm-$DB-$STAMP.archive.gz"
PARTIAL="$ARCHIVE.partial"
if ! timeout --kill-after=60 "$TIMEOUT" mongodump --config="$CONFIG" "${db_args[@]}" --archive="$PARTIAL" --gzip --quiet; then
  rm -f -- "$PARTIAL"
  die "mongodump of $DB failed or ran past $TIMEOUT"
fi
gzip -t "$PARTIAL" || { rm -f -- "$PARTIAL"; die "the archive for $DB is not a valid gzip file"; }
mv -- "$PARTIAL" "$ARCHIVE"
SIZE=$(wc -c <"$ARCHIVE" | tr -d ' ')

# Local retention: archives older than KEEP_DAYS go (minutes, so a run a little
# late or early never keeps 31 or 29 days).
PRUNED=$(find "$DIR" -maxdepth 1 -type f -name 'balm-*.archive.gz' -mmin +$((KEEP_DAYS * 1440)) -print -delete | wc -l | tr -d ' ')
find "$DIR" -maxdepth 1 -type f -name 'balm-*.archive.gz.partial' -mmin +1440 -delete

OFFHOST="skipped"
if [ -z "$REMOTE" ]; then
  printf 'WARNING: BACKUP_REMOTE is not set: this backup stays on this server only (deploy/DEPLOY.md, Backups)\n' >&2
else
  command -v rclone >/dev/null || die "BACKUP_REMOTE is set but rclone is not installed"
  rclone copy --quiet "$ARCHIVE" "$REMOTE" || die "copy to $REMOTE failed (the local archive $ARCHIVE is kept)"
  rclone delete --quiet --min-age "${KEEP_DAYS}d" --include 'balm-*.archive.gz' "$REMOTE" ||
    die "pruning $REMOTE failed (today's copy is there)"
  OFFHOST="$REMOTE"
fi

DONE=1
log "ok db=$DB archive=$ARCHIVE bytes=$SIZE pruned=$PRUNED offhost=$OFFHOST"
