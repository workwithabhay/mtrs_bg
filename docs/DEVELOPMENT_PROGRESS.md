# Development Progress & Roadmap

Tracking document for the implementation phases of the Review Management SaaS Backend.

---

## 🧭 Phase Checklist

| Phase | Description | Status | Verification Summary |
| :--- | :--- | :---: | :--- |
| **Phase 1** | Project Foundation & Minimal Server | **COMPLETED** | TypeScript, Express, Helmet, CORS, Zod env validation, logging with redaction, `/api/health`, centralized error handling, graceful shutdown, Vitest smoke tests passing. |
| **Phase 2** | Database Foundation (MongoDB & Mongoose) | **COMPLETED** | Mongoose integration, centralized connection manager, safe URI credential masking, User & Business models with normalization and compound indexing, multi-tenant partitioning design. |
| **Phase 3** | Authentication & Session Management | **COMPLETED** | Passwordless email OTP signup/login, HMAC OTP hashing, timing-safe equality, attack throttling, persistent cookie sessions, CSRF protection, email abstraction, and 34 automated unit/integration tests passing. |
| **Phase 4** | **Business Management & Multi-Tenancy** | **COMPLETED** | Authenticated Business profile read/update, settings read/update, server-derived tenant isolation, dual-key query scoping, mass-assignment defense, and 42 tests passing across 8 suites. |
| **Phase 5** | **QR Campaigns & Brand Assets** | **COMPLETED** | Campaign CRUD, logo upload validation & storage abstraction, PNG/SVG/PDF binary exports, public QR scan tracking, and 80 tests passing across 11 suites. |
| **Phase 6** | **Customer Feedback Journey** | **COMPLETED** | Public landing resolution, rating & feedback submission, contact validation, strict non-gated review routing, Google review click tracking, internal feedback APIs, and 110 tests passing across 14 suites. |
| **Phase 7** | **AI-Assisted Feedback** | **COMPLETED** | AI provider abstraction (Mock, Gemini, OpenAI), zero-PII transmission, prompt injection defense, strict factual fidelity & sentiment preservation, rate limiting, and 142 tests passing across 16 suites. |
| **Phase 8** | **Owner Dashboard & Analytics** | **COMPLETED** | Tenant-scoped aggregation pipelines, summary metrics, feedback trends with zero-event days, ratings breakdown, per-campaign QR performance, privacy-hardened recent feedback, and 158 tests passing across 18 suites. |
| **Phase 9** | **Plans, Subscriptions and Billing Foundation** | **COMPLETED** | Plan, Subscription, and PaymentEvent models, integer minor unit pricing, MockPaymentProvider abstraction with production safeguards, CSRF-protected checkout/cancellation, paginated payment history, and 179 tests passing across 20 suites. |
| **Phase 10** | **Super Admin Portal & Platform Management** | **COMPLETED** | Super Admin role enforcement, platform overview metrics, paginated business/subscription queries, server-controlled plan creation/editing, audit logging model, CLI seed provisioning script, and 196 tests passing across 22 suites. |
| **Email Delivery** | **Nodemailer SMTP & ZeptoMail Provider** | **COMPLETED** | Pluggable email abstraction with Nodemailer SMTP provider (`SmtpEmailProvider`), clean responsive HTML templates, unit tests, and seamless future drop-in support for ZeptoMail SMTP. |
| **Phase 11** | Hardening & Release Preparation | *Upcoming* | Cross-tenant security audits, full integration tests, deployment checklists, and production verification. |

---

## 📌 Phase 10 Completion Details

- **Date Completed**: 2026-10-24
- **Artifacts Created / Updated**:
  - `backend/src/modules/admin/admin.types.ts`: Domain interfaces for `IAuditLog`, `AdminPlatformOverview`, `AdminBusinessListItem`, `AdminBusinessDetail`, and plan administration.
  - `backend/src/modules/admin/models/audit-log.model.ts`: AuditLog Mongoose model with compound indexes `{ createdAt: -1 }`, `{ action: 1, createdAt: -1 }`, `{ actorId: 1, createdAt: -1 }`, and `{ targetType: 1, targetId: 1 }`.
  - `backend/src/modules/admin/admin.validation.ts`: Strict Zod validation schemas for business searches, subscription queries, audit log filters, plan creation, and plan updating.
  - `backend/src/modules/admin/admin.service.ts`: Administrative business logic for platform-wide metrics, paginated business search, business detail inspection, cross-tenant subscription monitoring, server-controlled plan creation/updating with historical price preservation, and audit logging.
  - `backend/src/modules/admin/admin.controller.ts`: REST controller handlers enforcing `super_admin` authorization.
  - `backend/src/modules/admin/admin.routes.ts`: Routes declared at `/overview`, `/businesses`, `/businesses/:id`, `/subscriptions`, `/plans`, and `/audit-logs` guarded by `authenticate`, `requireRole(['super_admin'])`, and `adminLimiter`.
  - `backend/src/routes/index.ts`: Mounted `adminRouter` at `/api/v1/admin`.
  - `backend/src/scripts/seed-admin.ts`: Controlled server-side CLI provisioning script for bootstrapping or promoting Super Admin users.
  - `backend/package.json`: Added `seed:admin` command (`tsx src/scripts/seed-admin.ts`).
  - `backend/src/common/middleware/rate-limiter.ts`: Added `adminLimiter` (120 requests per 15 minutes per IP).
  - `backend/tests/unit/admin/admin.test.ts`: 8 unit tests covering audit log schema validation and admin query schemas.
  - `backend/tests/integration/admin.test.ts`: 9 integration tests verifying 401 unauthenticated guards, 403 business owner blocks, super admin access, public signup protection, accurate revenue calculations, business detail stats, plan management, and historical pricing snapshot preservation.
- **Verification Commands Executed**:
  - `npm run typecheck`: Passed (0 errors)
  - `npm run lint`: Passed (0 errors, 0 warnings)
  - `npm run format:check`: Passed (100% compliant)
  - `npm run test`: Passed (**196/196 tests passing** across 22 test suites)
  - `npm run build`: Passed (Clean TypeScript compilation to `dist/`)

---


## 📌 Phase 9 Completion Details

- **Date Completed**: 2026-10-24
- **Artifacts Created / Updated**:
  - `backend/src/config/env.ts`, `backend/.env.example`, `backend/.env`: Added `PAYMENT_PROVIDER` and `ENABLE_DEV_MOCK_PAYMENTS` with strict `superRefine` production guards.
  - `backend/src/common/errors/error-codes.ts` & `backend/src/common/errors/app-error.ts`: Added `BILLING_UNAVAILABLE`, `PAYMENT_FAILED` error codes and `BadRequestError` helper.
  - `backend/src/integrations/payments/payment.interface.ts`: Payment provider abstraction interface with integer minor units and deterministic checkout input/result contracts.
  - `backend/src/integrations/payments/mock-payment.provider.ts`: Simulated development payment provider with clear `isSimulated: true` flags, zero secret leakage, and simulation audit logs.
  - `backend/src/integrations/payments/index.ts`: Provider factory enforcing production lockout for mock billing.
  - `backend/src/modules/billing/billing.types.ts`: Domain types for Plans, Subscriptions, and Payment Events.
  - `backend/src/modules/billing/models/plan.model.ts`: Plan model with compound index `{ isPublished: 1, sortOrder: 1 }` and `seedDefaultPlans()` helper (`free`, `starter`, `pro`).
  - `backend/src/modules/billing/models/subscription.model.ts`: Subscription model tracking lifecycle (`pending`, `active`, `cancelled`, `expired`), billing intervals, price snapshots, and cancellation semantics.
  - `backend/src/modules/billing/models/payment-event.model.ts`: Idempotent audit ledger for billing events with idempotency keys and compound index `{ businessId: 1, createdAt: -1 }`.
  - `backend/src/common/middleware/rate-limiter.ts`: Added `billingLimiter` (60 requests per 15 min per IP in production; 1000 in test).
  - `backend/src/modules/billing/billing.validation.ts`: Strict Zod validation schemas (`checkoutSchema`, `cancelSubscriptionSchema`, `paymentHistoryQuerySchema`) preventing client price manipulation.
  - `backend/src/modules/billing/billing.service.ts`: Core business logic for public plans, current subscription retrieval, mock checkout, idempotent cancellation, and paginated payment history.
  - `backend/src/modules/billing/billing.controller.ts`: REST endpoints with server-derived business and owner authorization.
  - `backend/src/modules/billing/billing.routes.ts`: Routes declared at `/plans`, `/subscription`, `/subscription/checkout`, `/subscription/cancel`, and `/payment-history`.
  - `backend/src/routes/index.ts`: Mounted `billingRouter` at `/api/v1/billing`.
  - `backend/tests/unit/billing/billing.test.ts`: 11 unit tests covering plan seeding, unique constraints, mock provider simulation, production lockout, and strict validation.
  - `backend/tests/integration/billing.test.ts`: 10 integration tests verifying public plans, 401 unauthenticated guards, default free tier, price manipulation rejection, mock checkout lifecycle, failed simulation safety, cancellation semantics, and cross-tenant data isolation.
- **Verification Commands Executed**:
  - `npm run typecheck`: Passed (0 errors)
  - `npm run lint`: Passed (0 errors, 0 warnings)
  - `npm run format:check`: Passed (100% compliant)
  - `npm run test`: Passed (**179/179 tests passing** across 20 test suites)
  - `npm run build`: Passed (Clean TypeScript compilation to `dist/`)


---

## 📌 Phase 8 Completion Details

- **Date Completed**: 2026-10-24
- **Artifacts Created / Updated**:
  - `backend/src/modules/qr-campaigns/models/qr-event.model.ts`: Added compound indexes `{ businessId: 1, eventType: 1, createdAt: -1 }` and `{ campaignId: 1, eventType: 1, createdAt: -1 }` for high-performance event time-series analytics.
  - `backend/src/modules/feedbacks/models/feedback.model.ts`: Added compound index `{ businessId: 1, createdAt: -1, rating: 1 }` for optimized rating distribution aggregations.
  - `backend/src/common/middleware/rate-limiter.ts`: Added `dashboardLimiter` (120 requests per 15 minutes per IP).
  - `backend/src/modules/dashboard/dashboard.types.ts`: Defined TypeScript interfaces for `DashboardDateRange` (`7d`, `30d`, `90d`), `DashboardSummaryResponse`, `FeedbackTrendsResponse`, `RatingsBreakdownResponse`, `QrPerformanceResponse`, and `RecentFeedbackResponse`.
  - `backend/src/modules/dashboard/dashboard.validation.ts`: Implemented Zod query validation (`dashboardFilterSchema`, `recentFeedbackQuerySchema`) and date range / continuous calendar series generation (`resolveDateRange`, `generateDateSeries`).
  - `backend/src/modules/dashboard/dashboard.service.ts`: Implemented database aggregation logic for:
    - Summary metrics: all-time and period feedback counts, status breakdowns, average ratings, QR scans, and Google review clicks with explicit semantic notes.
    - Feedback trends: daily time-series grouping with deterministic zero-event day population.
    - Ratings breakdown: 1 to 5 star counts, percentages, and weighted average.
    - QR performance: per-campaign scans, feedback submissions, and Google review clicks.
    - Recent feedback: paginated preview strictly stripped of customer email, phone, and PII, with text preview truncated to <= 150 characters.
  - `backend/src/modules/dashboard/dashboard.controller.ts`: Controller handlers with server-derived business authorization and input validation.
  - `backend/src/modules/dashboard/dashboard.routes.ts`: Routes declared at `/summary`, `/feedback-trends`, `/ratings-breakdown`, `/qr-performance`, and `/recent-feedback` protected by `authenticate`, `requireRole(['business_owner'])`, and `dashboardLimiter`.
  - `backend/src/routes/index.ts`: Mounted `dashboardRouter` at `/api/v1/dashboard`.
  - `backend/vitest.config.ts`: Configured `fileParallelism: false` to ensure test isolation and eliminate MongoMemoryServer port allocation collisions.
  - `backend/tests/unit/dashboard/date-range.test.ts`: 5 unit tests verifying date range duration math, UTC boundary handling, continuous series generation, and single-day bounds.
  - `backend/tests/integration/dashboard.test.ts`: 11 integration tests covering 401 unauthenticated rejections, tenant isolation, summary calculations, invalid range rejection (400), empty business zero-state handling, feedback trends with zero-event days, 1–5 star distribution math, QR campaign performance, and privacy-hardened recent feedback pagination and truncation.
  - `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`: Comprehensive documentation updates.
- **Verification Commands Executed**:
  - `npm run typecheck`: Passed (0 errors)
  - `npm run lint`: Passed (0 errors, 0 warnings)
  - `npm run format:check`: Passed (All files match Prettier style)
  - `npm run test`: Passed (**158/158 tests passing** across 18 test suites)
  - `npm run build`: Passed (Clean TypeScript compilation to `dist/`)
  - Server start & `/api/health`: Verified responsive on port 5050

---

## 📌 Phase 7 Completion Details

- **Date Completed**: 2026-10-24
- **Artifacts Created / Updated**:
  - `backend/src/config/env.ts` & `.env.example`, `.env`: Added `AI_PROVIDER`, `AI_API_KEY`, and `AI_TIMEOUT_MS` with production startup validation.
  - `backend/src/common/errors/error-codes.ts` & `src/common/constants/http-status.ts`: Added `AI_PROVIDER_UNAVAILABLE` and `BAD_GATEWAY` error codes and HTTP 502/504 statuses.
  - `backend/src/common/errors/app-error.ts`: Exported `ServiceUnavailableError` (HTTP 503) and `BadGatewayError` (HTTP 502).
  - `backend/src/integrations/ai/ai.interface.ts`: Defined `AiAssistanceProvider` interface, `GenerateAssistanceInput`, and immutable `AI_ASSISTANCE_SYSTEM_INSTRUCTION` enforcing factual fidelity, sentiment preservation, and untrusted-data boundary isolation.
  - `backend/src/integrations/ai/mock-ai.provider.ts`: Deterministic mock provider for tests and development with simulation hooks (`TRIGGER_TIMEOUT`, `TRIGGER_FAILURE`, `TRIGGER_EMPTY`, `TRIGGER_MALFORMED`, injection neutralization).
  - `backend/src/integrations/ai/gemini-ai.provider.ts`: Google Gemini REST adapter using built-in Node `fetch` with `AbortSignal.timeout` and strict error handling.
  - `backend/src/integrations/ai/openai-ai.provider.ts`: OpenAI REST adapter using built-in Node `fetch` with `AbortSignal.timeout` and strict error handling.
  - `backend/src/integrations/ai/index.ts`: Provider factory with production safety check and `sanitizeAiOutput` validator (checking 5-2500 length bounds, stripping markdown fences and wrapping quotes).
  - `backend/src/common/middleware/rate-limiter.ts`: Added `publicAiAssistanceLimiter` (15 requests per 15 minutes per IP).
  - `backend/src/modules/feedbacks/feedback.validation.ts`: Added `aiAssistanceSchema` with `.strict()` validation (min 10, max 2000 chars, forbidding contact fields).
  - `backend/src/modules/feedbacks/feedback.service.ts`: Implemented `generateAiAssistance(publicToken, input)` resolving campaign and business, formatting question answers, calling provider, sanitizing output, and safely handling provider outages without persisting to database.
  - `backend/src/modules/feedbacks/public-feedback.controller.ts`: Added `requestAiAssistance` controller handler.
  - `backend/src/modules/qr-campaigns/public-qr.routes.ts`: Mounted `POST /:token/ai-assistance` with rate limiter.
  - `backend/tests/unit/integrations/ai-provider.test.ts`: 17 unit tests verifying grammar polishing, factual fidelity, negative sentiment preservation, question integration, prompt injection resistance, simulated timeouts/failures, output sanitization, and factory behavior.
  - `backend/tests/integration/ai-assistance.test.ts`: 15 integration tests covering public resolution, draft improvements, question answers, input boundary rejection (<10, >2000 chars), PII rejection, 404 on invalid/inactive tokens, 503 on unconfigured/timeout/failure/malformed provider states, prompt injection neutralization, and full customer review journey without gating.
  - `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`: Comprehensive documentation of endpoint contract, provider abstraction, prompt safety, and privacy policies.
- **Verification Commands Executed**:
  - `npm run typecheck`: Passed (0 errors)
  - `npm run lint`: Passed (0 errors, 0 warnings)
  - `npm run format:check`: Passed (All files match Prettier style)
  - `npm run test`: Passed (**142/142 tests passing** across 16 test suites)
  - `npm run build`: Passed (Clean TypeScript compilation to `dist/`)
  - Server start & `/api/health`: Verified responsive on port 5050

---

## 📌 Phase 6 Completion Details

- **Date Completed**: 2026-10-24
- **Artifacts Created / Updated**:
  - `backend/src/common/utils/phone-validator.ts`: Phone number normalization and E.164 boundary validation.
  - `backend/src/modules/businesses/business.types.ts`: Extended `IBusinessSettings` with `feedbackQuestions`.
  - `backend/src/modules/businesses/business.model.ts`: Added `feedbackQuestionSchema` and standard default questions.
  - `backend/src/modules/businesses/business.validation.ts`: Extended settings validation to accept allowlisted `feedbackQuestions`.
  - `backend/src/modules/businesses/business.service.ts`: Updated settings service to persist `feedbackQuestions`.
  - `backend/src/modules/qr-campaigns/models/qr-event.model.ts`: Added `'google_review_click'` to event types and metadata destination.
  - `backend/src/modules/feedbacks/models/customer.model.ts`: Customer Mongoose model with normalized contacts, repeat visit timestamps, and tenant indexes.
  - `backend/src/modules/feedbacks/models/feedback.model.ts`: Feedback Mongoose model with rating (1-5), question answers, review status (`new`, `reviewed`, `resolved`), and compound tenant indexes.
  - `backend/src/modules/feedbacks/feedback.validation.ts`: Zod schemas for feedback submission, question answer verification, contact validation (at least one contact method), and status updates.
  - `backend/src/modules/feedbacks/feedback.service.ts`: Public landing resolution, non-gated feedback processing, short-window deduplication (60s), Google review click tracking, internal feedback listing, detail retrieval, and status updates.
  - `backend/src/modules/feedbacks/public-feedback.controller.ts`: Public controllers for landing, submission, and click tracking.
  - `backend/src/modules/feedbacks/feedback.controller.ts`: Controller for authenticated owner feedback management.
  - `backend/src/modules/feedbacks/feedback.routes.ts`: Owner feedback routes mounted at `/api/v1/feedback`.
  - `backend/src/modules/qr-campaigns/public-qr.routes.ts`: Mounted `GET /:token`, `POST /:token/feedback`, `POST /:token/google-review-click`.
  - `backend/src/routes/index.ts`: Mounted `feedbackRouter`.
  - `backend/tests/unit/utils/phone-validator.test.ts`: Phone validation unit tests.
  - `backend/tests/unit/models/feedback.model.test.ts`: Customer and Feedback model unit tests.
  - `backend/tests/integration/feedback.test.ts`: 17 integration tests covering public resolution, 1-star & 5-star submissions with equal Google review access (anti-gating), question validation, duplicate handling, click tracking, and owner feedback management.
  - `docs/API.md`, `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`: Comprehensive documentation updates.
- **Verification Commands Executed**:
  - `npm run typecheck`: Passed (0 errors)
  - `npm run lint`: Passed (0 errors, 0 warnings)
  - `npm run format:check`: Passed (All files match Prettier style)
  - `npm run test`: Passed (**110/110 tests passing** across 14 test suites)
  - `npm run build`: Passed (Clean TypeScript compilation)
  - Server start & `/api/health`: Verified responsive on port 5050

---

## 📌 Phase 5 Completion Details

- **Date Completed**: 2026-10-24
- **Artifacts Created / Updated**:
  - `backend/src/config/env.ts` & `.env.example`: Added `PUBLIC_APP_URL`, `STORAGE_DRIVER`, `LOCAL_STORAGE_PATH`, and `MAX_UPLOAD_SIZE_BYTES`.
  - `backend/src/common/utils/file-validator.ts`: Binary magic bytes detection for PNG, JPEG, and WEBP; strict rejection of SVGs and scripts.
  - `backend/src/integrations/storage/`: Created provider abstraction (`StorageProvider`, `LocalStorageProvider`, factory) with strict path traversal defenses.
  - `backend/src/common/middleware/upload.ts`: Multer memory storage middleware with 2MB bounds and image type filter.
  - `backend/src/common/middleware/rate-limiter.ts`: Added `publicScanLimiter` (60 req/min).
  - `backend/src/modules/qr-campaigns/models/qr-campaign.model.ts`: Mongoose schema with brand customization, unique random token, scan count, and compound indexes.
  - `backend/src/modules/qr-campaigns/models/qr-event.model.ts`: Privacy-conscious scan event telemetry model.
  - `backend/src/modules/qr-campaigns/qr-generator.service.ts`: Real QR code rendering pipeline generating valid PNG buffers, clean SVG markup, and branded printable A4 PDFs using `pdfkit`.
  - `backend/src/modules/qr-campaigns/qr-campaign.service.ts`: Tenant-scoped campaign operations, binary export packaging, and atomic scan counters.
  - `backend/src/modules/qr-campaigns/qr-campaign.controller.ts`: Controller actions for CRUD, deactivation, export, and public resolution.
  - `backend/src/modules/qr-campaigns/qr-campaign.routes.ts`: Authenticated, owner-restricted routes mounted at `/api/v1/qr-campaigns`.
  - `backend/src/modules/qr-campaigns/public-qr.routes.ts`: Public rate-limited scan route mounted at `/api/v1/public/qr`.
  - `backend/src/routes/storage.routes.ts`: Safe public file server mounted at `/api/v1/storage`.
  - `backend/tests/unit/models/qr-campaign.model.test.ts`: Model validation unit tests.
  - `backend/tests/unit/storage/storage-provider.test.ts`: Magic bytes validation and path-traversal prevention tests.
  - `backend/tests/integration/qr-campaign.test.ts`: 24 integration tests covering CRUD, logo uploads, exports (PNG, SVG, PDF byte verification), multi-tenancy isolation across independent owners, and public scans.
  - `docs/API.md`, `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`: Comprehensive documentation updates.
- **Verification Commands Executed**:
  - `npm run typecheck`: Passed (0 errors)
  - `npm run lint`: Passed (0 errors, 0 warnings)
  - `npm run format:check`: Passed (All files match Prettier style)
  - `npm run test`: Passed (**80/80 tests passing** across 11 test suites)
  - `npm run build`: Passed (Clean TypeScript compilation)
  - Server start & `/api/health`: Verified responsive on port 5050


---

## 📌 Phase 4 Completion Details

- **Date Completed**: 2026-10-24
- **Artifacts Created / Updated**:
  - `backend/src/modules/businesses/business.types.ts`: Extended `IBusinessSettings` with `defaultLanguage`, `headingText`, and `subheadingText`.
  - `backend/src/modules/businesses/business.model.ts`: Updated `businessSettingsSchema` with `defaultLanguage` ('en'), `headingText`, and `subheadingText`.
  - `backend/src/modules/businesses/business.validation.ts`: Created strict Zod validation schemas (`updateBusinessProfileSchema`, `updateBusinessSettingsSchema`) preventing mass-assignment of protected fields.
  - `backend/src/modules/businesses/business.service.ts`: Implemented tenant-isolated business logic (`getBusinessProfile`, `updateBusinessProfile`, `getBusinessSettings`, `updateBusinessSettings`) enforcing dual-key scoping (`_id` and `ownerId`).
  - `backend/src/modules/businesses/business.controller.ts`: Implemented controller mapping authenticated requests to authorized business operations.
  - `backend/src/modules/businesses/business.routes.ts`: Declared `/` and `/settings` routes protected by `authenticate` and `requireRole(['business_owner'])`.
  - `backend/src/routes/index.ts`: Mounted `businessRouter` at `/api/v1/business`.
  - `backend/src/common/middleware/error-handler.ts`: Enhanced centralized error handler to catch and format `ZodError` as standardized 400 `VALIDATION_ERROR` responses.
  - `backend/tests/integration/business.test.ts`: Added 8 integration tests covering profile retrieval, profile updates, settings retrieval, settings updates, mass-assignment rejection, cross-tenant isolation between independent owners, and suspended account blocking.
  - `backend/docs/API.md`: Documented `/api/v1/business` and `/api/v1/business/settings` endpoints.
  - `backend/docs/DATABASE.md`: Documented Phase 4 settings fields.
  - `backend/docs/SECURITY.md`: Documented server-side tenant scoping and mass-assignment protection.
- **Verification Commands Executed**:
  - `npm run typecheck`: Passed (0 errors)
  - `npm run lint`: Passed (0 errors)
  - `npm run format:check`: Passed
  - `npm run test`: Passed (**42/42 tests passing** across 8 test suites)
  - `npm run build`: Passed
