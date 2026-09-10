# Plane ICBB In-Place Image Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SHA-traceable Plane ICBB application images from `icbb-plane@icbb/plane` and cut the existing Plane runtime over to those images without creating or replacing any persistent Plane data stack.

**Architecture:** `icbb-plane` is the source/build repository. `/home/usman/projects/platform/plane` is the only deployment/operations repository and keeps the existing official generated Compose, secrets, PostgreSQL, Valkey, RabbitMQ, MinIO, volumes, workspace, users, projects/work-items, attachments, and gateway/domain. Deployment uses one non-secret Compose override that changes application image references only. Persistent services are never recreated by this cutover.

**Tech Stack:** Git, Docker Engine, Docker Compose V2, Bash, Python 3, Plane Community Edition, Django runtime introspection.

**Spec:** `docs/icbb/specs/2026-09-10-plane-icbb-in-place-image-cutover-design.md`

## Global Constraints

- Source/build repository: `hanavvip19-gif/icbb-plane`, branch `icbb/plane`.
- Operations repository: `/home/usman/projects/platform/plane` / `hanavvip19-gif/platform-plane`, branch `main`.
- In-place application image cutover only; never install a second Plane instance.
- Never create a new PostgreSQL, Valkey, RabbitMQ, MinIO, persistent volume set, workspace, user/admin bootstrap, domain, or gateway for this work.
- Persistent service containers and mounts must retain their pre-cutover identities.
- Build and deploy only from one clean exact `icbb/plane` Git SHA that matches `origin/icbb/plane`.
- Custom image tags must be SHA-derived and must carry matching OCI source/revision/version labels.
- `api`, `worker`, `beat-worker`, and `migrator` use the same API image for one target SHA.
- `proxy` is protected and is not replaced by this foundation cutover.
- This plan does not authorize schema migration. Any delta under `apps/api/plane/db/migrations/` is an immediate STOP / `DECISION REQUIRED` before runtime mutation.
- Do not alter authentication, RBAC, workspace membership, secrets, host-port exposure, gateway/domain routing, licensing, or entitlement behavior.
- Billing/upgrade UI presentation is separate scoped feature work; do not unlock Pro/Business behavior here.
- No secret may be printed, committed, copied into Plane, or stored in evidence.
- Never use `docker compose down -v`, `docker volume rm`, `docker system prune`, `restore.sh`, force-push, or history rewrite in this plan.
- Destructive data restore requires separate explicit human approval and is not normal image rollback.
- If a command or live service name differs from this grounded contract, STOP and report evidence rather than redesigning the procedure during execution.

---

## Task 1: Read-Only Repository and Runtime Preflight

**Files:**
- Read: `/home/usman/projects/platform/plane-fork/PROJECT_CONTEXT.md`
- Read: `/home/usman/projects/platform/plane-fork/WORKSTATE.md`
- Read: `/home/usman/projects/platform/plane-fork/docs/icbb/specs/2026-09-10-plane-icbb-in-place-image-cutover-design.md`
- Read: `/home/usman/projects/platform/plane-fork/docs/icbb/plans/2026-09-10-plane-icbb-in-place-image-cutover.md`
- Read: `/home/usman/projects/platform/plane/README.md`
- Read: `/home/usman/projects/platform/plane/plane-app/docker-compose.yaml`
- Read `plane.env` only as input to Docker Compose; never print it.
- Create transient evidence only: `/tmp/plane-icbb-cutover-<target-sha>/`

**Interfaces:**
- Consumes: approved SPEC/plan, both local repositories, existing Docker runtime.
- Produces: exact target SHA, repository-state proof, service map, container/image baseline, persistent mount baseline, logical-data baseline, upload count, HTTP baseline, source/migration delta result, and `PREFLIGHT=PASS` or STOP evidence.

- [ ] **Step 1: Verify the source repository without modifying it**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
origin="$(git -C "$SRC" remote get-url origin)"
case "$origin" in
  git@github.com:hanavvip19-gif/icbb-plane.git|https://github.com/hanavvip19-gif/icbb-plane.git) ;;
  *) echo "UNEXPECTED SOURCE ORIGIN: $origin" >&2; exit 1 ;;
esac
test "$(git -C "$SRC" branch --show-current)" = "icbb/plane"
test -z "$(git -C "$SRC" status --porcelain)"
git -C "$SRC" fetch --prune origin icbb/plane
test "$(git -C "$SRC" rev-parse HEAD)" = "$(git -C "$SRC" rev-parse origin/icbb/plane)"
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
test "${#TARGET_SHA}" -eq 40
printf 'TARGET_SHA=%s\n' "$TARGET_SHA"
```

Expected: local clean `icbb/plane` exactly matches `origin/icbb/plane`. Divergence, dirty state, wrong branch, or wrong origin is a STOP.

- [ ] **Step 2: Verify the operations repository without modifying runtime**

```bash
set -euo pipefail
OPS=/home/usman/projects/platform/plane
origin="$(git -C "$OPS" remote get-url origin)"
case "$origin" in
  git@github.com:hanavvip19-gif/platform-plane.git|https://github.com/hanavvip19-gif/platform-plane.git) ;;
  *) echo "UNEXPECTED OPS ORIGIN: $origin" >&2; exit 1 ;;
esac
test "$(git -C "$OPS" branch --show-current)" = "main"
git -C "$OPS" status --short
```

Expected: no unexpected tracked work. Ignored generated `plane-app/` content is allowed. Unrelated tracked WIP is a STOP; do not stash or discard it.

- [ ] **Step 3: Create the sanitized evidence directory**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
rm -rf "$EVIDENCE"
install -d -m 0700 "$EVIDENCE"
printf '%s\n' "$TARGET_SHA" > "$EVIDENCE/target-sha.txt"
git -C "$OPS" rev-parse HEAD > "$EVIDENCE/ops-sha.txt"
```

Expected: evidence directory mode is `0700`; files contain Git SHAs only.

- [ ] **Step 4: Verify Docker/Compose capabilities and capture service names**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"
docker version --format '{{.Server.Version}}'
docker compose version
docker compose config --help | grep -q -- '--hash'
docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml config --services \
  | sort > "$EVIDENCE/base-services.txt"
cat "$EVIDENCE/base-services.txt"
```

Expected service names for this approved plan:

```text
admin
api
beat-worker
live
migrator
plane-db
plane-minio
plane-mq
plane-redis
proxy
space
web
worker
```

Verify exactly:

```bash
cat > "$EVIDENCE/expected-services.txt" <<'EOF'
admin
api
beat-worker
live
migrator
plane-db
plane-minio
plane-mq
plane-redis
proxy
space
web
worker
EOF
diff -u "$EVIDENCE/expected-services.txt" "$EVIDENCE/base-services.txt"
```

Any difference is a STOP with the diff attached to the executor report.

- [ ] **Step 5: Capture live container and protected-mount identities**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"
: > "$EVIDENCE/pre-containers.tsv"
for svc in web admin space api worker beat-worker live proxy plane-db plane-redis plane-mq plane-minio; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml ps -q "$svc")"
  test -n "$cid"
  printf '%s\t%s\t%s\t%s\n' \
    "$svc" "$cid" \
    "$(docker inspect -f '{{.Config.Image}}' "$cid")" \
    "$(docker inspect -f '{{.Image}}' "$cid")" \
    >> "$EVIDENCE/pre-containers.tsv"
done
: > "$EVIDENCE/pre-persistent-mounts.tsv"
for svc in plane-db plane-redis plane-mq plane-minio; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml ps -q "$svc")"
  docker inspect -f '{{range .Mounts}}{{printf "%s\t%s\t%s\n" .Destination .Name .Source}}{{end}}' "$cid" \
    | sed "s/^/${svc}\t/" >> "$EVIDENCE/pre-persistent-mounts.tsv"
done
test -s "$EVIDENCE/pre-persistent-mounts.tsv"
cat "$EVIDENCE/pre-containers.tsv"
cat "$EVIDENCE/pre-persistent-mounts.tsv"
```

Expected: all long-running application/protected services have container IDs and persistent mount evidence is non-empty. The one-shot `migrator` is intentionally not required to be running.

- [ ] **Step 6: Capture the ICBB logical-data baseline through the existing API container**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cat > "$EVIDENCE/snapshot.py" <<'PY'
import json
from django.apps import apps
models = {m.__name__: m for m in apps.get_models()}
required = ["Workspace", "WorkspaceMember", "Project", "Issue"]
missing = [name for name in required if name not in models]
if missing:
    raise SystemExit(f"missing required Plane models: {missing}")
Workspace = models["Workspace"]
WorkspaceMember = models["WorkspaceMember"]
Project = models["Project"]
Issue = models["Issue"]
rows = list(Workspace.objects.filter(name="ICBB").values("id", "name", "slug"))
if len(rows) != 1:
    raise SystemExit(f"expected exactly one ICBB workspace, found {len(rows)}")
ws = rows[0]
wid = ws["id"]
out = {
    "workspace": {"id": str(ws["id"]), "name": ws["name"], "slug": ws["slug"]},
    "workspace_members": WorkspaceMember.objects.filter(workspace_id=wid).count(),
    "projects": Project.objects.filter(workspace_id=wid).count(),
    "work_items": Issue.objects.filter(workspace_id=wid).count(),
}
if "User" in models:
    out["users_global"] = models["User"].objects.count()
print(json.dumps(out, sort_keys=True))
PY
cd "$OPS"
docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml exec -T api \
  python manage.py shell < "$EVIDENCE/snapshot.py" \
  | tail -n 1 > "$EVIDENCE/pre-data.json"
python3 -m json.tool "$EVIDENCE/pre-data.json"
```

Expected: exactly one `ICBB` workspace identity and non-negative counts. No database row content, token, password, or environment value is captured.

- [ ] **Step 7: Capture upload count and local HTTP health**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"
minio_cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml ps -q plane-minio)"
docker exec "$minio_cid" sh -c 'test -d /export && find /export -type f 2>/dev/null | wc -l' \
  > "$EVIDENCE/pre-upload-file-count.txt"
grep -Eq '^[0-9]+$' "$EVIDENCE/pre-upload-file-count.txt"
curl --fail --location --silent --show-error --max-time 20 http://127.0.0.1:18080/ -o /dev/null
printf 'HTTP_LOCAL=PASS\n' > "$EVIDENCE/pre-http.txt"
```

Expected: numeric upload count and HTTP success. If live MinIO does not use `/export`, STOP with mount evidence; do not invent a new path.

- [ ] **Step 8: Prove this foundation target has no Plane source or migration delta**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
cd "$SRC"
BASE_SHA="$(python3 - <<'PY'
import json
print(json.load(open('.ai/repository.json'))['last_synced_sha'])
PY
)"
TARGET_SHA="$(git rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
git diff --name-only "$BASE_SHA..$TARGET_SHA" -- apps/api/plane/db/migrations \
  > "$EVIDENCE/migration-delta.txt"
test ! -s "$EVIDENCE/migration-delta.txt"
git diff --name-only "$BASE_SHA..$TARGET_SHA" -- \
  apps packages package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json \
  > "$EVIDENCE/source-delta.txt"
test ! -s "$EVIDENCE/source-delta.txt"
printf 'SOURCE_DELTA=EMPTY\nMIGRATION_DELTA=EMPTY\n'
```

Expected: both files are empty. This plan establishes the fork-image baseline before separate customization work. Any source or migration delta is a STOP and requires a source-change-specific review/plan; do not deploy it under this baseline cutover plan.

- [ ] **Step 9: Record preflight PASS**

```bash
set -euo pipefail
TARGET_SHA="$(git -C /home/usman/projects/platform/plane-fork rev-parse HEAD)"
printf 'PREFLIGHT=PASS\n' > "/tmp/plane-icbb-cutover-${TARGET_SHA}/preflight.result"
```

Expected: created only after Steps 1–8 pass.

- [ ] **Step 10: Report the read-only checkpoint**

```text
TASK 1 PREFLIGHT: PASS|FAIL
TARGET SHA: <sha>
SOURCE TREE: CLEAN|DIRTY
SOURCE DELTA: EMPTY|NON_EMPTY
MIGRATION DELTA: EMPTY|NON_EMPTY
OPS TREE: CLEAN|BLOCKED_BY_WIP
SERVICE MAP: PASS|FAIL
PERSISTENT BASELINE: CAPTURED|FAILED
ICBB DATA BASELINE: CAPTURED|FAILED
UPLOAD BASELINE: CAPTURED|FAILED
HTTP BASELINE: PASS|FAIL
NEXT GATE: BUILD AUTHORIZED|DECISION REQUIRED
```

No runtime application container may be recreated in Task 1.

---

## Task 2: Build and Verify SHA-Traceable Fork Images

**Files:**
- Create local Docker images only.
- Evidence: `/tmp/plane-icbb-cutover-<target-sha>/built-images.tsv`

**Interfaces:**
- Consumes: Task 1 `PREFLIGHT=PASS`, clean exact target SHA, empty source/migration delta.
- Produces: five SHA-labelled images: `web`, `admin`, `space`, shared `api`, and `live`.

- [ ] **Step 1: Revalidate the exact build SHA**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
cd "$SRC"
test "$(git branch --show-current)" = "icbb/plane"
test -z "$(git status --porcelain)"
git fetch --prune origin icbb/plane
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/icbb/plane)"
TARGET_SHA="$(git rev-parse HEAD)"
grep -qx 'PREFLIGHT=PASS' "/tmp/plane-icbb-cutover-${TARGET_SHA}/preflight.result"
TAG="git-${TARGET_SHA:0:12}"
printf '%s %s\n' "$TARGET_SHA" "$TAG"
```

Expected: same SHA as Task 1.

- [ ] **Step 2: Build `web`**

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane-fork
TARGET_SHA="$(git rev-parse HEAD)"; TAG="git-${TARGET_SHA:0:12}"
docker build \
  --label "org.opencontainers.image.source=https://github.com/hanavvip19-gif/icbb-plane" \
  --label "org.opencontainers.image.revision=${TARGET_SHA}" \
  --label "org.opencontainers.image.version=${TAG}" \
  -t "icbb-plane/web:${TAG}" -f apps/web/Dockerfile.web .
```

Expected: exit `0`.

- [ ] **Step 3: Build `admin`**

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane-fork
TARGET_SHA="$(git rev-parse HEAD)"; TAG="git-${TARGET_SHA:0:12}"
docker build \
  --label "org.opencontainers.image.source=https://github.com/hanavvip19-gif/icbb-plane" \
  --label "org.opencontainers.image.revision=${TARGET_SHA}" \
  --label "org.opencontainers.image.version=${TAG}" \
  -t "icbb-plane/admin:${TAG}" -f apps/admin/Dockerfile.admin .
```

Expected: exit `0`.

- [ ] **Step 4: Build `space`**

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane-fork
TARGET_SHA="$(git rev-parse HEAD)"; TAG="git-${TARGET_SHA:0:12}"
docker build \
  --label "org.opencontainers.image.source=https://github.com/hanavvip19-gif/icbb-plane" \
  --label "org.opencontainers.image.revision=${TARGET_SHA}" \
  --label "org.opencontainers.image.version=${TAG}" \
  -t "icbb-plane/space:${TAG}" -f apps/space/Dockerfile.space .
```

Expected: exit `0`.

- [ ] **Step 5: Build the shared API image**

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane-fork
TARGET_SHA="$(git rev-parse HEAD)"; TAG="git-${TARGET_SHA:0:12}"
docker build \
  --label "org.opencontainers.image.source=https://github.com/hanavvip19-gif/icbb-plane" \
  --label "org.opencontainers.image.revision=${TARGET_SHA}" \
  --label "org.opencontainers.image.version=${TAG}" \
  -t "icbb-plane/api:${TAG}" -f apps/api/Dockerfile.api apps/api
```

Expected: exit `0`. This exact image is the source for `api`, `worker`, `beat-worker`, and `migrator`; `migrator` is not run because migration delta is empty.

- [ ] **Step 6: Build `live`**

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane-fork
TARGET_SHA="$(git rev-parse HEAD)"; TAG="git-${TARGET_SHA:0:12}"
docker build \
  --label "org.opencontainers.image.source=https://github.com/hanavvip19-gif/icbb-plane" \
  --label "org.opencontainers.image.revision=${TARGET_SHA}" \
  --label "org.opencontainers.image.version=${TAG}" \
  -t "icbb-plane/live:${TAG}" -f apps/live/Dockerfile.live .
```

Expected: exit `0`.

- [ ] **Step 7: Verify immutable provenance and image IDs**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"; TAG="git-${TARGET_SHA:0:12}"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
: > "$EVIDENCE/built-images.tsv"
for component in web admin space api live; do
  ref="icbb-plane/${component}:${TAG}"
  test "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$ref")" = "$TARGET_SHA"
  test "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.source"}}' "$ref")" = 'https://github.com/hanavvip19-gif/icbb-plane'
  test "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$ref")" = "$TAG"
  printf '%s\t%s\t%s\n' "$component" "$ref" "$(docker image inspect -f '{{.Id}}' "$ref")" \
    >> "$EVIDENCE/built-images.tsv"
done
cat "$EVIDENCE/built-images.tsv"
```

Expected: five rows; all label assertions pass.

- [ ] **Step 8: Run deterministic baseline verification**

Because Task 1 requires `SOURCE_DELTA=EMPTY`, source-code test suites are `N/A` for this baseline cutover. Verify repository metadata and that the built Python image can import/compile the shipped Plane package:

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane-fork
TARGET_SHA="$(git rev-parse HEAD)"; TAG="git-${TARGET_SHA:0:12}"
python3 -m json.tool .ai/repository.json >/dev/null
python3 -m json.tool .ai/verification-profile.json >/dev/null
git diff --check
docker run --rm --entrypoint python "icbb-plane/api:${TAG}" -m compileall -q /code/plane
```

Expected: all commands exit `0`. If a future target contains source changes, this task must not be used; return to architecture/planning for source-specific tests.

- [ ] **Step 9: Report build gate**

```text
TASK 2 BUILD: PASS|FAIL
TARGET SHA: <sha>
SOURCE DELTA: EMPTY
WEB IMAGE: <ref> <image-id>
ADMIN IMAGE: <ref> <image-id>
SPACE IMAGE: <ref> <image-id>
API IMAGE: <ref> <image-id>
LIVE IMAGE: <ref> <image-id>
PROVENANCE: PASS|FAIL
BASELINE VERIFICATION: PASS|FAIL
NEXT GATE: OPS OVERRIDE|BLOCKED
```

---

## Task 3: Add the Non-Secret Operations Image Override

**Files:**
- Create: `/home/usman/projects/platform/plane/compose.icbb.override.yaml`
- Modify: `/home/usman/projects/platform/plane/README.md`
- Never modify or commit: `/home/usman/projects/platform/plane/plane-app/plane.env`

**Interfaces:**
- Consumes: Task 2 PASS and exact target SHA.
- Produces: versioned operations override and proof that protected service hashes and volume names are unchanged.

- [ ] **Step 1: Create the exact SHA-pinned override**

Resolve the tag:

```bash
TARGET_SHA="$(git -C /home/usman/projects/platform/plane-fork rev-parse HEAD)"
TAG="git-${TARGET_SHA:0:12}"
printf '%s\n' "$TAG"
```

Create `compose.icbb.override.yaml`, substituting the printed tag for `<TAG>`:

```yaml
services:
  web:
    image: icbb-plane/web:<TAG>
    pull_policy: never
  admin:
    image: icbb-plane/admin:<TAG>
    pull_policy: never
  space:
    image: icbb-plane/space:<TAG>
    pull_policy: never
  api:
    image: icbb-plane/api:<TAG>
    pull_policy: never
  worker:
    image: icbb-plane/api:<TAG>
    pull_policy: never
  beat-worker:
    image: icbb-plane/api:<TAG>
    pull_policy: never
  migrator:
    image: icbb-plane/api:<TAG>
    pull_policy: never
  live:
    image: icbb-plane/live:<TAG>
    pull_policy: never
```

Expected: no `volumes`, `ports`, `networks`, `environment`, `env_file`, `build`, `proxy`, or persistent service entries.

- [ ] **Step 2: Validate the merged Compose model without printing secrets**

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane
docker compose --env-file plane-app/plane.env \
  -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml config --quiet
docker compose --env-file plane-app/plane.env \
  -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml config --images | sort
```

Expected: config parses; custom SHA-tagged image refs appear for the eight mapped application roles only.

- [ ] **Step 3: Prove protected service configuration hashes and named-volume set are unchanged**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"
: > "$EVIDENCE/base-protected-hashes.txt"
: > "$EVIDENCE/target-protected-hashes.txt"
for svc in plane-db plane-redis plane-mq plane-minio proxy; do
  docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml config --hash "$svc" \
    >> "$EVIDENCE/base-protected-hashes.txt"
  docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml config --hash "$svc" \
    >> "$EVIDENCE/target-protected-hashes.txt"
done
diff -u "$EVIDENCE/base-protected-hashes.txt" "$EVIDENCE/target-protected-hashes.txt"
docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml config --volumes | sort \
  > "$EVIDENCE/base-volumes.txt"
docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml config --volumes | sort \
  > "$EVIDENCE/target-volumes.txt"
diff -u "$EVIDENCE/base-volumes.txt" "$EVIDENCE/target-volumes.txt"
```

Expected: both diffs are empty. These commands store hashes/names only, not resolved environment values.

- [ ] **Step 4: Document the two-file runtime commands in the operations README**

Add a section containing these exact non-secret commands:

```bash
docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml config --quiet
docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ps
```

The section must also state: image cutover/rollback never uses `down -v`; `restore.sh` is destructive data recovery, not image rollback.

- [ ] **Step 5: Commit only safe operations files**

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane
git diff --check
git status --short
git add compose.icbb.override.yaml README.md
git diff --cached --check
test "$(git diff --cached --name-only | sort | paste -sd ' ' -)" = "README.md compose.icbb.override.yaml"
git commit -m "ops: pin Plane ICBB fork application images"
```

Expected: only the override and README are committed. `plane-app/`, backups, secrets, or generated runtime files remain untracked/ignored.

---

## Task 4: Establish Rollback Images and Backup Checkpoint

**Files:**
- Create transient: `/tmp/plane-icbb-cutover-<target-sha>/compose.rollback.yaml`
- Use existing backup helper; do not restore anything.

**Interfaces:**
- Consumes: pre-cutover container IDs from Task 1 and validated override from Task 3.
- Produces: immutable local rollback tags, render-valid rollback override, fresh backup path, and mandatory human cutover gate.

- [ ] **Step 1: Tag every currently running application image by exact image ID**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
cd "$OPS"
: > "$EVIDENCE/rollback-images.tsv"
for svc in web admin space api worker beat-worker live; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml ps -q "$svc")"
  test -n "$cid"
  image_id="$(docker inspect -f '{{.Image}}' "$cid")"
  ref="icbb-plane-rollback/${svc}:pre-${STAMP}"
  docker image tag "$image_id" "$ref"
  printf '%s\t%s\t%s\n' "$svc" "$ref" "$image_id" >> "$EVIDENCE/rollback-images.tsv"
done
cat "$EVIDENCE/rollback-images.tsv"
```

Expected: seven rows and all tags resolve locally.

- [ ] **Step 2: Generate the rollback override**

```bash
set -euo pipefail
TARGET_SHA="$(git -C /home/usman/projects/platform/plane-fork rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
python3 - "$EVIDENCE/rollback-images.tsv" "$EVIDENCE/compose.rollback.yaml" <<'PY'
import sys
rows = {}
for line in open(sys.argv[1]):
    svc, ref, _ = line.rstrip("\n").split("\t")
    rows[svc] = ref
required = ["web", "admin", "space", "api", "worker", "beat-worker", "live"]
missing = [x for x in required if x not in rows]
if missing:
    raise SystemExit(f"missing rollback rows: {missing}")
with open(sys.argv[2], "w") as f:
    f.write("services:\n")
    for svc in required:
        f.write(f"  {svc}:\n    image: {rows[svc]}\n    pull_policy: never\n")
PY
cat "$EVIDENCE/compose.rollback.yaml"
```

Expected: application image mappings only.

- [ ] **Step 3: Render-validate rollback without mutation**

```bash
set -euo pipefail
TARGET_SHA="$(git -C /home/usman/projects/platform/plane-fork rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd /home/usman/projects/platform/plane
docker compose --env-file plane-app/plane.env \
  -f plane-app/docker-compose.yaml -f "$EVIDENCE/compose.rollback.yaml" config --quiet
```

Expected: exit `0`.

- [ ] **Step 4: Create a fresh backup with the existing approved helper**

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane
env -u DEBUG ./setup.sh backup
backup_path="$(ls -1dt plane-app/backup/* | head -n 1)"
test -e "$backup_path"
printf 'BACKUP_PATH=%s\n' "$backup_path"
```

Expected: backup helper succeeds and a newest backup path exists. Never invoke `restore.sh` here.

- [ ] **Step 5: Mandatory human cutover gate**

Return this checkpoint and STOP execution until explicit human approval:

```text
TASKS 1-4: PASS|FAIL
TARGET SHA: <sha>
SOURCE DELTA: EMPTY
MIGRATION DELTA: EMPTY
BUILT IMAGE PROVENANCE: PASS|FAIL
OPS OVERRIDE RENDER: PASS|FAIL
PROTECTED HASH DIFF: EMPTY|NON_EMPTY
VOLUME-NAME DIFF: EMPTY|NON_EMPTY
ROLLBACK OVERRIDE: PASS|FAIL
BACKUP: PASS|FAIL <path>
RUNTIME MUTATION PERFORMED: NO
CUTOVER APPROVAL REQUIRED: YES
```

Task 5 must not start without explicit approval.

---

## Task 5: Perform the In-Place Application Image Cutover

**Files:**
- Runtime mutation through base Compose + `compose.icbb.override.yaml` only.
- No persistent-service file/data change.

**Interfaces:**
- Consumes: Tasks 1–4 PASS and explicit human cutover approval.
- Produces: seven long-running application services recreated on exact fork images, while protected containers and mounts remain unchanged.

- [ ] **Step 1: Revalidate SHA, data identity, protected container IDs, and migration/source gates immediately before mutation**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
test -z "$(git -C "$SRC" status --porcelain)"
git -C "$SRC" fetch --prune origin icbb/plane
test "$(git -C "$SRC" rev-parse HEAD)" = "$(git -C "$SRC" rev-parse origin/icbb/plane)"
grep -qx 'PREFLIGHT=PASS' "$EVIDENCE/preflight.result"
test ! -s "$EVIDENCE/source-delta.txt"
test ! -s "$EVIDENCE/migration-delta.txt"
cd "$OPS"
for svc in plane-db plane-redis plane-mq plane-minio proxy; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml ps -q "$svc")"
  test -n "$cid"
  grep -Fq "$svc"$'\t'"$cid"$'\t' "$EVIDENCE/pre-containers.tsv"
done
```

Expected: all assertions pass. Any target SHA drift or protected container replacement is a STOP before cutover.

- [ ] **Step 2: Recreate only the seven long-running application services**

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane
docker compose --env-file plane-app/plane.env \
  -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml \
  up -d --no-deps --pull never --force-recreate \
  api worker beat-worker live web admin space
```

Expected: only those seven services are recreated. `migrator`, `proxy`, `plane-db`, `plane-redis`, `plane-mq`, and `plane-minio` are not started/recreated by this command.

- [ ] **Step 3: Verify status and logs**

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane
docker compose --env-file plane-app/plane.env \
  -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ps
docker compose --env-file plane-app/plane.env \
  -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml \
  logs --tail=200 api worker beat-worker live web admin space
```

Expected: long-running services are up/healthy as defined by the runtime and logs contain no unrecovered startup/database/broker/object-storage/import failure.

- [ ] **Step 4: Prove every live application service runs an image labelled with the exact target SHA**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
cd "$OPS"
for svc in web admin space api worker beat-worker live; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ps -q "$svc")"
  test -n "$cid"
  image_id="$(docker inspect -f '{{.Image}}' "$cid")"
  test "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id")" = "$TARGET_SHA"
  printf '%s\t%s\t%s\n' "$svc" "$cid" "$image_id"
done
```

Expected: seven assertions pass.

- [ ] **Step 5: Prove protected containers and persistent mounts are unchanged**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"
: > "$EVIDENCE/post-protected.tsv"
for svc in plane-db plane-redis plane-mq plane-minio proxy; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ps -q "$svc")"
  printf '%s\t%s\n' "$svc" "$cid" >> "$EVIDENCE/post-protected.tsv"
done
python3 - "$EVIDENCE/pre-containers.tsv" "$EVIDENCE/post-protected.tsv" <<'PY'
import sys
protected = {"plane-db", "plane-redis", "plane-mq", "plane-minio", "proxy"}
pre = {}
for line in open(sys.argv[1]):
    svc, cid, *_ = line.rstrip("\n").split("\t")
    if svc in protected:
        pre[svc] = cid
post = dict(line.rstrip("\n").split("\t") for line in open(sys.argv[2]))
if pre != post:
    raise SystemExit(f"protected container identity changed: pre={pre} post={post}")
print("PROTECTED_CONTAINER_IDENTITY=PASS")
PY
: > "$EVIDENCE/post-persistent-mounts.tsv"
for svc in plane-db plane-redis plane-mq plane-minio; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ps -q "$svc")"
  docker inspect -f '{{range .Mounts}}{{printf "%s\t%s\t%s\n" .Destination .Name .Source}}{{end}}' "$cid" \
    | sed "s/^/${svc}\t/" >> "$EVIDENCE/post-persistent-mounts.tsv"
done
diff -u "$EVIDENCE/pre-persistent-mounts.tsv" "$EVIDENCE/post-persistent-mounts.tsv"
```

Expected: identity PASS and mount diff empty.

- [ ] **Step 6: Verify local HTTP**

```bash
curl --fail --location --silent --show-error --max-time 20 http://127.0.0.1:18080/ -o /dev/null
```

Expected: success. Any failure in Steps 2–6 means Task 7 rollback must be executed before unrelated debugging.

---

## Task 6: Verify Existing Data Continuity and Acceptance

**Files:**
- Evidence only: `/tmp/plane-icbb-cutover-<target-sha>/post-data.json`, post upload count, and final verification report.

**Interfaces:**
- Consumes: live cutover runtime and pre-cutover evidence.
- Produces: deterministic logical-data continuity, upload continuity, one-stack evidence, image provenance result, and final acceptance PASS/FAIL.

- [ ] **Step 1: Capture a fresh post-cutover ICBB snapshot**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cat > "$EVIDENCE/post-snapshot.py" <<'PY'
import json
from django.apps import apps
models = {m.__name__: m for m in apps.get_models()}
required = ["Workspace", "WorkspaceMember", "Project", "Issue"]
missing = [name for name in required if name not in models]
if missing:
    raise SystemExit(f"missing required Plane models: {missing}")
Workspace = models["Workspace"]
WorkspaceMember = models["WorkspaceMember"]
Project = models["Project"]
Issue = models["Issue"]
rows = list(Workspace.objects.filter(name="ICBB").values("id", "name", "slug"))
if len(rows) != 1:
    raise SystemExit(f"expected exactly one ICBB workspace, found {len(rows)}")
ws = rows[0]
wid = ws["id"]
out = {
    "workspace": {"id": str(ws["id"]), "name": ws["name"], "slug": ws["slug"]},
    "workspace_members": WorkspaceMember.objects.filter(workspace_id=wid).count(),
    "projects": Project.objects.filter(workspace_id=wid).count(),
    "work_items": Issue.objects.filter(workspace_id=wid).count(),
}
if "User" in models:
    out["users_global"] = models["User"].objects.count()
print(json.dumps(out, sort_keys=True))
PY
cd "$OPS"
docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml exec -T api \
  python manage.py shell < "$EVIDENCE/post-snapshot.py" \
  | tail -n 1 > "$EVIDENCE/post-data.json"
python3 -m json.tool "$EVIDENCE/post-data.json"
```

Expected: one ICBB workspace and valid counts.

- [ ] **Step 2: Compare workspace identity and logical counts with no-fake-zero semantics**

```bash
set -euo pipefail
TARGET_SHA="$(git -C /home/usman/projects/platform/plane-fork rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
python3 - "$EVIDENCE/pre-data.json" "$EVIDENCE/post-data.json" <<'PY'
import json, sys
pre = json.load(open(sys.argv[1]))
post = json.load(open(sys.argv[2]))
if pre["workspace"] != post["workspace"]:
    raise SystemExit(f"workspace identity changed: {pre['workspace']} -> {post['workspace']}")
for key in ["workspace_members", "projects", "work_items"]:
    if post[key] < pre[key]:
        raise SystemExit(f"unexpected count decrease for {key}: {pre[key]} -> {post[key]}")
if "users_global" in pre and "users_global" in post and post["users_global"] < pre["users_global"]:
    raise SystemExit(f"unexpected users_global decrease: {pre['users_global']} -> {post['users_global']}")
print("LOGICAL_DATA_CONTINUITY=PASS")
PY
```

Expected: exact workspace identity and no count decreases. Count increases are acceptable because normal concurrent activity may occur.

- [ ] **Step 3: Verify attachment/upload continuity**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"
minio_cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ps -q plane-minio)"
docker exec "$minio_cid" sh -c 'test -d /export && find /export -type f 2>/dev/null | wc -l' \
  > "$EVIDENCE/post-upload-file-count.txt"
python3 - "$EVIDENCE/pre-upload-file-count.txt" "$EVIDENCE/post-upload-file-count.txt" <<'PY'
import sys
pre = int(open(sys.argv[1]).read().strip())
post = int(open(sys.argv[2]).read().strip())
if post < pre:
    raise SystemExit(f"upload file count decreased: {pre} -> {post}")
print("UPLOAD_CONTINUITY=PASS")
PY
```

Expected: no decrease.

- [ ] **Step 4: Verify no second Plane runtime was created**

```bash
docker compose ls --format json | python3 -m json.tool
```

Expected: no new second Plane Compose project/persistent stack attributable to this cutover. Correlate with protected container IDs captured before cutover.

- [ ] **Step 5: Re-prove live image provenance**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
cd "$OPS"
for svc in web admin space api worker beat-worker live; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ps -q "$svc")"
  image_id="$(docker inspect -f '{{.Image}}' "$cid")"
  test "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id")" = "$TARGET_SHA"
done
printf 'IMAGE_PROVENANCE=PASS\n'
```

Expected: PASS.

- [ ] **Step 6: Verify the licensing/entitlement boundary for this baseline**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
cd "$SRC"
BASE_SHA="$(python3 - <<'PY'
import json
print(json.load(open('.ai/repository.json'))['last_synced_sha'])
PY
)"
TARGET_SHA="$(git rev-parse HEAD)"
git diff --name-only "$BASE_SHA..$TARGET_SHA" -- apps packages
```

Expected: no source files at all for this foundation target, therefore no entitlement/licensing code delta. Any output is a FAIL for this plan and requires review.

- [ ] **Step 7: Produce the acceptance matrix**

```text
MIGRATION: N/A — delta empty
SOURCE DELTA: EMPTY
UNIT/SOURCE TESTS: N/A — baseline has no source delta
IMAGE BUILDS: PASS|FAIL
API COMPILE CHECK: PASS|FAIL
INTEGRATION: PASS|FAIL
SECURITY: PASS|FAIL
REGRESSION: PASS|FAIL
E2E/HTTP: PASS|FAIL
IMAGE PROVENANCE: PASS|FAIL
PERSISTENT CONTAINER IDENTITY: PASS|FAIL
PERSISTENT MOUNT CONTINUITY: PASS|FAIL
ICBB WORKSPACE IDENTITY: PASS|FAIL
USER/MEMBER DATA CONTINUITY: PASS|FAIL
PROJECT/WORK-ITEM DATA CONTINUITY: PASS|FAIL
ATTACHMENT CONTINUITY: PASS|FAIL
ONE PERSISTENT STACK: PASS|FAIL
LICENSING/ENTITLEMENT BOUNDARY: PASS|FAIL
ACCEPTANCE CRITERIA: PASS|FAIL
UNRELATED CHANGES: NONE|EXPLAIN
```

A single FAIL means cutover is not DONE. If runtime functionality is impaired, execute Task 7.

---

## Task 7: Roll Back Application Images on Failure

**Files:**
- Use transient `/tmp/plane-icbb-cutover-<target-sha>/compose.rollback.yaml`.
- Do not restore persistent data.

**Interfaces:**
- Consumes: rollback override/tags and failed Task 5/6 verification.
- Produces: seven application services restored to exact pre-cutover image IDs while protected persistent services remain untouched.

- [ ] **Step 1: Recreate only application services from rollback refs**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"
docker compose --env-file plane-app/plane.env \
  -f plane-app/docker-compose.yaml -f "$EVIDENCE/compose.rollback.yaml" \
  up -d --no-deps --pull never --force-recreate \
  api worker beat-worker live web admin space
```

Expected: seven application services revert; persistent services and proxy are untouched.

- [ ] **Step 2: Verify protected container IDs and mounts after rollback**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"
: > "$EVIDENCE/rollback-protected.tsv"
for svc in plane-db plane-redis plane-mq plane-minio proxy; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml ps -q "$svc")"
  printf '%s\t%s\n' "$svc" "$cid" >> "$EVIDENCE/rollback-protected.tsv"
done
python3 - "$EVIDENCE/pre-containers.tsv" "$EVIDENCE/rollback-protected.tsv" <<'PY'
import sys
protected = {"plane-db", "plane-redis", "plane-mq", "plane-minio", "proxy"}
pre = {}
for line in open(sys.argv[1]):
    svc, cid, *_ = line.rstrip("\n").split("\t")
    if svc in protected:
        pre[svc] = cid
post = dict(line.rstrip("\n").split("\t") for line in open(sys.argv[2]))
if pre != post:
    raise SystemExit(f"protected container identity changed: pre={pre} post={post}")
print("PROTECTED_CONTAINER_IDENTITY=PASS")
PY
: > "$EVIDENCE/rollback-persistent-mounts.tsv"
for svc in plane-db plane-redis plane-mq plane-minio; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml ps -q "$svc")"
  docker inspect -f '{{range .Mounts}}{{printf "%s\t%s\t%s\n" .Destination .Name .Source}}{{end}}' "$cid" \
    | sed "s/^/${svc}\t/" >> "$EVIDENCE/rollback-persistent-mounts.tsv"
done
diff -u "$EVIDENCE/pre-persistent-mounts.tsv" "$EVIDENCE/rollback-persistent-mounts.tsv"
```

Expected: container identity PASS and empty mount diff.

- [ ] **Step 3: Verify HTTP and logical data after rollback**

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
curl --fail --location --silent --show-error --max-time 20 http://127.0.0.1:18080/ -o /dev/null
cat > "$EVIDENCE/rollback-snapshot.py" <<'PY'
import json
from django.apps import apps
models = {m.__name__: m for m in apps.get_models()}
Workspace = models["Workspace"]
WorkspaceMember = models["WorkspaceMember"]
Project = models["Project"]
Issue = models["Issue"]
rows = list(Workspace.objects.filter(name="ICBB").values("id", "name", "slug"))
if len(rows) != 1:
    raise SystemExit(f"expected exactly one ICBB workspace, found {len(rows)}")
ws = rows[0]
wid = ws["id"]
out = {
    "workspace": {"id": str(ws["id"]), "name": ws["name"], "slug": ws["slug"]},
    "workspace_members": WorkspaceMember.objects.filter(workspace_id=wid).count(),
    "projects": Project.objects.filter(workspace_id=wid).count(),
    "work_items": Issue.objects.filter(workspace_id=wid).count(),
}
if "User" in models:
    out["users_global"] = models["User"].objects.count()
print(json.dumps(out, sort_keys=True))
PY
cd "$OPS"
docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml exec -T api \
  python manage.py shell < "$EVIDENCE/rollback-snapshot.py" | tail -n 1 > "$EVIDENCE/rollback-data.json"
python3 - "$EVIDENCE/pre-data.json" "$EVIDENCE/rollback-data.json" <<'PY'
import json, sys
pre = json.load(open(sys.argv[1])); post = json.load(open(sys.argv[2]))
if pre["workspace"] != post["workspace"]:
    raise SystemExit("workspace identity changed")
for key in ["workspace_members", "projects", "work_items"]:
    if post[key] < pre[key]:
        raise SystemExit(f"count decreased for {key}: {pre[key]} -> {post[key]}")
print("ROLLBACK_DATA_CONTINUITY=PASS")
PY
```

Expected: HTTP and logical continuity pass.

- [ ] **Step 4: Report rollback and stop**

```text
ROLLBACK: PASS|FAIL
APPLICATION IMAGES: PRE-CUTOVER RESTORED|FAILED
PERSISTENT SERVICES: UNCHANGED|CHANGED
ICBB DATA CONTINUITY: PASS|FAIL
HTTP: PASS|FAIL
RESTORE.SH USED: NO
DECISION REQUIRED: YES
```

Do not resume forward cutover after rollback without diagnosis and a new human decision.

---

## Task 8: Close Repository State, Plane Tracking, and Durable Learning

**Files:**
- Modify: `/home/usman/projects/platform/plane-fork/WORKSTATE.md`
- Update Plane: existing `PLAT-11`; do not create a duplicate.
- Update Obsidian only with verified reusable learning linked to `[[Plane ICBB Decision Log]]`.

**Interfaces:**
- Consumes: successful Task 6 or Task 7 rollback evidence.
- Produces: evidence-aligned repository state, execution tracking, and durable verified learning.

- [ ] **Step 1: Review both repository states**

```bash
set -euo pipefail
git -C /home/usman/projects/platform/plane-fork status --short
git -C /home/usman/projects/platform/plane status --short
git -C /home/usman/projects/platform/plane-fork log -1 --oneline
git -C /home/usman/projects/platform/plane log -1 --oneline
```

Expected: no unrelated changes. Report any unrelated path; do not discard it.

- [ ] **Step 2: Update `WORKSTATE.md` with actual evidence**

Record: source SHA, operations SHA, deployed image refs/IDs, PASS/FAIL, protected resource continuity, whether rollback occurred, and exact next action. Do not mark DONE unless all Task 6 acceptance checks pass.

- [ ] **Step 3: Synchronize the existing Plane item**

Update `PLAT-11` with repository/branch, SPEC path, plan path, source SHA, operations SHA, mode, execution result, verification matrix, and blocker/rollback evidence. Use the current project’s available state closest to reality; do not invent missing workflow states and do not create another cutover item.

- [ ] **Step 4: Promote only verified reusable learning to Obsidian**

Durable candidates include verified service-image mapping, Compose override behavior, persistent-resource invariants, rollback behavior, or a reproducible Compose edge case. Link evidence to `[[Plane ICBB Decision Log]]`. Do not store secrets, raw logs, transient container IDs, one-off debugging noise, or unverified assumptions.

- [ ] **Step 5: Return the final evidence report**

```text
REPOSITORY: hanavvip19-gif/icbb-plane
BRANCH: icbb/plane
SOURCE SHA: <sha>
OPERATIONS REPOSITORY: hanavvip19-gif/platform-plane
OPERATIONS SHA: <sha>
PLANE ITEM: PLAT-11
CUTOVER: PASS|FAIL|ROLLED_BACK
MIGRATION: N/A|FAIL
SOURCE DELTA: EMPTY|NON_EMPTY
IMAGE BUILDS: PASS|FAIL
API COMPILE CHECK: PASS|FAIL
INTEGRATION: PASS|FAIL
SECURITY: PASS|FAIL
REGRESSION: PASS|FAIL
E2E: PASS|FAIL
IMAGE PROVENANCE: PASS|FAIL
PERSISTENT DATA CONTINUITY: PASS|FAIL
LICENSING/ENTITLEMENT BOUNDARY: PASS|FAIL
ACCEPTANCE CRITERIA: PASS|FAIL
UNRELATED CHANGES: NONE|EXPLAIN
NEW LEARNINGS: <verified durable findings only>
OBSIDIAN SYNC: DONE|NOT NEEDED|REQUIRED
PLANE SYNC: DONE|REQUIRED
```

## Definition of Done

This cutover is DONE only when:

- the seven long-running application services use images traceable to one exact `icbb/plane` Git SHA;
- the baseline target has no unreviewed Plane source or migration delta;
- protected persistent container IDs and mount identities remain unchanged;
- the `ICBB` workspace identity and logical data continuity checks pass;
- upload/attachment continuity passes;
- local HTTP and application services are healthy;
- no auth/RBAC, entitlement, secret, gateway/network, persistent-stack, or destructive data change was introduced;
- previous known-good application images remain available through acceptance;
- both repositories have no unrelated changes attributable to this execution;
- Plane `PLAT-11` reflects the actual state;
- only verified reusable learning is promoted to Obsidian.
