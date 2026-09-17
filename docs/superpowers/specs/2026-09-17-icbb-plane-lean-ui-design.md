# ICBB Plane Lean UI — Design Specification

**Date:** 2026-09-17
**Repository:** `hanavvip19-gif/icbb-plane`
**Base branch:** `preview`
**Scope:** Phase 1 — frontend-only lean UI and ICBB branding

## 1. Goal

Create a lighter, cleaner ICBB-specific Plane frontend while preserving Plane's core project-management behavior, data model, API contracts, permissions, and upgrade path.

The first phase focuses on measurable frontend simplification and branding. It must not change PostgreSQL schema, backend API behavior, worker behavior, Redis behavior, authentication semantics, authorization semantics, or existing project/work-item workflows.

## 2. Problem Statement

The current Plane deployment has begun to feel slower and visually contains assets/features that are not all necessary for ICBB's daily workflow. Removing arbitrary icons is not a valid performance strategy because functional SVG/icon components are usually small and frequently improve usability. Instead, this phase will distinguish between:

- functional UI icons that should stay;
- branding assets that should be replaced;
- decorative or unused assets that may be removed;
- animations or visual effects that can be reduced;
- optional navigation entries/features that may be hidden without deleting backend support.

All performance work must be evidence-driven using before/after measurements.

## 3. Current Repository Facts

The Plane fork already exists at `hanavvip19-gif/icbb-plane` with default branch `preview`.

The web application lives in `apps/web` and uses React Router. Its current package scripts include `build`, `check:lint`, `check:types`, and `check:format`.

Branding-related assets currently exist in several places, including:

- `apps/web/app/assets/favicon/`
- `apps/web/app/assets/icons/`
- `apps/web/app/assets/logos/`
- `apps/web/app/assets/images/`
- `apps/web/app/assets/empty-state/`
- `apps/web/public/favicon/`
- `apps/web/public/icons/`
- `apps/web/public/plane-logos/`
- `apps/web/public/manifest.json`
- `apps/web/public/site.webmanifest.json`

`apps/web/app/root.tsx` currently contains Plane-specific title/meta/PWA branding and imports favicon, app icons, OG image, and a logo spinner.

## 4. Architecture Decision

### 4.1 Fork strategy

`hanavvip19-gif/icbb-plane` remains the ICBB-maintained fork. Upstream compatibility is treated as a first-class constraint.

Customizations should be shallow and localized. Prefer configuration/constants/components over broad rewrites of Plane internals.

### 4.2 Phase 1 boundary

Phase 1 is **frontend-only**.

Allowed:

- metadata and branding changes;
- favicon/app-icon replacement;
- Plane logo replacement in ICBB-facing shell locations;
- removal of provably unused/decorative assets;
- reducing non-essential animation/transitions;
- hiding optional UI/navigation items through a localized ICBB configuration layer;
- bundle/request-size measurement and regression checks;
- frontend tests and build verification.

Not allowed:

- database migrations;
- API endpoint changes;
- permission/role changes;
- auth flow changes;
- worker/beat changes;
- Redis/Postgres tuning;
- deleting backend support for hidden features;
- deleting functional navigation icons merely because they are icons;
- production deployment/cutover as part of this phase.

## 5. Lean UI Rules

### 5.1 Keep functional icons

Keep icons that communicate actions or navigation, including project, work-item, search, settings, member, filter, add/create, edit, delete/archive, notification, and status controls.

A functional icon may only be removed when its entire action or navigation entry is intentionally hidden by the ICBB configuration and no remaining component references it.

### 5.2 Remove only evidence-backed assets

An image, illustration, animation, or asset can be deleted only when all of the following are true:

1. repository reference search shows no required runtime consumer after the planned UI change;
2. `apps/web` still type-checks and builds;
3. relevant smoke tests pass;
4. no broken asset requests appear in the tested flows.

Asset deletion must be separated from feature hiding so reviewers can see exactly why each file became unused.

### 5.3 Branding

User-visible Plane product branding in the primary web shell should become **ICBB Plane** unless the text is required by licensing, legal attribution, upstream documentation, or a third-party integration contract.

Phase 1 branding targets:

- browser title;
- application/PWA name;
- favicon;
- app icons;
- primary shell logo;
- loading/spinner branding when practical without introducing a new animation dependency;
- OpenGraph metadata used by the self-hosted instance.

Copyright and AGPL notices must remain intact.

### 5.4 Animation

Non-essential decorative motion should be reduced or removed when it has no workflow function. Loading indicators, progress feedback, drag/drop affordances, and state-transition feedback remain functional and must not be blindly removed.

## 6. ICBB Configuration Layer

To reduce fork drift, ICBB-specific decisions should be centralized rather than scattered as hard-coded conditionals.

Introduce one small frontend configuration module under the web application, for example:

`apps/web/app/config/icbb-ui.ts`

It will expose immutable UI/branding flags and names needed by Phase 1. Initial interface:

```ts
export const ICBB_UI = {
  productName: "ICBB Plane",
  shortName: "ICBB",
  reduceDecorativeMotion: true,
} as const;
```

Feature/menu hiding flags may be added only for entries explicitly selected during implementation after inventory. They must not change backend permissions and must default to preserving existing Plane behavior unless the ICBB fork intentionally overrides them.

Do not create a generic feature-flag framework in Phase 1.

## 7. Performance Measurement

Performance claims require before/after evidence from the same commit environment and build command.

### 7.1 Required baseline

Before deleting or replacing assets, record:

- successful `apps/web` production build;
- total generated client build size;
- JavaScript asset total size;
- CSS asset total size;
- static image/font asset total size;
- count of generated client files;
- largest generated assets;
- build duration as informational evidence only;
- browser request count and transferred bytes for one agreed authenticated landing page when local runtime is available.

### 7.2 Comparison

After Phase 1 changes, rerun the same measurements and publish a simple delta table in the implementation evidence.

No minimum percentage reduction is required. A smaller or neutral bundle is acceptable if the result simplifies branding/UI safely. A regression in generated client size greater than 5% requires explanation and explicit approval before merge.

## 8. UI Inventory Before Removal

Implementation must first produce an inventory classifying candidate items into:

- KEEP — functional workflow element;
- REPLACE — Plane branding replaced by ICBB branding;
- HIDE — optional UI entry hidden while backend stays intact;
- REMOVE — unused/decorative asset safely deletable;
- DEFER — uncertain or cross-cutting feature left unchanged in Phase 1.

At minimum inspect:

- root metadata and PWA assets;
- primary application logo/shell branding;
- loading logo/spinner;
- empty-state illustrations;
- auth illustrations;
- cover/decorative images;
- sidebar/top-navigation entries;
- animation classes/components directly involved in the primary shell.

## 9. Functional Compatibility

The following core flows must remain unchanged in behavior:

- login/session restoration;
- workspace selection;
- project selection;
- work-item list/board access;
- work-item create/open/edit;
- search;
- member/project settings reachable for authorized users;
- permission-denied behavior;
- logout.

Phase 1 does not redefine which users can see which projects. Existing Plane authorization remains the source of truth.

## 10. Testing and Verification

Required verification before Phase 1 can be considered merge-ready:

```bash
pnpm --filter web check:types
pnpm --filter web check:lint
pnpm --filter web check:format
pnpm --filter web build
```

If repository package-manager syntax differs in the execution environment, use the existing equivalent repo command without changing dependencies solely to run verification.

Add focused tests for any new ICBB configuration logic or conditional navigation behavior where the existing test infrastructure supports that code path.

Manual smoke verification must cover the functional compatibility flows listed above.

## 11. Upstream Maintainability

Changes should minimize future merge conflicts:

- avoid mass formatting;
- do not rename broad upstream directories;
- do not fork shared packages solely for branding;
- prefer replacing leaf assets and metadata references;
- centralize ICBB constants;
- avoid deleting backend code for hidden frontend features;
- keep upstream copyright headers;
- document each deliberate deviation from upstream in commit/PR notes.

## 12. Delivery Sequence

Phase 1 implementation should proceed in this order:

1. capture baseline build/performance evidence;
2. inventory branding/assets/navigation/animation candidates;
3. add centralized ICBB UI configuration;
4. replace root/PWA branding and primary logo assets;
5. hide only explicitly approved optional UI entries;
6. remove only assets proven unused after those changes;
7. reduce clearly decorative motion;
8. run full frontend verification and smoke flows;
9. record before/after evidence and upstream-drift notes.

## 13. Acceptance Criteria

Phase 1 is accepted only when all conditions are true:

- AC-1: No backend/API/database/permission behavior changed.
- AC-2: Primary web branding presented to users is ICBB Plane rather than Plane where legally and technically safe.
- AC-3: Functional workflow icons remain unless their entire feature entry is intentionally hidden.
- AC-4: Every deleted asset is demonstrably unused after the UI changes.
- AC-5: No broken asset requests are observed in tested core flows.
- AC-6: Login, workspace/project navigation, work-item CRUD access, search, settings access, permission denial, and logout still function.
- AC-7: `check:types`, `check:lint`, `check:format`, and production `build` pass for `apps/web`.
- AC-8: Before/after generated-client metrics are recorded using the same measurement procedure.
- AC-9: Generated client size does not regress by more than 5% without explicit human approval.
- AC-10: ICBB-specific behavior is localized sufficiently to keep future upstream merges practical.
- AC-11: AGPL/copyright notices remain intact.
- AC-12: Production deployment is not performed by this phase.

## 14. Explicitly Deferred

The following are separate future phases and are not part of this specification:

- PostgreSQL query/index tuning;
- Redis/worker optimization;
- Docker resource tuning;
- server sizing changes;
- route-level code splitting beyond changes naturally caused by Phase 1;
- replacement/removal of major Plane modules;
- custom project-level authorization;
- mobile/Space/Admin app rebranding outside what is required by the primary `apps/web` build;
- production cutover.

These may be proposed after Phase 1 measurements show where actual latency/resource bottlenecks remain.
