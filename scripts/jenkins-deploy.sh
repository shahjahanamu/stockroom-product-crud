#!/usr/bin/env bash
set -euo pipefail
# All values arrive from Jenkins parameters or credential bindings.
[[ "$TARGET" == staging || "$TARGET" == production ]]
[[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]]
[[ "$IMAGE_REPOSITORY" =~ ^[a-z0-9_.-]+/[a-z0-9_.-]+$ ]]
[[ "$DEPLOY_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]]
[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]
test -s "$SSH_KEY"
test -s "$SSH_KNOWN_HOSTS"
remote="$DEPLOY_USER@$DEPLOY_HOST"
ssh_options=(-i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes
             -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$SSH_KNOWN_HOSTS"
             -o ConnectTimeout=15)
ssh "${ssh_options[@]}" "$remote" "mkdir -p stockroom-$TARGET"
scp "${ssh_options[@]}" deploy/compose.yaml scripts/smoke.py "$remote:stockroom-$TARGET/"
ssh "${ssh_options[@]}" "$remote" \
    "cd stockroom-$TARGET && IMAGE_REPOSITORY='$IMAGE_REPOSITORY' IMAGE_TAG='$IMAGE_TAG' bash -s" <<'REMOTE'
set -euo pipefail
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml pull
docker compose -f compose.yaml up -d --remove-orphans --force-recreate
if ! python3 smoke.py http://localhost:8081; then
    docker compose -f compose.yaml logs --tail=100
    exit 1
fi
printf '%s\n' "$IMAGE_TAG" > deployed-sha
REMOTE
