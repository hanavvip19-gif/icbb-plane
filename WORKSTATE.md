# WORKSTATE

## Active Task

PLAT-11 — Plane ICBB in-place fork image cutover.

## Current Objective

Execute the approved in-place Plane ICBB application-image cutover using SHA-traceable images built from `hanavvip19-gif/icbb-plane@icbb/plane`, while preserving the existing `/home/usman/projects/platform/plane` persistent runtime and data plane.

## Current Phase

**EXECUTING TASKS 1–4 — PREFLIGHT, BUILD, OPS OVERRIDE, ROLLBACK & BACKUP CHECKPOINT (STOP BEFORE TASK 5).**

Runtime container recreation (Task 5) is not yet authorized. The mandatory human cutover gate remains at the end of Task 4 in the implementation plan.

## Completed

- True development fork verified as `hanavvip19-gif/icbb-plane`.
- Customization branch verified as `icbb/plane`.
- Operations/deployment repository verified as `hanavvip19-gif/platform-plane`, local runtime path `/home/usman/projects/platform/plane`.
- Connector verification on 2026-09-10 passed for Obsidian Knowledge, Plane ICBB, and GitHub.
- Superpowers `writing-plans` and `verification-before-completion` methodology applied to planning/verification.
- Durable architecture decision recorded in Obsidian at `AI Development/Plane ICBB Decision Log.md` with status `APPROVED ARCHITECTURE DECISION — 2026-09-10` and linked from `AI Development Knowledge MOC`.
- Existing Plane tracking checked for duplicates; cutover tracking created once as `PLAT-11` — `Plane ICBB — in-place fork image cutover`.
- Repository grounding completed for `PROJECT_CONTEXT.md`, previous `WORKSTATE.md`, `.ai/repository.json`, `.ai/verification-profile.json`, `docs/icbb/plans/2026-08-28-plane-icbb-customization-discovery.md`, source `docker-compose.yml`, operations `README.md`, and operations local-deployment plan.
- Approved repository SPEC created at `docs/icbb/specs/2026-09-10-plane-icbb-in-place-image-cutover-design.md`.
- Executor-ready plan created and hardened at `docs/icbb/plans/2026-09-10-plane-icbb-in-place-image-cutover.md`.
- Plan self-review removed cross-task shorthand and ambiguous test instructions; no `TBD`, `TODO`, or `Repeat Task` placeholders remain.
- Foundation cutover plan updated on 2026-10-29 per owner approval (`T04`/`T05`) to authorize the non-API Community UI branding delta (`SPEC §15`: `SOURCE_DELTA=SCOPED_UI_BRANDING`, zero backend/API/admin/live/proxy/dependency delta, `MIGRATION_DELTA=EMPTY`), add `tools/verify.conf` for `./tools/verify-changed.sh`, and align the 15-service Compose runtime map (`mcp` and `mcp-proxy` protected alongside `proxy` and persistent services).
- Remediated `SEC-01` (`apps/web/vite.config.ts` reverted to upstream baseline `17c44c4898`, removing global `devCookies`, `0.0.0.0`, and hardcoded domain) and polished cross-app `PlaneLogo` data-URI, `PoweredBy`/`ProductUpdatesFooter` suppression, `root.tsx`/`manifest.json`/`site.webmanifest.json`/`packages/constants` metadata, and i18n keys.

## Approved Architecture Guardrails

- `icbb-plane@icbb/plane` is the primary source/build line.
- `/home/usman/projects/platform/plane` remains the only deployment/operations repository.
- Cutover is in-place, not a second Plane installation.
- PostgreSQL, Valkey, RabbitMQ, MinIO, persistent volumes, workspace, users, projects/work-items, attachments, secrets, domain, and gateway remain the existing single data/runtime plane.
- No new database, persistent stack, workspace, or administrator is allowed.
- Only application-service images within the approved service map may be replaced; `proxy` and persistent services are protected by this foundation plan.
- Images must be traceable to the exact deployed `icbb/plane` Git SHA via immutable SHA tag plus OCI revision/source/version labels.
- PASS requires live custom-image proof and persistent/logical-data continuity evidence.
- Licensing/entitlement bypass and Pro/Business feature unlocks are forbidden.
- Rollback uses captured previous known-good application image IDs; destructive `restore.sh` is not normal image rollback.

## Current Blockers / Gates

There is no remaining design-document blocker.

Execution remains gated as follows:

1. Task 1 read-only preflight must PASS.
2. Local source must be clean and equal to `origin/icbb/plane`.
3. Source delta must stay strictly within approved UI branding scope (`SOURCE_DELTA=SCOPED_UI_BRANDING`, zero backend/API/dependency delta).
4. Migration delta must be empty (`MIGRATION_DELTA=EMPTY`).
5. Existing persistent/protected container (`plane-db`, `plane-redis`, `plane-mq`, `plane-minio`, `proxy`, `mcp`, `mcp-proxy`) and mount identities and ICBB logical-data baseline must be captured.
6. SHA-labelled image builds/provenance verification must PASS.
7. The non-secret operations override must render without changing protected service hashes or volume names.
8. Rollback image refs and a fresh backup checkpoint must exist.
9. Explicit human approval is required after Task 4 and before Task 5 live container recreation.

Any gate failure is a STOP. Executor must not redesign around the failure.

## Files In Play for Planning

- `docs/icbb/specs/2026-09-10-plane-icbb-in-place-image-cutover-design.md`
- `docs/icbb/plans/2026-09-10-plane-icbb-in-place-image-cutover.md`
- `WORKSTATE.md`

## Verification State

- Obsidian connector/read/write: PASS.
- Plane workspace/project/work-item grounding: PASS.
- GitHub repository/branch/file grounding: PASS.
- Repository planning commit path verification: PASS.
- Planning diff scope: documentation-only.
- SPEC requirements covered by the implementation plan: PASS after self-review.
- Placeholder scan (`TBD`, `TODO`, `Repeat Task`, prior ambiguous repository-native test wording): PASS.
- Plane source tests: N/A for planning; no source code changed.
- Runtime preflight: NOT RUN — executor next action.
- Image builds: NOT RUN.
- Live cutover: NOT RUN and not yet authorized.
- Persistent-data continuity: NOT RUN.

## Exact Next Action

Executor reads the approved SPEC and plan, re-grounds both repositories, then executes **Task 1 only** from:

`docs/icbb/plans/2026-09-10-plane-icbb-in-place-image-cutover.md`

Task 1 is read-only with respect to the Plane runtime. It must return its exact preflight checkpoint. If PASS, later tasks may proceed according to the plan, but Task 5 remains blocked by the explicit human approval gate after Task 4.

## Authoritative Documents

SPEC:
`docs/icbb/specs/2026-09-10-plane-icbb-in-place-image-cutover-design.md`

Implementation plan:
`docs/icbb/plans/2026-09-10-plane-icbb-in-place-image-cutover.md`

Plane execution tracking:
`PLAT-11`

Durable decision history:
`AI Development/Plane ICBB Decision Log.md`
