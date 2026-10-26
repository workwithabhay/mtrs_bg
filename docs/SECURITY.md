# Security Architecture & Policies

This document details the security principles, cryptographic designs, and authentication safeguards implemented across the platform.

---

## 1. Passwordless Email OTP Architecture

### Cryptographic Security
- **OTP Generation**: Uses Node.js `node:crypto.randomInt(100000, 1000000)` to generate uniform, cryptographically unpredictable 6-digit numeric codes.
- **Keyed HMAC Hashing**: Plaintext OTP values are **never stored** in MongoDB. Challenges store an HMAC-SHA256 digest keyed with `OTP_SECRET`:
  $$\text{HMAC-SHA256}(\text{OTP\_SECRET}, \text{email} \parallel ":" \parallel \text{purpose} \parallel ":" \parallel \text{otp})$$
- **Timing-Safe Comparison**: Verification uses `crypto.timingSafeEqual` between binary digest buffers to eliminate timing side-channel attacks.
- **Purpose Binding**: Each challenge is bound to its explicit purpose (`signup` or `login`). A login challenge cannot verify a signup, and vice versa.

### Lifecycle & Abuse Controls
- **Challenge Lifetime**: Valid for **5 minutes** (`OTP_TTL_MINUTES=5`). Both MongoDB TTL indexes and application-level timestamps enforce expiry.
- **Attempt Limiting**: Maximum **3 attempts** (`OTP_MAX_ATTEMPTS=3`). Any incorrect attempt increments the counter; upon reaching 3, the challenge is immediately consumed.
- **Resend Cooldown**: A mandatory **60-second cooldown** (`OTP_RESEND_COOLDOWN_SECONDS=60`) prevents email inbox flooding.
- **Single-Use Guarantee**: Successful verification immediately marks `isConsumed = true`. Consumed challenges cannot be replayed.
- **Challenge Supersession**: Issuing a new OTP for an email immediately invalidates any prior unconsumed challenges for that purpose.

---

## 2. Multi-Tenant Isolation & Authorization

Multi-tenancy isolation is enforced at both the middleware and database service layers:

### Server-Derived Tenant Context
- A client is never permitted to pass a `businessId` in request headers, query parameters, or request bodies to gain access to a business.
- On every protected request, `authenticate` derives the authenticated user and resolves their assigned `businessId` directly from the database session.

### Dual-Key Query Scoping
All tenant read and update queries enforce dual-key scoping:
```ts
Business.findOne({ _id: req.user.businessId, ownerId: req.user._id });
```
Even if an authenticated owner attempts to manipulate request payloads, access to another tenant's document is strictly rejected with a `404 Not Found` (preventing information disclosure of other tenants' existence).

### Mass Assignment Defense
Every update endpoint employs strict Zod validation with `.strict()`.
- Allowed profile fields: `name`, `category`, `googleReviewUrl`, `googlePlaceId`, `branding.primaryColor`, `branding.secondaryColor`.
- Allowed settings fields: `defaultLanguage`, `allowPublicReviews`, `notificationEmail`, `headingText`, `subheadingText`.
- Any attempt to supply system-managed fields (`ownerId`, `_id`, `status`, `subscription`, `role`) triggers an immediate `400 Bad Request` validation failure.

---

## 3. Account Enumeration Defense

- The `POST /api/v1/auth/login/request-otp` endpoint returns an identical generic response:
  > *"If an active account is registered with this email, a verification code has been sent."*
- Whether the email is registered, unregistered, or suspended, an attacker receives the exact same HTTP 200 payload and timing profile.

---

## 4. Session Security & Cookie Hardening

### Token Generation & Storage
- **High-Entropy Tokens**: Generated using `crypto.randomBytes(32).toString('hex')` (256-bit entropy).
- **Zero Plaintext Storage**: The database stores only the HMAC-SHA256 hash of the session token. Compromising the database does not grant session access.

### Cookie Configuration
Session cookies use hardened security flags:
```ts
{
  httpOnly: true,                                // Prevents XSS script access
  secure: process.env.NODE_ENV === 'production', // Enforces HTTPS transmission
  sameSite: 'lax',                               // Mitigates cross-site request forgery
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,               // 7 days
}
```

---

## 5. Cross-Site Request Forgery (CSRF) Defense

We implement the **Double-Submit Cookie Pattern**:
1. Upon successful authentication (signup or login), the server issues a companion `csrf_token` cookie (non-httpOnly).
2. For all state-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) on cookie-authenticated requests, the client must submit the token in the `X-CSRF-Token` header.
3. The `csrfProtection` middleware verifies:
   $$\text{req.cookies.csrf\_token} === \text{req.headers['x-csrf-token']}$$
4. Both `PATCH /api/v1/business` and `PATCH /api/v1/business/settings` require this valid CSRF token.

---

## 6. Rate Limiting

Rate limiting is enforced at the network entrypoint via `express-rate-limit`:
- **OTP Request Endpoints**: Max 10 requests per 15-minute window per IP.
- **OTP Verification Endpoints**: Max 15 attempts per 15-minute window per IP.
- Exceeding the threshold triggers HTTP `429 Too Many Requests` with the standardized error code `RATE_LIMIT_EXCEEDED`.

---

## 7. Sensitive Data Redaction in Logging

Pino logger automatically sanitizes log streams before emission:
- Sensitive paths redacted: `authorization`, `cookie`, `x-csrf-token`, `password`, `otp`, `token`, `secret`.
- Passwords inside MongoDB connection URIs are masked: `mongodb+srv://user:*****@cluster.net`.

---

## 8. File Upload & Asset Storage Safeguards

Logo file uploads are hardened against code execution, injection, and path traversal:
- **Magic Bytes File Signature Verification**: In `validateImageSignature()`, the application checks the raw binary header bytes (`Buffer[0..11]`). Only genuine PNG (`\x89PNG`), JPEG (`\xFF\xD8\xFF`), and WEBP (`RIFF....WEBP`) buffers are accepted. Extensions and client MIME types are never trusted blindly.
- **Strict SVG Prohibition**: SVG uploads are explicitly rejected. SVGs can carry arbitrary JavaScript (`<script>` or `onload` vectors) resulting in Stored XSS.
- **Payload Size Capping**: File uploads are bounded at **2MB** (`MAX_UPLOAD_SIZE_BYTES=2097152`). Oversized files are rejected before disk buffering.
- **Server-Controlled Storage Keys**: Filenames provided by users are discarded. Assets receive cryptographically unique, server-controlled keys: `logo-${businessId}-${randomUUID()}.${ext}`.
- **Path Traversal Protection**: Storage providers validate that keys contain no traversal tokens (`..`, `/`, `\`) and resolve strictly inside the storage directory boundary.
- **Isolation of File Paths**: Internal filesystem paths are never returned in JSON API responses. Clients receive a normalized public URL (`/api/v1/storage/files/:key`).

---

## 9. QR Token Security & Privacy-Conscious Telemetry

- **Cryptographic Random Tokens**: Public QR URLs use a 12-byte cryptographically random hex token (`crypto.randomBytes(12)`). Internal MongoDB ObjectIDs are never exposed in public QR codes.
- **Collision Resistance**: Token generation includes an automated retry loop ensuring uniqueness in the unlikely event of an entropy collision.
- **Host Header Injection Defense**: Public URLs are always built using the validated `PUBLIC_APP_URL` environment configuration, preventing cache poisoning or phishing links from untrusted `Host` or `X-Forwarded-Host` headers.
- **Deactivation Enforcement**: Once a campaign is marked inactive, public scan requests return `404 Not Found` immediately.
- **Zero PII Telemetry**: QR scan tracking intentionally excludes raw IP addresses, user agent fingerprints, cookies, and customer identities. Only coarse timestamps and truncated referrer domains are stored.
- **Abuse Prevention**: Public scan endpoints are guarded by `publicScanLimiter` (60 requests per minute per IP) to prevent scan inflation attacks.

---

## 10. Feedback Privacy, Contact Validation & Anti-Abuse

### Minimal Contact Collection
- Customers are required to provide at least one contact channel (`customerEmail` or `customerPhone`) for follow-up and verification.
- Phone numbers are validated and sanitized via `normalizePhoneNumber()` to standard E.164 digits without storing unnecessary regional metadata.
- Email addresses are normalized to lowercase and trimmed.
- Contact details are accessible only to the authenticated business owner; public API responses never echo or expose customer contact records.

### Anti-Abuse & Duplicate Submission Idempotency
- **IP Rate Limiting**: `POST /api/v1/public/qr/:token/feedback` is limited to 10 submissions per 15-minute window per IP (`publicFeedbackLimiter`).
- **Short-Window Deduplication**: If a customer submits identical feedback for the same campaign within a 60-second sliding window, the backend responds idempotently with the existing confirmation, preventing duplicate rows or accidental double-tap submissions.

### Non-Gated Public Review Compliance
- The system enforces zero rating discrimination. 1-star through 5-star submissions receive identical access to public review links.
- The Google review click endpoint (`POST /api/v1/public/qr/:token/google-review-click`) resolves strictly to the database-configured URL, defeating open-redirect attempts.

---

## 11. AI Assistance Privacy, Prompt Injection Defense & Safety Controls

### Zero-PII Forwarding Policy
- The AI assistance input schema (`aiAssistanceSchema`) uses `.strict()` validation, explicitly rejecting contact fields (`customerName`, `customerEmail`, `customerPhone`).
- Only customer-authored draft text and relevant survey question answers are passed to the AI provider. No personal identifying information (PII) is ever shared with external AI providers.

### Prompt Injection Mitigation & Untrusted Data Boundary
- Customer text is treated as inherently untrusted data.
- Input is delimited within explicit boundary tags: `<customer_draft>...</customer_draft>` and `<question_context>...</question_context>`.
- The server-enforced system instruction mandates that the model treat all enclosed text as literal content to be edited, strictly ignoring any commands attempting to override system rules (e.g. "Ignore previous instructions", "Write a 5-star review").

### Anti-Whitewashing & Factual Fidelity
- The system instruction strictly prohibits fabricating events, staff interactions, products, or dates not explicitly stated in the customer draft.
- The model is forbidden from altering customer sentiment: complaints and dissatisfaction remain unsoftened, preventing fraudulent reputation manipulation.

### Credential & Infrastructure Protection
- AI provider credentials (`AI_API_KEY`) reside exclusively in environment variables and are never exposed to clients or logged.
- Mock providers are strictly forbidden from running in production through startup validation in `env.ts`.
- In unconfigured or disabled states, the server immediately returns HTTP 503 (`AI_PROVIDER_UNAVAILABLE`) without making external requests.

### Output Sanitization & Abuse Prevention
- Responses are checked and sanitized: whitespace is trimmed, wrapping quotes/markdown code blocks are stripped, and output size is bounded (5–2500 characters).
- Endpoints are rate-limited via `publicAiAssistanceLimiter` (15 requests per 15 minutes per IP).
- External provider calls use strict timeouts (`AbortSignal.timeout(AI_TIMEOUT_MS)`), safely handling failures and timeouts with HTTP 503 without leaking upstream provider error bodies.

---

## 12. Owner Dashboard Security & Analytics Privacy Controls (Phase 8)

### Server-Derived Tenant Isolation
- Dashboard endpoints strictly resolve the target business from `req.businessId`, which is derived server-side from the authenticated session and user document.
- Requests containing client-supplied `businessId` query parameters or headers are ignored or rejected, completely preventing horizontal privilege escalation across tenants.

### Zero-PII Analytics Previews
- The `GET /api/v1/dashboard/recent-feedback` endpoint strictly excludes customer contact fields: email addresses, phone numbers, and internal customer ObjectIDs are never selected from MongoDB or returned in JSON responses.
- The text preview is bounded at 150 characters (`slice(0, 147) + '...'`), preventing unbounded data transfer or accidental exposure of sensitive embedded content.

### Query Boundary Enforcement & Denial of Service Protection
- Query parameters are strictly validated with Zod schemas.
- Date range parameters accept only enumerated values (`7d`, `30d`, `90d`), preventing arbitrary or expensive full-history table scans.
- Pagination limits are enforced server-side (page size capped at 20 items maximum).
- Network entrypoints are protected by `dashboardLimiter` (120 requests per 15-minute window per IP).

---

## 13. Billing & Subscription Security Controls (Phase 9)

### Fail-Safe Production Guardrails
- **Mock Mode Lockout**: In production (`NODE_ENV === 'production'`), startup validation in `env.ts` immediately exits if `PAYMENT_PROVIDER === 'mock'` or `ENABLE_DEV_MOCK_PAYMENTS === true`.
- **Runtime Guard**: In `getPaymentProvider()`, invocation in production throws a `ServiceUnavailableError` with `BILLING_UNAVAILABLE`, guaranteeing mock checkouts cannot be executed in live production environments.

### Price & Plan Tampering Defense
- **Zero Client Trust on Pricing**: Checkout endpoints reject any client attempts to specify `price`, `currency`, `status`, or `currentPeriodEnd`.
- **Schema Strictness**: `checkoutSchema.strict()` and `cancelSubscriptionSchema.strict()` reject any unauthorized or unexpected properties with HTTP 400.
- **Published Plans Only**: `BillingService.createMockCheckout` verifies that the requested `planId` exists in the database and has `isPublished: true`. Clients cannot subscribe to archived, deleted, or unreleased plans.

### Tenant Isolation & Payment Privacy
- **Server-Derived Business Context**: Subscription and payment history operations always query by `req.businessId` derived from the session token.
- **Cross-Tenant Prevention**: An owner from Business A can never access, checkout, cancel, or view subscriptions or payment events belonging to Business B.
- **Zero Sensitive Data Storage**: Payment events record only high-level status, simulated references, and integer minor amounts. Card numbers, expiration dates, CVVs, and banking secrets are never accepted or stored.
- **Audit Ledger Immutability & Idempotency**: Payment events have unique `idempotencyKey` values preventing duplicate activations or replay attacks.

---

## 14. Super Admin Security Controls & Provisioning (Phase 10)

### Zero Public Admin Creation
- Public registration (`POST /api/v1/auth/signup/request-otp` and `verifySignupOtp`) hardcodes `role: 'business_owner'`. No client request payload or query parameter can override this.
- Privilege escalation via profile updates is prevented: `Business` and `User` models are protected with `.strict()` Zod schemas rejecting any `role` modifications.

### Server-Side CLI Provisioning Procedure
Super Admin accounts must be explicitly provisioned directly through the host server environment using the CLI script:
```bash
# Provision a new Super Admin or promote an existing user:
npm run seed:admin -- --email="admin@platform.com" --name="Platform Administrator"
```
Or via environment variables in automated deployment pipelines:
```bash
SUPER_ADMIN_EMAIL="admin@platform.com" SUPER_ADMIN_NAME="Platform Administrator" npm run seed:admin
```
- **Zero Hardcoded Secrets**: No admin emails, OTPs, or passwords are hardcoded in source control.
- **Passwordless OTP Consistency**: Super Admins log in using the same cryptographically secure email OTP mechanism as business owners.

### How to Revoke or Disable Admin Access
To revoke Super Admin access immediately without downtime:
1. Update user role or status directly in MongoDB:
   ```js
   db.users.updateOne({ email: "admin@platform.com" }, { $set: { role: "business_owner", status: "suspended" } });
   ```
2. Revoke active sessions:
   ```js
   db.sessions.updateMany({ userId: ObjectId("...") }, { $set: { isRevoked: true, revokedAt: new Date() } });
   ```
The user's next request will fail at `authenticate` (session revoked) or `requireRole(['super_admin'])` (HTTP 403 Forbidden).

### Audit Trail Data Integrity
- All administrative actions (e.g. plan creation, updates) generate structured `AuditLog` documents.
- Audit records store only actor ID, actor email, action, target, and sanitized metadata. They never store passwords, OTPs, session tokens, webhook secrets, or customer PII.
- Ordinary users cannot view, edit, or delete audit logs through any public API endpoint.






