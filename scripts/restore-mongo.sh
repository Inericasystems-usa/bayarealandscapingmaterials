#!/usr/bin/env bash
# Restores an archive made by scripts/backup-mongo.sh. By default it goes into a
# new scratch database (<db>_restore_<UTC stamp>) on the same server, so the
# production database is never overwritten by accident. Afterwards it prints the
# document count of every restored collection next to the live count in the
# database the backup came from. Read deploy/DEPLOY.md (Backups) first.
#
#   scripts/restore-mongo.sh ARCHIVE [--env-file FILE] [--to-db NAME] [--from-db NAME]
#   scripts/restore-mongo.sh ARCHIVE --to-db PRODUCTION_DB --overwrite-production
#
# --env-file: where MONGODB_URL is read (default
#   /var/www/bayarealandscapingmaterials.com-shared/api.env).
# --from-db: the database inside the archive (default: from the file name,
#   balm-<db>-<stamp>.archive.gz).
# --to-db: the database to restore into. A scratch target must not exist yet.
#   The production database (the one MONGODB_URL names) needs
#   --overwrite-production and its name typed at the prompt: its collections
#   are dropped and replaced by the archive's.
#
# The connection string never appears on a command line: the tools get it from
# a mode-600 file, mongosh from its environment.
set -euo pipefail
umask 077

ENV_FILE=/var/www/bayarealandscapingmaterials.com-shared/api.env
ARCHIVE=""
FROM_DB=""
TO_DB=""
OVERWRITE=0

usage() {
  sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case $1 in
    --env-file) ENV_FILE=${2:?--env-file needs a file}; shift ;;
    --from-db) FROM_DB=${2:?--from-db needs a name}; shift ;;
    --to-db) TO_DB=${2:?--to-db needs a name}; shift ;;
    --overwrite-production) OVERWRITE=1 ;;
    -h | --help) usage; exit 0 ;;
    -*) usage >&2; exit 2 ;;
    *)
      [ -z "$ARCHIVE" ] || { usage >&2; exit 2; }
      ARCHIVE=$1
      ;;
  esac
  shift
done

TMP=""
cleanup() { if [ -n "$TMP" ]; then rm -rf -- "$TMP"; fi; }
trap cleanup EXIT
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Same parsing as backup-mongo.sh: the last NAME= line, without running the file.
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
url_db() {
  local rest=${1#*://}
  rest=${rest%%\?*}
  case $rest in
    */*) printf '%s' "${rest#*/}" ;;
  esac
}
valid_db() { [[ $1 =~ ^[A-Za-z0-9_-]{1,63}$ ]]; }

[ -n "$ARCHIVE" ] || { usage >&2; exit 2; }
[ -r "$ARCHIVE" ] || die "$ARCHIVE is missing or unreadable"
for cmd in mongorestore mongosh gzip; do
  command -v "$cmd" >/dev/null || die "$cmd is not installed (mongorestore: mongodb-database-tools; mongosh: the MongoDB shell)"
done
gzip -t "$ARCHIVE" || die "$ARCHIVE is not a valid gzip archive"
[ -r "$ENV_FILE" ] || die "$ENV_FILE is missing or unreadable"
URI=$(env_value MONGODB_URL)
[ -n "$URI" ] || die "MONGODB_URL is not set in $ENV_FILE"
PROD_DB=$(url_db "$URI")
PROD_DB=${PROD_DB:-test}

if [ -z "$FROM_DB" ]; then
  FROM_DB=$(basename -- "$ARCHIVE")
  FROM_DB=${FROM_DB#balm-}
  FROM_DB=${FROM_DB%-[0-9]*T[0-9]*Z.archive.gz}
  [ "$FROM_DB" != "$(basename -- "$ARCHIVE")" ] || die "can't tell the database from the file name: pass --from-db"
fi
TO_DB=${TO_DB:-${FROM_DB}_restore_$(date -u +%Y%m%dT%H%M%SZ)}
valid_db "$FROM_DB" || die "--from-db '$FROM_DB' is not a database name"
valid_db "$TO_DB" || die "--to-db '$TO_DB' is not a database name"

# The tools take the server from the URL and the databases from the options, so
# the URL's database path is dropped; it stays the authentication database
# unless the URL names another one. (A mongodb+srv URL, MongoDB Atlas, gets its
# authentication database from DNS, so nothing is added there.)
base=${URI%%\?*}
query=""
[[ $URI != *\?* ]] || query=${URI#*\?}
case ${base#*://} in
  */*) base=${base%/*} ;;
esac
url_path_db=$(url_db "$URI")
if [ -n "$url_path_db" ] && [[ $URI == mongodb://*@* ]] && [[ $query != *authSource=* ]]; then
  query="${query:+$query&}authSource=$url_path_db"
fi
SERVER_URI="$base/${query:+?$query}"

TMP=$(mktemp -d)
CONFIG="$TMP/mongorestore.yaml"
esc=${SERVER_URI//\\/\\\\}
esc=${esc//\"/\\\"}
printf 'uri: "%s"\n' "$esc" >"$CONFIG"
chmod 600 "$CONFIG"

# Counts of every collection in a database, one "name<TAB>count" per line.
counts() {
  BALM_RESTORE_URI="$SERVER_URI" BALM_RESTORE_DB="$1" mongosh --nodb --quiet --eval '
    const d = connect(process.env.BALM_RESTORE_URI).getSiblingDB(process.env.BALM_RESTORE_DB);
    for (const c of d.getCollectionNames().sort()) print(c + "\t" + d.getCollection(c).countDocuments({}));'
}

existing=$(counts "$TO_DB") || die "cannot reach MongoDB with MONGODB_URL from $ENV_FILE"
drop=()
if [ "$TO_DB" = "$PROD_DB" ]; then
  [ "$OVERWRITE" -eq 1 ] ||
    die "$TO_DB is the production database: restoring over it needs --overwrite-production (try a scratch database first: leave out --to-db)"
  ( : <>/dev/tty ) 2>/dev/null || die "overwriting production needs a terminal to confirm on"
  printf 'This DROPS every collection in the production database "%s" that the archive holds and replaces it with\n  %s\nType the database name to go on: ' "$TO_DB" "$ARCHIVE" >/dev/tty
  read -r answer </dev/tty
  [ "$answer" = "$TO_DB" ] || die "not confirmed; nothing was changed"
  drop=(--drop)
elif [ -n "$existing" ]; then
  die "database $TO_DB already has collections: pick a new --to-db (restoring into it would mix two copies)"
fi

printf 'restoring %s (database %s) into %s\n' "$ARCHIVE" "$FROM_DB" "$TO_DB"
mongorestore --config="$CONFIG" --archive="$ARCHIVE" --gzip --quiet "${drop[@]}" \
  --nsInclude="$FROM_DB.*" --nsFrom="$FROM_DB.*" --nsTo="$TO_DB.*" ||
  die "mongorestore failed; $TO_DB may be partly restored"

restored=$(counts "$TO_DB") || die "restored, but counting $TO_DB failed"
[ -n "$restored" ] || die "nothing was restored: is $FROM_DB the database in this archive? (--from-db)"
live=""
if [ "$FROM_DB" != "$TO_DB" ]; then live=$(counts "$FROM_DB" || true); fi
printf '\n%-28s %12s %12s\n' collection "in $TO_DB" "live $FROM_DB"
while IFS=$'\t' read -r name n; do
  now=$(awk -F '\t' -v c="$name" '$1 == c { print $2 }' <<<"$live")
  printf '%-28s %12s %12s\n' "$name" "$n" "${now:--}"
done <<<"$restored"
if [ "$TO_DB" = "$PROD_DB" ]; then
  printf '\nrestored over the production database %s: restart the API (pm2 restart balm-api)\n' "$TO_DB"
else
  printf '\nrestored into %s. Drop the copy when done: db.getSiblingDB("%s").dropDatabase() in mongosh\n' "$TO_DB" "$TO_DB"
fi
