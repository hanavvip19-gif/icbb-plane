# Plane ICBB In-Place Image Cutover Design

**Status:** APPROVED DESIGN — derived from `APPROVED ARCHITECTURE DECISION — 2026-09-10`

**Date:** 2026-09-10

**Plane tracking:** `PLAT-11` — Plane ICBB — in-place fork image cutover

## 1. Objective

Make `hanavvip19-gif/icbb-plane` branch `icbb/plane` the authoritative source/build line for Plane ICBB application images while keeping the existing `/home/usman/projects/platform/plane` installation, persistent resources, workspace, users, projects/work-items, attachments, secrets, domain, and gateway intact.

This is an in-place application-image cutover. It is not a second Plane installation and it must not initialize a second persistent stack.

## 2. Grounded Baseline

At design time:

- Source/build repository: `hanavvip19-gif/icbb-plane`.
- Source/build branch: `icbb/plane`.
- Observed source/build HEAD: `3846cfda7efc99fa5cc8c6beafc70df8ddf6e99e`.
- Operations repository: `hanavvip19-gif/platform-plane`.
- Operations branch: `main`.
- Observed operations HEAD: `76b6bd098112521ff7885f9898d488c4c3016764`.
- Runtime location: `/home/usman/projects/platform/plane`.
- Existing runtime Compose: `/home/usman/projects/platform/plane/plane-app/docker-compose.yaml`.
- Existing fork metadata confirms the operations repository remains `/home/usman/projects/platform/plane`.
- Existing operations documentation confirms the `ICBB` workspace already exists and persisted through a controlled restart.

The executor MUST re-ground branch HEADs and runtime state immediately before execution. These SHAs are design-time evidence, not permission to deploy a stale build if the branch has advanced.

## 3. Source-of-Truth Boundary

### Repository engineering truth

This design and its implementation plan in `icbb-plane` define the approved engineering contract for the cutover.

### Source/build responsibility

`icbb-plane@icbb/plane` owns:

- Plane source customization;
- application image builds;
- build provenance tied to an exact Git SHA;
- source-side tests and build verification;
- upstream-sync review before future source rebases/merges.

### Deployment/operations responsibility

`/home/usman/projects/platform/plane` owns:

- the existing Plane runtime;
- existing `plane-app/plane.env` secrets;
- official generated runtime Compose baseline;
- runtime image override configuration;
- start/stop/recreate commands;
- backup/rollback runbook;
- verification of running containers and persistent data continuity.

Plane is execution tracking only. Obsidian preserves durable decision history and promoted learning.

## 4. Confirmed Requirements

1. `icbb-plane` branch `icbb/plane` is the primary source/build line for Plane ICBB.
2. `/home/usman/projects/platform/plane` remains the deployment/operations repository.
3. The cutover is in-place; no second Plane installation is allowed.
4. Existing PostgreSQL, volumes, MinIO, Valkey, RabbitMQ, workspace, users, projects/work-items, attachments, secrets, domain, and gateway remain the single persistent/runtime data plane.
5. No new database, persistent stack, workspace, or administrator may be created for the cutover.
6. Only application services that require the fork may change image.
7. Every custom image must be traceable to the exact deployed `icbb/plane` Git SHA.
8. PASS requires proof that live containers use the intended custom image and that existing data remains intact.
9. Billing/upgrade presentation may be hidden for the internal Community deployment, but licensing/entitlement bypass and Pro/Business feature unlocks are forbidden.
10. Rollback to the previous known-good application image must be available without persistent-data loss.

## 5. Runtime Architecture

### 5.1 Persistent services — immutable during cutover

The executor must discover the exact live service and volume names from the current operations Compose before mutation. Services providing the following capabilities are persistent and MUST NOT be recreated as a new stack, renamed, reinitialized, or pointed to new storage:

- PostgreSQL;
- Valkey/Redis;
- RabbitMQ;
- MinIO/object storage;
- named volumes backing database/cache/message-broker/uploads.

Existing source Compose uses `plane-db`, `plane-redis`, `plane-mq`, and `plane-minio` with named volumes. The generated operations Compose remains authoritative for the live service names.

### 5.2 Fork-owned application services

The source Compose shows these application build boundaries:

- `web` → `apps/web/Dockerfile.web`;
- `admin` → `apps/admin/Dockerfile.admin`;
- `space` → `apps/space/Dockerfile.space`;
- `api` / `worker` / `beat-worker` / `migrator` → shared `apps/api/Dockerfile.api`;
- `live` → `apps/live/Dockerfile.live`;
- `proxy` → `apps/proxy/Dockerfile.ce`.

The initial cutover may replace `web`, `admin`, `space`, `api`, `worker`, `beat-worker`, `migrator`, and `live` with fork-built images after the runtime service map is confirmed. `proxy` remains on the existing known-good image unless a fork change actually requires proxy code/config; changing it merely for uniformity is out of scope.

### 5.3 API image reuse

`api`, `worker`, `beat-worker`, and `migrator` MUST use the same fork-built API image for a given Git SHA because they share the same source Dockerfile. This prevents image drift among processes using the same Django codebase.

## 6. Image Provenance Contract

Every fork-built image must carry both a deterministic tag and OCI provenance labels.

Tag format:

`icbb-plane/<component>:git-<12-char-sha>`

Required labels:

- `org.opencontainers.image.source=https://github.com/hanavvip19-gif/icbb-plane`
- `org.opencontainers.image.revision=<full-40-char-sha>`
- `org.opencontainers.image.version=git-<12-char-sha>`

Before deployment, the executor must verify the label values using `docker image inspect`. A tag without matching revision labels is not deployable.

The deployment override must pin immutable SHA-derived tags; `latest`, floating branch tags, and unqualified local image names are forbidden for the cutover.

## 7. Deployment Override Contract

Do not edit generated persistent topology to create a parallel stack. The operations repository will hold one safe, versioned, non-secret override file at:

`/home/usman/projects/platform/plane/compose.icbb.override.yaml`

The override may replace only application-service `image` values and must set `pull_policy: never` for local SHA-pinned images unless a future approved registry workflow replaces this local-build model.

The runtime command must always use both files:

`docker compose --env-file plane-app/plane.env -f plane-app/docker-compose.yaml -f compose.icbb.override.yaml ...`

The override must not define volumes, databases, credentials, ports, networks, workspace bootstrap, or a second proxy stack.

## 8. Migration and Compatibility Gate

This foundation cutover does not authorize schema changes.

Before building/deploying, compare the exact target SHA against the currently deployed/vendor source baseline for paths under `apps/api/plane/db/migrations/`.

- If there is no migration delta: the cutover may continue.
- If any migration file is added, removed, or modified: STOP before runtime mutation and create a separate migration review covering forward migration, compatibility window, rollback, data invariants, and backup requirements.

Running a `migrator` container does not itself authorize new migrations.

## 9. Pre-Cutover Evidence Snapshot

Before changing application containers, capture a sanitized evidence bundle containing:

- target Git SHA;
- operations repository HEAD;
- rendered Compose service names;
- current container names, images, image IDs, and health/status;
- persistent volume names and Docker volume IDs/mountpoints;
- database/workspace/project/work-item/user counts obtainable read-only from the existing application;
- identity of the `ICBB` workspace;
- attachment/upload file-count evidence from the existing uploads volume, without copying or printing file contents;
- HTTP health result for `http://127.0.0.1:18080`;
- current known-good application image references used for rollback.

Secrets, raw environment values, database rows, attachment contents, authentication tokens, and password hashes must not be written to the evidence bundle.

## 10. Cutover Procedure Semantics

1. Build fork images from an exact clean `icbb/plane` commit.
2. Verify image labels and immutable tags.
3. Take/verify the pre-cutover evidence snapshot and existing backup mechanism.
4. Render the two-file Compose model and prove persistent services/volumes are unchanged.
5. Recreate only application services whose images are overridden.
6. Do not use `docker compose down -v`, volume prune, system prune, destructive restore, or any command that removes persistent volumes.
7. Verify application health and data continuity.
8. Keep rollback images locally until the cutover is explicitly accepted.

## 11. Data-Continuity Invariants

A cutover fails if any of these invariants cannot be established:

- the same existing PostgreSQL volume remains mounted to the live database service;
- the same existing MinIO/uploads volume remains mounted;
- the same existing Valkey and RabbitMQ persistent resources remain attached where the runtime uses persistent volumes;
- the existing `ICBB` workspace still resolves to the same identity;
- user/project/work-item counts do not unexpectedly decrease;
- pre-existing attachments remain addressable;
- existing domain/gateway routing still reaches the same Plane installation;
- no second Plane Compose project or second persistent service set appears.

Count increases caused by normal concurrent user activity do not fail verification; decreases or identity changes require investigation and rollback/decision.

## 12. Licensing and Feature Boundary

Allowed:

- hide Community-deployment billing/upgrade navigation or presentation when it is purely UI presentation;
- apply ICBB branding and Community-compatible UI customizations under separate approved feature work.

Forbidden:

- bypass server-side entitlement checks;
- spoof license state;
- patch feature gates to expose Pro/Business behavior;
- copy proprietary Enterprise/Commercial code into this Community fork;
- represent hidden billing UI as a license change.

Any future request that touches entitlement behavior requires a new explicit architecture/security/legal review.

## 13. Security Requirements

- Never commit or print `plane-app/plane.env` secrets.
- Do not change authentication, workspace membership, permissions, or admin identities as part of this cutover.
- Preserve loopback-only host exposure unless a separate gateway/public-routing decision authorizes otherwise.
- Preserve existing gateway/domain ownership.
- Do not expose PostgreSQL, Valkey, RabbitMQ, MinIO, or internal admin ports.
- Evidence must be sanitized and must contain identifiers/counts, not secret-bearing payloads.

## 14. Failure, Retry, and Rollback

### Fail closed before mutation

Stop before cutover if:

- target Git SHA is not clean/traceable;
- source or operations repository state conflicts with this design;
- target migration delta is non-empty;
- existing persistent resource identities cannot be captured;
- backup/known-good image references cannot be established;
- rendered override changes a persistent service, volume, port, network, or secret contract unexpectedly.

### Rollback

Rollback changes only application image references back to the captured previous known-good values and recreates only affected application services. Persistent resources must remain mounted and untouched.

A rollback is not allowed to use `restore.sh` unless there is separate human approval for destructive data restoration. Image rollback should not require data restoration when this design is followed.

## 15. Scope

### In scope

- source/build provenance;
- custom application image build;
- non-secret operations override;
- in-place application container replacement;
- pre/post evidence capture;
- rollback to previous images;
- verification of existing data continuity.

### Non-scope

- new Plane installation;
- new database, volumes, MinIO, Valkey, RabbitMQ, workspace, or admin;
- upstream sync;
- schema migration;
- auth/RBAC redesign;
- domain/gateway redesign;
- Pro/Business feature enablement;
- unrelated UI/branding changes;
- destructive data restore.

## 16. Acceptance Criteria

The cutover is PASS only when all are true:

1. The deployed application image set is built from one exact `icbb/plane` Git SHA and every image exposes matching OCI revision labels.
2. Live application containers use the intended SHA-pinned custom images.
3. Existing persistent service containers/volumes are not replaced by a second stack and retain their pre-cutover identities.
4. The existing `ICBB` workspace identity is unchanged.
5. Existing users, projects/work-items, and attachments remain available; no unexplained count decrease is observed.
6. `http://127.0.0.1:18080` returns healthy application responses after cutover.
7. Existing gateway/domain routing remains functional if tested within the authorized runtime environment.
8. No licensing/entitlement bypass is introduced.
9. Previous known-good image references remain available and rollback procedure has been dry-validated at the Compose-render level.
10. Verification evidence identifies the deployed Git SHA, image IDs, persistent resource identities, and PASS/FAIL result without exposing secrets.

## 17. Repository and Tracking Promotion

- Approved design: this file.
- Implementation HOW: `docs/icbb/plans/2026-09-10-plane-icbb-in-place-image-cutover.md`.
- Execution/status/dependencies: Plane `PLAT-11`.
- Durable decision history and verified reusable learning: Obsidian `AI Development/Plane ICBB Decision Log.md` and linked durable learning notes.
