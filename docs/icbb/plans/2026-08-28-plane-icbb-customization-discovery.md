# Plane ICBB Customization Discovery

## Status

Planning and discovery only. This document does not authorize Plane source
changes, deployment changes, an upstream sync, or changes to the operations
repository.

## Baseline Evidence

- Fork branch: `icbb/plane`.
- Fork HEAD and `origin/icbb/plane`: `41ec618fb24080fadce7e6d1a0f90092cf691f11`.
- Initial vendor fork baseline: `3478d4fac44ca67db5233065f9a21f8817eb763b`.
- Current read-only `upstream/preview` observation:
  `4a6f9edff6aee2dd1099f3ba7d1362aca8ea6826` at
  `2026-08-28T15:25:56Z`.
- `last_synced_sha` remains the initial fork baseline. No upstream sync has
  been performed.

## Observed Architecture

- The repository is a `pnpm` workspace using Turborepo. Root scripts expose
  build, development, start, and check workflows in `package.json` and
  `turbo.json`; the workspace includes `apps/*` and `packages/*` while
  excluding `apps/api` and `apps/proxy` from the JavaScript workspace.
- The backend is a Django project under `apps/api`. The root URL table mounts
  internal application routes at `/api/`, public space routes at
  `/api/public/`, instance routes at `/api/instances/`, versioned external
  routes at `/api/v1/`, authentication at `/auth/`, and web health routes at
  `/` (`apps/api/plane/urls.py:18-25`).
- Internal API domains are grouped under `apps/api/plane/app` with separate
  URL, view, serializer, and permission modules. The versioned API is grouped
  under `apps/api/plane/api`; both URL aggregators are explicit integration
  points (`apps/api/plane/app/urls/__init__.py:5-47`,
  `apps/api/plane/api/urls/__init__.py:5-31`).
- Shared persistence is in the Plane database app and its ordered Django
  migrations under `apps/api/plane/db/migrations`. Any new persistent ICBB
  feature therefore has schema, migration ordering, rollback, and data
  ownership implications.
- Background work is Celery-based. Tasks live under
  `apps/api/plane/bgtasks`, while recurring jobs are registered in
  `apps/api/plane/celery.py:38-118`. A task or scheduled job requires worker
  and beat deployment coverage, retry/idempotency rules, and operational
  observability.
- The primary web UI is a React Router application in `apps/web`. Routes are
  merged from `apps/web/app/routes/core.ts` and `extended.ts` by
  `apps/web/app/routes.ts:7-23`. API access is centralized through the
  credentialed Axios boundary in `apps/web/core/services/api.service.ts:11-63`;
  feature services and stores are organized below `apps/web/core/services` and
  `apps/web/core/store`.
- `apps/admin` and `apps/space` are separate React Router applications, and
  `apps/live` is a Node/Hocuspocus realtime service. They should not be pulled
  into an ICBB feature unless the user-facing requirement actually crosses
  those runtime boundaries.
- The default Compose stack builds separate `web`, `admin`, `space`, `api`,
  `worker`, `beat-worker`, `migrator`, `live`, and `proxy` services and runs
  Postgres, Valkey, RabbitMQ, and MinIO (`docker-compose.yml:1-177`).

## Safe Customization Boundaries

1. Start with one bounded ICBB use case and one owning domain. Prefer a new
   feature-local API module over edits to cross-domain utilities or global
   middleware.
2. Choose `/api/` for an authenticated internal web feature and `/api/v1/`
   only when a stable external contract is required. Keep URL aggregation,
   serializers, permissions, and tests close to the owning domain.
3. Keep frontend work inside the consuming app: route entry, feature
   components, API service, store, and translations. Change `packages/*` only
   when the contract is genuinely shared by more than one app.
4. Add a Django model and migration only for durable ICBB state. Define tenant
   ownership, permissions, indexes, backfill, rollback, and sync conflict
   strategy before implementation.
5. Use Celery or `apps/live` only when asynchronous or realtime behavior is a
   confirmed requirement. Do not add a worker, beat schedule, websocket
   channel, or broker dependency for a synchronous feature.
6. Keep deployment/runtime configuration in the existing operations repository
   unless the source fork must define a build-time or runtime contract. The
   operations repository at `/home/usman/projects/platform/plane` is outside
   this discovery task.

## Integration Points To Validate

- API route table, authentication mode, tenant/workspace scoping, permission
  class, serializer contract, OpenAPI exposure, and error shape.
- Existing model relationships and database migration leaf before adding
  schema; verify whether the feature can reuse current workspaces, projects,
  members, or work items without weakening ownership rules.
- Frontend route composition, loader/data-fetching convention, Axios service
  boundary, SWR/MobX state behavior, loading/error/empty states, and
  translation requirements.
- Side effects such as notifications, webhooks, emails, file storage, Celery,
  or realtime updates. For each, specify idempotency, retries, timeouts,
  persistence, failure visibility, and duplicate prevention before coding.
- Build artifact and runtime coverage: API changes affect `api`, `worker`,
  `beat-worker`, and possibly `migrator`; web changes affect the relevant UI
  image; realtime changes affect `live`; path or header changes may affect
  `proxy`.

## Upstream-Sync Risks

- The live Plane `preview` branch is ahead of the fork baseline, so this plan
  must not treat the current upstream observation as a completed sync.
- URL aggregator edits are likely conflict points when upstream adds routes or
  reorganizes domains.
- Shared database migrations are ordered state, so upstream migration changes
  can conflict or make rollback assumptions invalid.
- Root manifests, `pnpm-lock.yaml`, shared packages, route tables, Dockerfiles,
  Compose files, and CI workflows have a wider conflict and deployment blast
  radius than feature-local files.
- Changes that add environment variables, services, image names, or deployment
  paths can diverge from the existing operations repository and require an
  explicit deployment review.
- Every sync must use the V2 checkpoint, isolated sync branch, no-commit merge,
  conflict review, verification, tests, human review, and origin-only push
  gates. No automatic resolution or direct upstream push is allowed.

## Discovery Tasks

- [ ] Write the first ICBB use case, actors, tenant boundary, data ownership,
  and non-goals.
- [ ] Trace the closest existing Plane domain end to end before choosing new
  modules or extension seams.
- [ ] Produce a file-level change map for API, UI, tests, migrations, and any
  required deployment contract; keep source edits out of this task.
- [ ] Decide whether the feature is synchronous, queued, webhook-driven, or
  realtime and complete the concurrency/idempotency/retry review first.
- [ ] Define the smallest test matrix: API unit/contract tests, frontend checks,
  migration checks, and smoke coverage where the runtime boundary requires it.
- [ ] Record the deployment impact and rollback plan without modifying the
  existing operations repository.
- [ ] Review the proposed change map against current `upstream/preview` before
  implementation, then create a separate implementation plan and branch.

## Acceptance Criteria

- The first ICBB customization has one named owner domain and an explicit
  source boundary.
- API, UI, persistence, async/realtime, deployment, verification, and rollback
  implications are documented before source implementation.
- No Plane source, deployment, operations repository, upstream ref, or fork
  history is modified by this discovery task.
- Implementation begins only after a reviewed plan, baseline checkpoint, and
  branch-specific verification profile are available.
