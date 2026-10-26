# Architecture & Design Specifications

## 1. Architectural Style: Modular Monolith

The backend is architected as a **Modular Monolith**. 

### Why this architecture?
- **Cognitive Simplicity & Velocity**: All code resides within a single cohesive TypeScript project without network latency, distributed transactions, or orchestration complexity associated with microservices.
- **Strict Module Boundaries**: High-level modules (e.g. `auth`, `businesses`, `qr-campaigns`, `feedbacks`, `billing`) will maintain clear internal separation between HTTP routing, business services, and database persistence layers.
- **Extraction-Ready**: Should individual sub-domains (e.g., QR rendering or AI rewriting) require dedicated scaling later, their isolation enables extraction into independent services without rewriting domain logic.

---

## 2. Directory Layout & Layer Responsibilities

```
backend/
├── src/
│   ├── server.ts              # Entry point: process lifecycle, signals (SIGTERM/SIGINT), graceful shutdown
│   ├── app.ts                 # Express application: security middleware, parsing, router mounting, error pipelines
│   ├── config/                # Environment variables, CORS policies, database config
│   │   ├── env.ts             # Zod environment schema & fail-fast startup validation
│   │   └── cors.ts            # Dynamic CORS origin parsing and security options
│   ├── common/                # Shared utilities, constants, errors, and cross-cutting middlewares
│   │   ├── constants/         # HTTP status codes, system defaults
│   │   ├── errors/            # AppError hierarchy, operational error flags, error codes
│   │   ├── middleware/        # Request ID tracing, structured logging, 404 handler, global error handler
│   │   ├── types/             # Standard API response interfaces
│   │   └── utils/             # Redacted Pino logger instance, response formatting utilities
│   ├── routes/                # Top-level route aggregation and system probes
│   │   ├── health.routes.ts   # /api/health and /api/ready
│   │   └── index.ts           # Root router
│   ├── modules/               # Domain feature modules (Phase 3+)
│   │   ├── auth/              # Email OTP authentication, sessions, tokens
│   │   ├── businesses/        # Business profiles, location settings
│   │   ├── qr-campaigns/      # QR campaign CRUD, PNG/SVG/PDF rendering, tracking
│   │   ├── feedbacks/         # Customer review submissions, internal reviews
│   │   ├── billing/           # Plans, subscriptions, mock payments, Razorpay interface
│   │   └── admin/             # Super Admin controls, tenant oversight, audit logs
│   ├── integrations/          # External provider adapters (Phase 3+)
│   │   ├── email/             # OTP delivery (development stub / SMTP / SendGrid)
│   │   ├── ai/                # Feedback rewriting provider abstraction
│   │   ├── payments/          # Payment provider interface & mock provider
│   │   └── storage/           # S3 / Object storage abstraction & local adapter
│   └── types/                 # Application-wide TypeScript declarations (e.g., Express Request augmentation)
├── tests/
│   ├── integration/           # HTTP API tests using Supertest & Vitest
│   └── unit/                  # Domain business logic and validation unit tests
└── docs/                      # Architectural, database, security, and progress documentation
```

---

## 3. Request Lifecycle Pipeline

```
Incoming Client Request
         │
         ▼
[requestIdMiddleware]       ──> Injects UUID into req.id and sets 'X-Request-Id' response header
         │
         ▼
[helmet]                    ──> Applies secure HTTP headers (CSP, HSTS, X-Content-Type-Options)
         │
         ▼
[cors]                      ──> Verifies Origin against allowlist in env.CORS_ORIGIN
         │
         ▼
[httpLogger]                ──> Structured logging of request start/finish with sensitive field redaction
         │
         ▼
[cookieParser]              ──> Parses HTTP cookies (session, csrf_token)
         │
         ▼
[express.json / urlencoded] ──> Parses payloads with strict size boundaries (1MB limit)
         │
         ▼
[csrfProtection]            ──> Enforces double-submit CSRF cookie check for state-changing methods
         │
         ▼
[Router (routes/)]          ──> Resolves route path (e.g., /api/health, /api/v1/auth)
         │
    ┌────┴────────────────────────┐
    │                             │
    ▼                             ▼
Route Handler               [notFoundHandler] (If unmatched)
(Executes Service/Business)        │
    │                             ▼
    │                      Throws NotFoundError
    │                             │
    └──────────────┬──────────────┘
                   │
                   ▼
          [errorHandler]
                   │
                   ▼
  Formats standardized JSON response:
  { "success": ..., "data": ... } or { "success": false, "error": ... }
```

---

## 4. Error Handling & Information Leakage Prevention

- Operational errors inherit from `AppError` and carry a specific `ErrorCode` and HTTP status code.
- Non-operational or unexpected runtime errors (e.g. unhandled syntax or database disconnections) are logged with full stack traces on the server alongside the request ID, but **never** return raw stack traces or internal database messages to the client.
- In production (`NODE_ENV === 'production'`), 500 errors return a safe, sanitized message: `"An unexpected error occurred. Please try again later."`

---

## 5. Storage Abstraction & QR Export Pipeline

### Storage Provider Interface
File uploads (such as business logos) are decoupled from the filesystem through the `StorageProvider` abstraction:
```ts
interface StorageProvider {
  uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<FileMetadata>;
  getFile(key: string): Promise<StoredFile | null>;
  deleteFile(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}
```
- **Development Adapter (`LocalStorageProvider`)**: Saves files locally to `./uploads/logos/` with path traversal sanitization (`resolveSafePath`). Assets are served via `GET /api/v1/storage/files/:key`.
- **Production Migration Path**: An S3 / Cloud Storage provider can be plugged into `getStorageProvider()` without modifying any domain or campaign service logic.

### QR Generation & Multi-Format Export Pipeline
- **URL Stability**: The QR code encodes a canonical landing URL constructed as `${env.PUBLIC_APP_URL}/qr/${campaign.publicToken}`, never derived from untrusted `Host` headers.
- **Library Selection**:
  - `qrcode`: Industry-standard, high-performance generator supporting PNG matrix rendering and vector SVG paths. Configured with error correction level `M` (15% redundancy) and quiet zone margin of `2`.
  - `pdfkit`: Streaming vector PDF engine that draws high-resolution QR codes alongside customer headings and print guidelines on standard A4 canvas.
- **Scanability Assurance**: We enforce high-contrast default pairings (`#2563EB` on `#FFFFFF`). When logos are uploaded, we avoid destructive center-stamping over data modules; instead, logos are served on the public web landing page and on top of printable PDF assets.

---

## 6. Public Feedback & Non-Gated Review Architecture

### Domain Separation: Customer vs. Feedback
- `Customer`: Represents a human consumer interacting with a business tenant. Tracks display name, normalized contact details (`email`, `phone`), and visit history (`lastVisitedAt`). Multiple visits and feedback submissions from the same customer are naturally supported without data collisions.
- `Feedback`: Represents a single experience submission bound to a `Business`, a `QrCampaign`, and a `Customer`. Stores rating (1–5), optional customer-authored written experience, and structured survey question answers.

### Strict Non-Gated Review Policy
The platform strictly complies with Google and consumer protection anti-gating policies:
1. **Equal Accessibility**: The Google review option is prominently surfaced across all ratings (1, 2, 3, 4, 5 stars).
2. **Zero Rating Interception**: The backend does not divert negative feedback away from public review sites, nor does it demand high star ratings before revealing the Google review link.
3. **Verified Destination URLs**: Click tracking on `POST /api/v1/public/qr/:token/google-review-click` resolves strictly to the business's verified `googleReviewUrl` stored in MongoDB, preventing open redirect attacks.

### Question Configuration & Server-Side Enforcement
- Business tenants configure survey questions within `business.settings.feedbackQuestions`.
- When a customer submits answers, the server strictly validates:
  - That every answered question exists in the tenant's active question configuration.
  - That all required questions are answered.
  - That single-choice responses match configured options.

---

## 7. AI Feedback Assistance Architecture & Safety Pipeline

```
Customer Input (Draft Text + Optional Survey Answers)
                    │
                    ▼
          [publicAiAssistanceLimiter] (15 req / 15 min / IP)
                    │
                    ▼
          [aiAssistanceSchema] (Zod Validation: min 10, max 2000 chars, .strict())
                    │
                    ▼
      [FeedbackService.generateAiAssistance]
                    │
                    ├─► Resolves active campaign & business from public token
                    ├─► Maps answers to human-readable question labels
                    ├─► Completely excludes customer contact PII
                    │
                    ▼
          [getAiAssistanceProvider()]
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
  [MockProvider] [Gemini]    [OpenAI]
  (Unit/Tests)   (REST fetch)(REST fetch)
       │            │            │
       └────────────┬────────────┘
                    │ (With AbortSignal.timeout & safe error catching)
                    ▼
          [sanitizeAiOutput]
          - Checks 5 <= length <= 2500
          - Strips wrapping code blocks & quotes
                    │
                    ▼
      Returns { originalDraft, suggestedText, mode }
      (Zero database writes, no automatic Google submission)
```

### Safety and Compliance Principles:
1. **Factual Fidelity**: The customer's authentic experience is the sole source of truth. The system prompt instructs the model to rely only on explicitly provided text and answers. It is forbidden from inventing staff names, products, events, or praise.
2. **Sentiment Preservation**: The model only improves grammar, spelling, and readability. Negative complaints, critical tones, and dissatisfaction are strictly preserved and never whitewashed.
3. **Prompt Injection Defense**: Customer input is treated as untrusted data enclosed within boundary tags (`<customer_draft>` and `<question_context>`). Directives attempting to override instructions are ignored.
4. **Zero PII Forwarding**: Customer names, emails, and phone numbers are omitted from the AI request schema (`.strict()` rejects them if sent).
5. **Customer Agency**: The AI output is returned for human review and editing. It is never automatically accepted, saved, or published to external review platforms.

---

## 8. Owner Dashboard & Analytics Architecture (Phase 8)

### Aggregation Pipeline & Index Utilization
To prevent Node.js heap exhaustion as feedback and scan volume scales, all analytics queries utilize native MongoDB aggregation pipelines with strict tenant matching:
- **Index-Backed Filtering**: The compound index `{ businessId: 1, createdAt: -1, rating: 1 }` on `Feedback` and `{ businessId: 1, eventType: 1, createdAt: -1 }` on `QrEvent` allow the database engine to perform range scans directly within B-trees without full-collection scans.
- **In-Database Grouping**: Time-series bucketing (`$dateToString` format `YYYY-MM-DD` in UTC) and rating histograms (`$group` on `$rating` or `$status`) are calculated directly by the MongoDB database engine.

### Deterministic Zero-Event Calendar Series
- In real-world SaaS dashboards, missing dates in time-series data cause charting libraries to skew visual intervals.
- The `generateDateSeries()` helper computes a continuous array of UTC calendar days across the selected range (7d, 30d, 90d).
- The service maps aggregation results into this series, populating unrecorded days with `0` for counts and `null` for average ratings, ensuring seamless frontend visualization without gaps.

### Strict Metric Semantics & External Review Integrity
- **QR Scans**: Accurately reported as raw scan events recorded by the platform (not unique visitors).
- **Google Review Clicks**: Accurately reported as clicks on the external review redirect link. The platform explicitly does not label clicks as verified published reviews on Google, preventing deceptive analytics.

---

## 9. Billing & Subscription Architecture (Phase 9)

```
[Client / Frontend]
         │
         │ POST /api/v1/billing/subscription/checkout
         ▼
[BillingController] (authenticate, requireRole(['business_owner']))
         │
         │ Validates planId & interval (rejects client price/status)
         ▼
[BillingService]
         │
         ├──> Lookup Plan in MongoDB (verifies isPublished: true)
         ├──> Calculate amount in integer minor units (paise / cents)
         ▼
[PaymentProvider Abstraction]
         │
         ├──> In Production: Throws ServiceUnavailableError if mock
         └──> In Dev/Test: MockPaymentProvider
                     │
                     ▼
             Generate simulated intent
             { isSimulated: true, status: 'succeeded'|'failed' }
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
    [Succeeded]              [Failed]
- Create PaymentEvent    - Create PaymentEvent (failed)
- Upsert Subscription    - Do NOT activate subscription
  (status: 'active')     - Return failure details
```

### Key Architectural Principles
1. **Financial Precision via Integer Minor Units**: All monetary values are represented as integer minor currency units (e.g., `99900` for 999.00 INR). This completely eliminates floating-point precision loss inherent in IEEE-754 arithmetic.
2. **Server-Derived Pricing & Validation**: Prices and currencies are loaded strictly from the database `Plan` model; client requests cannot pass arbitrary prices, currency codes, or statuses (`.strict()` Zod schema defense).
3. **Transparent Simulation**: Every development transaction and mock model payload carries `isSimulated: true` and `provider: 'mock'`.
4. **Idempotent Audit Ledger**: State-changing billing events generate unique `PaymentEvent` documents with idempotency keys (`pay_evt_<uuid>`) to prevent duplicate activation or charge replays.
5. **Non-Breaking Feature Retention**: Future live entitlement gates are architected via clean domain query helpers, ensuring that previously working product features from Phases 1–8 are never broken unexpectedly.

---

## 10. Super Admin Architecture & Platform Management (Phase 10)

```
[Super Admin Client / CLI]
         │
         │ Authenticated via Cookie Session (role: 'super_admin')
         ▼
[AdminRouter (/api/v1/admin)]
         │
         ├──> [authenticate] (Verifies active session in MongoDB)
         ├──> [requireRole(['super_admin'])] (Fails closed on owner/unauthenticated)
         ├──> [adminLimiter] (120 req / 15 min per IP)
         ▼
[AdminController]
         │
         ├──> GET /overview       ──> [AdminService.getPlatformOverview] (Native DB metrics)
         ├──> GET /businesses     ──> [AdminService.getBusinesses] (Search & pagination)
         ├──> GET /subscriptions  ──> [AdminService.getSubscriptions] (Cross-tenant status)
         ├──> POST|PATCH /plans   ──> [AdminService.createPlan/updatePlan]
         └──> GET /audit-logs     ──> [AdminService.getAuditLogs]
                                               │
                                               ▼
                                      [AuditLog Model]
                                      (Actor, action, target, safe metadata)
```

### Architectural Safeguards
1. **Server-Side Super Admin Provisioning**: No public endpoint grants or requests admin access. Super Admins are provisioned strictly through a server-side CLI (`npm run seed:admin`) or controlled bootstrap logic.
2. **Fail-Closed Authorization Pipeline**: The `requireRole(['super_admin'])` middleware verifies `req.user.role === 'super_admin'`. Missing, inactive, or mismatched roles immediately receive HTTP 403 Forbidden.
3. **Audit Trail Immutability**: All privileged plan modifications and platform changes generate immutable `AuditLog` records containing actor ID, email, action, target, and safe metadata.
4. **Historical Price Snapshot Protection**: Modifying an existing plan's price in the admin catalog does not alter `Subscription.priceSnapshot` on existing active subscriptions, preserving accurate billing history.
5. **Accurate Platform Revenue Computation**: Platform revenue metrics query only `PaymentEvent` documents matching `status: 'success'` and `eventType: 'payment.succeeded'`. Incomplete, pending, or failed transactions are excluded.

---

## 11. Backend Billing, Subscription & Razorpay Architecture

### Entitlement Lifecycle Architecture

```
                                [Business Account]
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                             ▼
                 [New Signup OTP]             [Pre-existing Account]
                         │                             │
                         ▼                             ▼
              [Initial 7-day Trial]          [Safe Backfill Policy]
            (Persistent trialEndsAt)        (Based on createdAt age)
                         │                             │
                         ├─────────────────────────────┘
                         ▼
             [Entitlement Evaluation]
             (Server-derived status)
                         │
        ┌────────────────┼──────────────────────────────┐
        ▼                ▼                              ▼
  [trial_active]   [paid_active]               [promo_active]
  (<= 7 days)    (Monthly/5-Month)              (FREE4YOU)
        │                │                              │
        │                ▼                              ▼
        │        [Calendar Math]               [Lifetime Sentinel]
        │    (Month-end Clamping:             (2099-12-31T23:59:59Z)
        │     e.g. Jan 31 -> Jun 30)
        │
        ▼ (Expiry reached)
  [trial_expired / subscription_expired]
        │
        ├────────────────────────────────┐
        ▼                                ▼
[Public / Essential Routes]    [Protected Product Operations]
- Public QR scan & redirect    - Create QR campaign (POST /qr-campaigns)
- Customer feedback submit     - Update QR campaign (PATCH /qr-campaigns/:id)
- Owner dashboard & reports    - Export high-res QR (GET /qr-campaigns/:id/export)
- Billing status & checkout    - AI Assistance (POST /feedback/ai-assistance)
  (ALWAYS ACCESSIBLE)            (403 Forbidden: TRIAL_EXPIRED / SUBSCRIPTION_REQUIRED)
```

### Commercial Plans & Exact Pricing Rules
- **Monthly Plan**: ₹99 per month (`9900` paise in INR), active for 1 calendar month.
- **Five-Month Package**: ₹399 for 5 calendar months (`39900` paise in INR), one-time payment package. Handled with exact month-end boundary clamping (`addCalendarMonths`).
- **FREE4YOU Promotion**: Code `FREE4YOU` normalizes whitespace/case and grants lifetime access (`promo_active`, sentinel expiry `2099-12-31T23:59:59.999Z`). Enforces single redemption per business and unique index prevents concurrent duplicate redemptions.

### Razorpay Integration & Security Safeguards
1. **Official SDK & Server-Side Creation**: Orders are created server-side with verified amounts in minor currency units (paise). Client-supplied price or status parameters are strictly rejected via Zod schema enforcement.
2. **HMAC SHA-256 Timing-Safe Verification**: Client checkout signatures (`order_id|payment_id`) are verified using `crypto.timingSafeEqual` with `RAZORPAY_KEY_SECRET`.
3. **Raw Body Webhook Verification**: Express JSON parser preserves the raw buffer `req.rawBody` for webhook verification with `RAZORPAY_WEBHOOK_SECRET`.
4. **Idempotency & Deduplication**: Every webhook event is deduplicated using `WebhookEvent` model unique indexes (`{ provider: 1, eventId: 1 }`). Duplicate deliveries return HTTP 200 with `status: 'ignored'`.
5. **Out-of-Order Event Protection**: Late or delayed failure events never overwrite verified active subscriptions.







