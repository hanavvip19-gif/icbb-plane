# Plane ICBB In-Place Image Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SHA-traceable Plane ICBB application images from `icbb-plane@icbb/plane` and cut the existing Plane runtime over to those images without creating or replacing any persistent Plane data stack.

**Architecture:** `icbb-plane` is the source/build repository. `/home/usman/projects/platform/plane` is the only deployment/operations repository and keeps the existing official generated Compose, secrets, PostgreSQL, Valkey, RabbitMQ, MinIO, volumes, workspace, users, projects/work-items, attachments, and gateway/domain. Deployment uses a small versioned operations override that replaces application image references only; cutover recreates named application services with `--no-deps` and never runs `down -v` or creates a second Compose project.

**Tech Stack:** Git, Docker Engine, Docker Compose V2, Bash, Python 3, Plane Community Edition, Django runtime introspection.

**Spec:** `docs/icbb/specs/2026-09-10-plane-icbb-in-place-image-cutover-design.md`

## Global Constraints

- Source/build repository: `hanavvip19-gif/icbb-plane`, branch `icbb/plane`.
- Operations repository: `/home/usman/projects/platform/plane` / `hanavvip19-gif/platform-plane`.
- In-place application image cutover only; never install a second Plane instance.
- Never create a new PostgreSQL, Valkey, RabbitMQ, MinIO, persistent volume set, workspace, user/admin bootstrap, domain, or gateway for this work.
- Persistent service containers/volumes must retain their pre-cutover identities.
- Build and deploy only from a clean exact `icbb/plane` Git SHA.
- Custom image tags must be immutable SHA-derived tags and must carry matching OCI revision/source/version labels.
- `api`, `worker`, `beat-worker`, and `migrator` share one API image per target SHA.
- `proxy` is not replaced unless a separately reviewed fork delta requires proxy changes.
- This plan does not authorize schema migration. Any delta under `apps/api/plane/db/migrations/` is an immediate STOP/Decision Required before runtime mutation.
- Do not alter authentication, RBAC, workspace membership, secrets, port exposure, licensing, or entitlement behavior.
- Billing/upgrade UI presentation may only be handled in separate scoped UI work; do not unlock Pro/Business features.
- No secret may be printed, committed, copied into Plane, or stored in evidence.
- Do not use `docker compose down -v`, `docker volume rm`, `docker system prune`, `restore.sh`, force-push, or history rewrite.
- Destructive data restore requires separate explicit human approval and is not part of normal image rollback.

---

### Task 1: Read-Only Repository and Runtime Preflight

**Files:**
- Read: `/home/usman/projects/platform/plane-fork/PROJECT_CONTEXT.md`
- Read: `/home/usman/projects/platform/plane-fork/WORKSTATE.md`
- Read: `/home/usman/projects/platform/plane-fork/docs/icbb/specs/2026-09-10-plane-icbb-in-place-image-cutover-design.md`
- Read: `/home/usman/projects/platform/plane-fork/docs/icbb/plans/2026-09-10-plane-icbb-in-place-image-cutover.md`
- Read: `/home/usman/projects/platform/plane/README.md`
- Read: `/home/usman/projects/platform/plane/plane-app/docker-compose.yaml`
- Read: `/home/usman/projects/platform/plane/plane-app/plane.env` only through commands that do not echo values.
- Create transient evidence directory only: `/tmp/plane-icbb-cutover-<target-sha>/`

**Interfaces:**
- Consumes: approved SPEC, both repositories, current Docker daemon, existing Plane runtime.
- Produces: exact target SHA, clean-repo proof, rendered runtime service map, persistent-service/container/volume baseline, current application image baseline, and a STOP/PASS preflight result.

- [ ] **Step 1: Verify source repository identity, branch, clean tree, and exact target SHA**

Run:

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane

test "$(git -C "$SRC" remote get-url origin)" = "git@github.com:hanavvip19-gif/icbb-plane.git"
test "$(git -C "$SRC" branch --show-current)" = "icbb/plane"
test -z "$(git -C "$SRC" status --porcelain)"
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
test "${#TARGET_SHA}" -eq 40
printf 'TARGET_SHA=%s\n' "$TARGET_SHA"
```

Expected: all assertions pass and exactly one 40-character target SHA is printed. If the tree is dirty or the branch/origin differs, STOP.

- [ ] **Step 2: Verify operations repository identity and clean tracked state**

Run:

```bash
set -euo pipefail
OPS=/home/usman/projects/platform/plane

test "$(git -C "$OPS" remote get-url origin)" = "git@github.com:hanavvip19-gif/platform-plane.git"
test "$(git -C "$OPS" branch --show-current)" = "main"
git -C "$OPS" status --short
```

Expected: no unexpected tracked modification. Untracked/generated `plane-app/` is expected to remain ignored. If tracked operations files contain unrelated WIP, STOP and report the exact paths.

- [ ] **Step 3: Create a sanitized transient evidence directory**

Run:

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
rm -rf "$EVIDENCE"
install -d -m 0700 "$EVIDENCE"
printf '%s\n' "$TARGET_SHA" > "$EVIDENCE/target-sha.txt"
git -C /home/usman/projects/platform/plane rev-parse HEAD > "$EVIDENCE/ops-sha.txt"
```

Expected: the directory exists mode `0700` and contains only non-secret Git SHAs.

- [ ] **Step 4: Render the live base Compose model without exposing environment values**

Run:

```bash
set -euo pipefail
OPS=/home/usman/projects/platform/plane
SRC=/home/usman/projects/platform/plane-fork
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"

docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml config --services \
  | sort > "$EVIDENCE/base-services.txt"
cat "$EVIDENCE/base-services.txt"
```

Expected: the existing runtime services are listed. Required service names for this plan are `web`, `admin`, `space`, `api`, `worker`, `beat-worker`, `migrator`, `live`, `proxy`, `plane-db`, `plane-redis`, `plane-mq`, and `plane-minio`. If any required service has a different name, STOP rather than silently adapting the plan.

- [ ] **Step 5: Capture current container IDs, image references, and persistent mounts**

Run:

```bash
set -euo pipefail
OPS=/home/usman/projects/platform/plane
SRC=/home/usman/projects/platform/plane-fork
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"

for svc in web admin space api worker beat-worker migrator live proxy plane-db plane-redis plane-mq plane-minio; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml ps -q "$svc")"
  test -n "$cid"
  printf '%s\t%s\t%s\t%s\n' \
    "$svc" \
    "$cid" \
    "$(docker inspect -f '{{.Config.Image}}' "$cid")" \
    "$(docker inspect -f '{{.Image}}' "$cid")"
done > "$EVIDENCE/pre-containers.tsv"

for svc in plane-db plane-redis plane-mq plane-minio; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml ps -q "$svc")"
  docker inspect -f '{{range .Mounts}}{{printf "%s\t%s\t%s\n" .Destination .Name .Source}}{{end}}' "$cid" \
    | sed "s/^/${svc}\t/"
done > "$EVIDENCE/pre-persistent-mounts.tsv"

cat "$EVIDENCE/pre-containers.tsv"
cat "$EVIDENCE/pre-persistent-mounts.tsv"
```

Expected: each service resolves to one existing container ID. Persistent mount evidence is non-empty. If a persistent service/container is absent, STOP.

- [ ] **Step 6: Capture the existing ICBB logical-data snapshot through Django ORM**

Run:

```bash
set -euo pipefail
OPS=/home/usman/projects/platform/plane
SRC=/home/usman/projects/platform/plane-fork
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"

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

result = {
    "workspace": {"id": str(ws["id"]), "name": ws["name"], "slug": ws["slug"]},
    "workspace_members": WorkspaceMember.objects.filter(workspace_id=wid).count(),
    "projects": Project.objects.filter(workspace_id=wid).count(),
    "work_items": Issue.objects.filter(workspace_id=wid).count(),
}
if "User" in models:
    result["users_global"] = models["User"].objects.count()
print(json.dumps(result, sort_keys=True))
PY

docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml exec -T api \
  python manage.py shell < "$EVIDENCE/snapshot.py" \
  | tail -n 1 > "$EVIDENCE/pre-data.json"

python3 -m json.tool "$EVIDENCE/pre-data.json"
```

Expected: exactly one `ICBB` workspace identity plus non-negative member/project/work-item counts. The file contains counts and identifiers only, no row contents or secrets.

- [ ] **Step 7: Capture upload count and local HTTP health**

Run:

```bash
set -euo pipefail
OPS=/home/usman/projects/platform/plane
SRC=/home/usman/projects/platform/plane-fork
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"

minio_cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml ps -q plane-minio)"
docker exec "$minio_cid" sh -c 'find /export -type f 2>/dev/null | wc -l' > "$EVIDENCE/pre-upload-file-count.txt"

curl --fail --location --silent --show-error --max-time 20 \
  http://127.0.0.1:18080/ -o /dev/null
printf 'HTTP_LOCAL=PASS\n' > "$EVIDENCE/pre-http.txt"
```

Expected: upload count is numeric and local HTTP returns success.

- [ ] **Step 8: Verify no migration delta exists for the target branch**

Run:

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

git diff --name-only "$BASE_SHA..$TARGET_SHA" -- apps/api/plane/db/migrations \
  | tee "/tmp/plane-icbb-cutover-${TARGET_SHA}/migration-delta.txt"

test ! -s "/tmp/plane-icbb-cutover-${TARGET_SHA}/migration-delta.txt"
```

Expected: empty migration delta. If non-empty, STOP and return `DECISION REQUIRED: MIGRATION REVIEW`; do not build/deploy under this plan.

- [ ] **Step 9: Record preflight result**

Run:

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
printf 'PREFLIGHT=PASS\n' > "/tmp/plane-icbb-cutover-${TARGET_SHA}/preflight.result"
```

Expected: PASS only after Steps 1–8 succeed.

- [ ] **Step 10: Checkpoint report; do not mutate runtime yet**

Report exactly:

```text
TASK 1 PREFLIGHT: PASS|FAIL
TARGET SHA: <sha>
SOURCE TREE: CLEAN|DIRTY
OPS TREE: CLEAN|BLOCKED_BY_WIP
MIGRATION DELTA: EMPTY|NON_EMPTY
PERSISTENT BASELINE: CAPTURED|FAILED
ICBB DATA BASELINE: CAPTURED|FAILED
HTTP BASELINE: PASS|FAIL
NEXT GATE: BUILD AUTHORIZED|DECISION REQUIRED
```

Expected: runtime application containers are still untouched at this checkpoint.

---

### Task 2: Build SHA-Traceable Fork Application Images

**Files:**
- No source file modification required.
- Create local Docker images only.
- Evidence: `/tmp/plane-icbb-cutover-<target-sha>/built-images.tsv`

**Interfaces:**
- Consumes: Task 1 PASS and clean exact target SHA.
- Produces: `web`, `admin`, `space`, shared `api`, and `live` images tagged `git-<12-char-sha>` with matching OCI labels.

- [ ] **Step 1: Re-check the source SHA immediately before build**

Run:

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
cd "$SRC"
test "$(git branch --show-current)" = "icbb/plane"
test -z "$(git status --porcelain)"
TARGET_SHA="$(git rev-parse HEAD)"
test -f "/tmp/plane-icbb-cutover-${TARGET_SHA}/preflight.result"
grep -qx 'PREFLIGHT=PASS' "/tmp/plane-icbb-cutover-${TARGET_SHA}/preflight.result"
TAG="git-${TARGET_SHA:0:12}"
printf '%s %s\n' "$TARGET_SHA" "$TAG"
```

Expected: same SHA as Task 1 and clean tree.

- [ ] **Step 2: Build `web` image with provenance labels**

Run:

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane-fork
TARGET_SHA="$(git rev-parse HEAD)"; TAG="git-${TARGET_SHA:0:12}"
docker build \
  --label "org.opencontainers.image.source=https://github.com/hanavvip19-gif/icbb-plane" \
  --label "org.opencontainers.image.revision=${TARGET_SHA}" \
  --label "org.opencontainers.image.version=${TAG}" \
  -t "icbb-plane/web:${TAG}" \
  -f apps/web/Dockerfile.web .
```

Expected: build succeeds and local image `icbb-plane/web:${TAG}` exists.

- [ ] **Step 3: Build `admin` image**

Run the same label contract with:

```bash
docker build \
  --label "org.opencontainers.image.source=https://github.com/hanavvip19-gif/icbb-plane" \
  --label "org.opencontainers.image.revision=${TARGET_SHA}" \
  --label "org.opencontainers.image.version=${TAG}" \
  -t "icbb-plane/admin:${TAG}" \
  -f apps/admin/Dockerfile.admin .
```

Expected: build succeeds.

- [ ] **Step 4: Build `space` image**

Run:

```bash
docker build \
  --label "org.opencontainers.image.source=https://github.com/hanavvip19-gif/icbb-plane" \
  --label "org.opencontainers.image.revision=${TARGET_SHA}" \
  --label "org.opencontainers.image.version=${TAG}" \
  -t "icbb-plane/space:${TAG}" \
  -f apps/space/Dockerfile.space .
```

Expected: build succeeds.

- [ ] **Step 5: Build the shared API image once**

Run:

```bash
docker build \
  --label "org.opencontainers.image.source=https://github.com/hanavvip19-gif/icbb-plane" \
  --label "org.opencontainers.image.revision=${TARGET_SHA}" \
  --label "org.opencontainers.image.version=${TAG}" \
  -t "icbb-plane/api:${TAG}" \
  -f apps/api/Dockerfile.api apps/api
```

Expected: build succeeds. This exact image will be used by `api`, `worker`, `beat-worker`, and `migrator` when a migration run is separately authorized.

- [ ] **Step 6: Build `live` image**

Run:

```bash
docker build \
  --label "org.opencontainers.image.source=https://github.com/hanavvip19-gif/icbb-plane" \
  --label "org.opencontainers.image.revision=${TARGET_SHA}" \
  --label "org.opencontainers.image.version=${TAG}" \
  -t "icbb-plane/live:${TAG}" \
  -f apps/live/Dockerfile.live .
```

Expected: build succeeds.

- [ ] **Step 7: Verify every image label and record immutable image IDs**

Run:

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"; TAG="git-${TARGET_SHA:0:12}"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
: > "$EVIDENCE/built-images.tsv"
for component in web admin space api live; do
  ref="icbb-plane/${component}:${TAG}"
  rev="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$ref")"
  src="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.source"}}' "$ref")"
  ver="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$ref")"
  test "$rev" = "$TARGET_SHA"
  test "$src" = 'https://github.com/hanavvip19-gif/icbb-plane'
  test "$ver" = "$TAG"
  printf '%s\t%s\t%s\n' "$component" "$ref" "$(docker image inspect -f '{{.Id}}' "$ref")" >> "$EVIDENCE/built-images.tsv"
done
cat "$EVIDENCE/built-images.tsv"
```

Expected: all five components pass provenance checks.

- [ ] **Step 8: Run source-side verification before deployment**

Run the repository verification contract first:

```bash
cd /home/usman/projects/platform/plane-fork
python3 -m json.tool .ai/repository.json >/dev/null
python3 -m json.tool .ai/verification-profile.json >/dev/null
git diff --check
```

Then execute the applicable repository-native build/test checks documented by the source repository for the components built. If a component build succeeded but its required repository-native checks fail, STOP before deployment and report the exact failing command/output.

- [ ] **Step 9: Checkpoint report**

Report:

```text
TASK 2 BUILD: PASS|FAIL
TARGET SHA: <sha>
WEB IMAGE: <ref> <image-id>
ADMIN IMAGE: <ref> <image-id>
SPACE IMAGE: <ref> <image-id>
API IMAGE: <ref> <image-id>
LIVE IMAGE: <ref> <image-id>
PROVENANCE LABELS: PASS|FAIL
SOURCE VERIFICATION: PASS|FAIL
NEXT GATE: OPERATIONS OVERRIDE|BLOCKED
```

---

### Task 3: Create and Verify the Operations Image Override

**Files:**
- Create: `/home/usman/projects/platform/plane/compose.icbb.override.yaml`
- Modify: `/home/usman/projects/platform/plane/README.md`
- Do not modify: `/home/usman/projects/platform/plane/plane-app/plane.env`
- Do not modify persistent-service definitions in `plane-app/docker-compose.yaml`.

**Interfaces:**
- Consumes: Task 2 PASS and exact `TAG`.
- Produces: one versioned non-secret override pinning application services to fork images, plus a rendered-config proof that persistent services are unchanged.

- [ ] **Step 1: Create the exact SHA-pinned override**

From the source repository, resolve:

```bash
TARGET_SHA="$(git -C /home/usman/projects/platform/plane-fork rev-parse HEAD)"
TAG="git-${TARGET_SHA:0:12}"
printf '%s\n' "$TAG"
```

Create `/home/usman/projects/platform/plane/compose.icbb.override.yaml` with these service mappings, replacing `<TAG>` with the exact printed tag before saving:

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

Expected: the file contains no secrets, volumes, ports, networks, build directives, `proxy`, or persistent-service definitions.

- [ ] **Step 2: Validate override syntax and resolved image refs**

Run:

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane
docker compose --env-file plane-app/plane.env \
  -f plane-app/docker-compose.yaml \
  -f compose.icbb.override.yaml \
  config --quiet

docker compose --env-file plane-app/plane.env \
  -f plane-app/docker-compose.yaml \
  -f compose.icbb.override.yaml \
  config --images | sort
```

Expected: parse succeeds and custom refs appear only for application services listed in the override.

- [ ] **Step 3: Prove persistent-service rendered definitions are unchanged**

Run:

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml config --format json > "$TMP/base.json"
docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml config --format json > "$TMP/target.json"

python3 - "$TMP/base.json" "$TMP/target.json" <<'PY'
import json, sys
base = json.load(open(sys.argv[1]))
target = json.load(open(sys.argv[2]))
for name in ["plane-db", "plane-redis", "plane-mq", "plane-minio", "proxy"]:
    if name not in base.get("services", {}) or name not in target.get("services", {}):
        raise SystemExit(f"missing required service: {name}")
    if base["services"][name] != target["services"][name]:
        raise SystemExit(f"override unexpectedly changes protected service: {name}")
if base.get("volumes", {}) != target.get("volumes", {}):
    raise SystemExit("override unexpectedly changes volumes")
print("PERSISTENT_RENDER_DIFF=PASS")
PY
```

Expected: `PERSISTENT_RENDER_DIFF=PASS`. Any difference in protected services or volumes is a STOP.

- [ ] **Step 4: Update the operations README with the two-file lifecycle commands**

Add a section documenting only these non-secret commands:

```bash
docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml config --quiet
docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ps
```

Also state explicitly that normal custom-image cutover/rollback must never use `down -v` and that `restore.sh` is not an image rollback mechanism.

- [ ] **Step 5: Commit operations documentation/config only**

Run:

```bash
cd /home/usman/projects/platform/plane
git diff --check
git status --short
git add compose.icbb.override.yaml README.md
git diff --cached --check
git commit -m "ops: pin Plane ICBB fork application images"
```

Expected: commit contains only `compose.icbb.override.yaml` and `README.md`; no `plane-app/`, secret, backup, or generated runtime content is tracked.

---

### Task 4: Create Exact Local Rollback Image References and Backup Checkpoint

**Files:**
- Create transient rollback override only: `/tmp/plane-icbb-cutover-<target-sha>/compose.rollback.yaml`
- Create normal Plane backup using existing operator tooling.
- No persistent configuration change yet.

**Interfaces:**
- Consumes: Task 1 pre-container evidence and Task 3 validated override.
- Produces: immutable local rollback tags for current application images, rollback override, and a verified backup checkpoint.

- [ ] **Step 1: Tag each currently running application image for rollback**

Run:

```bash
set -euo pipefail
OPS=/home/usman/projects/platform/plane
SRC=/home/usman/projects/platform/plane-fork
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
cd "$OPS"

for svc in web admin space api worker beat-worker live; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml ps -q "$svc")"
  image_id="$(docker inspect -f '{{.Image}}' "$cid")"
  docker image tag "$image_id" "icbb-plane-rollback/${svc}:pre-${STAMP}"
  printf '%s\t%s\t%s\n' "$svc" "icbb-plane-rollback/${svc}:pre-${STAMP}" "$image_id"
done > "$EVIDENCE/rollback-images.tsv"

cat "$EVIDENCE/rollback-images.tsv"
```

Expected: every pre-cutover application image has an exact local rollback tag.

- [ ] **Step 2: Generate rollback override from the captured local tags**

Run:

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
python3 - "$EVIDENCE/rollback-images.tsv" "$EVIDENCE/compose.rollback.yaml" <<'PY'
import sys
rows = {}
for line in open(sys.argv[1]):
    svc, ref, _ = line.rstrip("\n").split("\t")
    rows[svc] = ref
with open(sys.argv[2], "w") as f:
    f.write("services:\n")
    for svc in ["web", "admin", "space", "api", "worker", "beat-worker", "live"]:
        f.write(f"  {svc}:\n    image: {rows[svc]}\n    pull_policy: never\n")
PY
cat "$EVIDENCE/compose.rollback.yaml"
```

Expected: rollback override changes application image refs only.

- [ ] **Step 3: Render-validate the rollback override without recreating anything**

Run:

```bash
cd /home/usman/projects/platform/plane
SRC=/home/usman/projects/platform/plane-fork
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
docker compose --env-file plane-app/plane.env \
  -f plane-app/docker-compose.yaml \
  -f "$EVIDENCE/compose.rollback.yaml" \
  config --quiet
```

Expected: PASS.

- [ ] **Step 4: Create a fresh backup using the existing approved backup helper**

Run:

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane
env -u DEBUG ./setup.sh backup
ls -1dt plane-app/backup/* | head -n 1
```

Expected: backup command succeeds and a newest backup path exists. Do not run `restore.sh`.

- [ ] **Step 5: Human cutover gate**

Before Task 5, report preflight/build/override/rollback/backup evidence and require explicit approval to mutate the live application containers. This gate is mandatory because the next task changes production-like runtime service containers.

---

### Task 5: Perform the In-Place Application Image Cutover

**Files:**
- Runtime mutation only through existing Compose + `compose.icbb.override.yaml`.
- No persistent-service file or data mutation.

**Interfaces:**
- Consumes: Tasks 1–4 PASS and explicit human cutover approval.
- Produces: existing Plane application services recreated on fork-built SHA-pinned images while persistent services retain existing container/mount identities.

- [ ] **Step 1: Re-validate protected resources immediately before cutover**

Run Task 1 Steps 5–8 again and compare against the saved preflight evidence. If the `ICBB` workspace identity changes, counts decrease, persistent container IDs/mounts change unexpectedly, target source SHA changes, or migration delta becomes non-empty, STOP.

- [ ] **Step 2: Recreate only application services with no dependency recreation**

Run:

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane

docker compose --env-file plane-app/plane.env \
  -f plane-app/docker-compose.yaml \
  -f compose.icbb.override.yaml \
  up -d --no-deps --pull never --force-recreate \
  api worker beat-worker live web admin space
```

Expected: only the seven named application services are recreated. `plane-db`, `plane-redis`, `plane-mq`, `plane-minio`, `proxy`, and volumes are not recreated.

- [ ] **Step 3: Check runtime status and application logs**

Run:

```bash
set -euo pipefail
cd /home/usman/projects/platform/plane
docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ps

docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml \
  logs --tail=200 api worker beat-worker live web admin space
```

Expected: services reach expected running/healthy state and logs show no unrecovered database, broker, object-storage, migration, import, or startup failure.

- [ ] **Step 4: Prove live application containers use the exact fork images**

Run:

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"; TAG="git-${TARGET_SHA:0:12}"
cd "$OPS"

for svc in web admin space api worker beat-worker live; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ps -q "$svc")"
  image_id="$(docker inspect -f '{{.Image}}' "$cid")"
  rev="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id")"
  test "$rev" = "$TARGET_SHA"
  printf '%s\t%s\t%s\n' "$svc" "$cid" "$image_id"
done
```

Expected: every live cutover service has revision label equal to the exact target SHA.

- [ ] **Step 5: Prove protected container IDs and persistent mounts did not change**

Capture post-cutover IDs/mounts using Task 1 Step 5 and compare only protected services:

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"

for svc in plane-db plane-redis plane-mq plane-minio proxy; do
  cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ps -q "$svc")"
  printf '%s\t%s\n' "$svc" "$cid"
done > "$EVIDENCE/post-protected-containers.tsv"

python3 - "$EVIDENCE/pre-containers.tsv" "$EVIDENCE/post-protected-containers.tsv" <<'PY'
import sys
pre = {}
for line in open(sys.argv[1]):
    svc, cid, *_ = line.rstrip("\n").split("\t")
    if svc in {"plane-db", "plane-redis", "plane-mq", "plane-minio", "proxy"}:
        pre[svc] = cid
post = dict(line.rstrip("\n").split("\t") for line in open(sys.argv[2]))
if pre != post:
    raise SystemExit(f"protected container identity changed: pre={pre} post={post}")
print("PROTECTED_CONTAINER_IDENTITY=PASS")
PY
```

Then recapture persistent mounts and compare the file byte-for-byte with `pre-persistent-mounts.tsv`. Expected: PASS.

- [ ] **Step 6: Verify local HTTP immediately**

Run:

```bash
curl --fail --location --silent --show-error --max-time 20 \
  http://127.0.0.1:18080/ -o /dev/null
```

Expected: success.

If Steps 2–6 fail, execute Task 7 rollback immediately before doing unrelated debugging.

---

### Task 6: Verify Existing Data Continuity and Acceptance Criteria

**Files:**
- Evidence only under `/tmp/plane-icbb-cutover-<target-sha>/`.

**Interfaces:**
- Consumes: live fork-image runtime from Task 5 and Task 1 baseline.
- Produces: post-cutover logical-data snapshot, upload count, image provenance evidence, and acceptance PASS/FAIL.

- [ ] **Step 1: Capture the post-cutover logical-data snapshot**

Repeat Task 1 Step 6 against the live API container and save the JSON as `post-data.json`.

- [ ] **Step 2: Compare workspace identity and counts with no-fake-zero semantics**

Run:

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
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

Expected: same workspace identity and no unexplained count decrease. Increases are allowed because normal concurrent activity may occur.

- [ ] **Step 3: Compare attachment/upload file count**

Run:

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"
minio_cid="$(docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ps -q plane-minio)"
docker exec "$minio_cid" sh -c 'find /export -type f 2>/dev/null | wc -l' > "$EVIDENCE/post-upload-file-count.txt"
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

- [ ] **Step 4: Verify there is still only one Plane runtime project for the existing stack**

Run:

```bash
docker compose ls --format json | python3 -m json.tool
```

Inspect the output together with the protected container labels from the existing runtime. PASS requires no newly-created second Plane persistent Compose project attributable to this cutover.

- [ ] **Step 5: Verify billing/licensing boundary by diff**

Run:

```bash
cd /home/usman/projects/platform/plane-fork
BASE_SHA="$(python3 - <<'PY'
import json
print(json.load(open('.ai/repository.json'))['last_synced_sha'])
PY
)"
TARGET_SHA="$(git rev-parse HEAD)"
git diff --name-status "$BASE_SHA..$TARGET_SHA"
```

Expected for this foundation cutover: no entitlement/license bypass change. If future source changes include billing/upgrade UI, independently verify they are presentation-only and do not modify server-side entitlement checks or expose Pro/Business behavior.

- [ ] **Step 6: Produce final verification result**

Report exactly:

```text
MIGRATION: N/A — migration delta empty
UNIT/SOURCE CHECKS: PASS|FAIL
INTEGRATION: PASS|FAIL
SECURITY: PASS|FAIL
REGRESSION: PASS|FAIL
FRONTEND BUILD: PASS|FAIL
E2E/HTTP: PASS|FAIL
IMAGE PROVENANCE: PASS|FAIL
PERSISTENT CONTAINER IDENTITY: PASS|FAIL
PERSISTENT MOUNT CONTINUITY: PASS|FAIL
ICBB WORKSPACE IDENTITY: PASS|FAIL
USER/MEMBER DATA CONTINUITY: PASS|FAIL
PROJECT/WORK-ITEM DATA CONTINUITY: PASS|FAIL
ATTACHMENT CONTINUITY: PASS|FAIL
LICENSING/ENTITLEMENT BOUNDARY: PASS|FAIL
ACCEPTANCE CRITERIA: PASS|FAIL
UNRELATED CHANGES: NONE|EXPLAIN
```

A single FAIL means the cutover is not DONE.

---

### Task 7: Roll Back Application Images if Verification Fails

**Files:**
- Use transient `/tmp/plane-icbb-cutover-<target-sha>/compose.rollback.yaml`.
- Do not restore persistent data unless separately approved.

**Interfaces:**
- Consumes: Task 4 rollback override and failed Task 5/6 verification.
- Produces: application services returned to exact pre-cutover image IDs while persistent services remain untouched.

- [ ] **Step 1: Recreate only application services from rollback override**

Run:

```bash
set -euo pipefail
SRC=/home/usman/projects/platform/plane-fork
OPS=/home/usman/projects/platform/plane
TARGET_SHA="$(git -C "$SRC" rev-parse HEAD)"
EVIDENCE="/tmp/plane-icbb-cutover-${TARGET_SHA}"
cd "$OPS"

docker compose --env-file plane-app/plane.env \
  -f plane-app/docker-compose.yaml \
  -f "$EVIDENCE/compose.rollback.yaml" \
  up -d --no-deps --pull never --force-recreate \
  api worker beat-worker live web admin space
```

Expected: only named application services are recreated back to local rollback images.

- [ ] **Step 2: Verify protected persistent container IDs still match pre-cutover evidence**

Repeat Task 5 Step 5. Expected: PASS.

- [ ] **Step 3: Verify HTTP and logical data after rollback**

Repeat Task 1 Steps 6–7 and compare against `pre-data.json` / `pre-upload-file-count.txt`. Expected: same workspace identity, no count decrease, local HTTP PASS.

- [ ] **Step 4: Report rollback**

Report:

```text
ROLLBACK: PASS|FAIL
APPLICATION IMAGES: PRE-CUTOVER RESTORED|FAILED
PERSISTENT SERVICES: UNCHANGED|CHANGED
ICBB DATA CONTINUITY: PASS|FAIL
HTTP: PASS|FAIL
RESTORE.SH USED: NO
DECISION REQUIRED: YES
```

Do not continue forward after rollback without a new diagnosis and human decision.

---

### Task 8: Close Tracking and Promote Verified Learning

**Files:**
- Modify: `/home/usman/projects/platform/plane-fork/WORKSTATE.md`
- Modify durable Obsidian Plane ICBB knowledge/decision history only with verified reusable findings.
- Update Plane `PLAT-11` with final repository SHA, operations commit SHA, deployed image SHA, verification result, and rollback state.

**Interfaces:**
- Consumes: successful Task 6 or Task 7 rollback result.
- Produces: repository state aligned with actual runtime, Plane tracking aligned with execution, and durable verified learning promoted to Obsidian.

- [ ] **Step 1: Review both repository diffs and statuses**

Run:

```bash
git -C /home/usman/projects/platform/plane-fork status --short
git -C /home/usman/projects/platform/plane status --short
git -C /home/usman/projects/platform/plane-fork log -1 --oneline
git -C /home/usman/projects/platform/plane log -1 --oneline
```

Expected: no unrelated changes.

- [ ] **Step 2: Update `WORKSTATE.md` to the actual verified state**

Record target SHA, operations commit SHA, PASS/FAIL, exact deployed image set, whether rollback was needed, and the exact next action. Do not claim DONE unless Task 6 acceptance is PASS.

- [ ] **Step 3: Sync Plane `PLAT-11`**

Set status based on evidence only:

- successful cutover and all acceptance PASS → Done;
- implementation complete but verification pending → Testing/Review equivalent available in the current Plane workflow;
- failed verification with successful rollback → Blocked/Decision Required in description and keep non-Done state;
- preflight blocker → Todo/Backlog with blocker evidence.

Do not create a duplicate tracking item.

- [ ] **Step 4: Promote durable learning to Obsidian**

Write only verified reusable findings, such as actual service-image mapping, runtime override behavior, persistence invariants, rollback evidence, or Compose edge cases. Link learning to `[[Plane ICBB Decision Log]]`. Do not store raw logs, secrets, transient container IDs, or one-off debugging noise as durable knowledge.

- [ ] **Step 5: Final report**

Return:

```text
REPOSITORY: hanavvip19-gif/icbb-plane
BRANCH: icbb/plane
SOURCE SHA: <sha>
OPERATIONS REPOSITORY: hanavvip19-gif/platform-plane
OPERATIONS SHA: <sha>
PLANE ITEM: PLAT-11
CUTOVER: PASS|FAIL|ROLLED_BACK
MIGRATION: PASS|FAIL|N/A
UNIT/SOURCE CHECKS: PASS|FAIL|N/A
INTEGRATION: PASS|FAIL
SECURITY: PASS|FAIL
REGRESSION: PASS|FAIL
FRONTEND BUILD: PASS|FAIL|N/A
E2E: PASS|FAIL
ACCEPTANCE CRITERIA: PASS|FAIL
UNRELATED CHANGES: NONE|EXPLAIN
NEW LEARNINGS: <verified durable findings only>
OBSIDIAN SYNC: DONE|NOT NEEDED|REQUIRED
PLANE SYNC: DONE|REQUIRED
```

## Definition of Done

This work is DONE only when:

- the application images running in the existing Plane runtime are traceable to one exact `icbb/plane` Git SHA;
- all protected persistent container/mount identities remain unchanged;
- `ICBB` workspace identity and logical-data continuity checks pass;
- attachment/upload continuity passes;
- local HTTP and required application services are healthy;
- no unreviewed migration, auth/RBAC, entitlement, secret, network, or persistent-stack change was introduced;
- rollback references remain available until acceptance;
- both repositories have no unrelated changes;
- Plane `PLAT-11` reflects actual execution status;
- verified reusable learning is promoted to Obsidian, and transient logs are not.
