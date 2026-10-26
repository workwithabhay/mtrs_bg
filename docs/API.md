# API Documentation

Base URL: `/api/v1`

All responses follow the unified JSON structure:
- **Success**: `{ "success": true, "data": { ... }, "meta": { ... } }`
- **Error**: `{ "success": false, "error": { "code": "...", "message": "...", "details": [ ... ] } }`

---

## 1. System Probes

### GET `/api/health`
- **Description**: Basic liveness probe. Verifies process health and uptime.
- **Auth**: None (Public)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "status": "healthy",
      "timestamp": "2026-10-24T05:48:00.000Z",
      "uptimeSeconds": 42,
      "environment": "development"
    },
    "meta": { "version": "0.1.0" }
  }
  ```

### GET `/api/ready`
- **Description**: Dependency readiness probe. Checks MongoDB connection readiness.
- **Auth**: None (Public)
- **Responses**:
  - `200 OK` (when database is connected)
  - `503 Service Unavailable` (when database is disconnected)

---

## 2. Authentication APIs

### POST `/api/v1/auth/signup/request-otp`
- **Description**: Initiates passwordless business owner signup. Sends a 6-digit OTP to the provided email.
- **Rate Limit**: 10 requests / 15 minutes
- **Request Body**:
  ```json
  {
    "email": "owner@bakery.com",
    "name": "Jane Baker",
    "businessName": "Artisan Bakery",
    "category": "Bakery",
    "googleReviewUrl": "https://g.page/r/artisan-bakery/review",
    "consentAccepted": true
  }
  ```
- **Responses**:
  - `200 OK` (Verification code sent)
  - `409 Conflict` (If verified account exists)
  - `400 Bad Request` (Invalid format or active cooldown)

---

### POST `/api/v1/auth/signup/verify-otp`
- **Description**: Verifies signup OTP, creates User and Business, and issues an authenticated session.
- **Rate Limit**: 15 attempts / 15 minutes
- **Request Body**:
  ```json
  {
    "email": "owner@bakery.com",
    "otp": "654321"
  }
  ```
- **Response**: `201 Created`
  - Sets `session` (`HttpOnly`, `SameSite=Lax`) and `csrf_token` cookies.

---

### POST `/api/v1/auth/login/request-otp`
- **Description**: Requests login OTP with account enumeration protection.
- **Rate Limit**: 10 requests / 15 minutes
- **Request Body**:
  ```json
  {
    "email": "owner@bakery.com"
  }
  ```
- **Response**: `200 OK` (Always returns generic success message)

---

### POST `/api/v1/auth/login/verify-otp`
- **Description**: Verifies login OTP and creates a new authenticated session.
- **Rate Limit**: 15 attempts / 15 minutes
- **Request Body**:
  ```json
  {
    "email": "owner@bakery.com",
    "otp": "123456"
  }
  ```
- **Response**: `200 OK` (Sets `session` and `csrf_token` cookies)

---

### GET `/api/v1/auth/me`
- **Description**: Returns profile details for the currently authenticated user.
- **Auth Required**: Yes (via `session` cookie or `Authorization: Bearer <token>`)
- **Response**: `200 OK`

---

### POST `/api/v1/auth/logout`
- **Description**: Revokes the current session and clears session cookies.
- **Auth Required**: Yes
- **CSRF Required**: Yes (`X-CSRF-Token` header)
- **Response**: `200 OK`

---

### POST `/api/v1/auth/logout-all`
- **Description**: Revokes all active sessions for the authenticated user and clears session cookies.
- **Auth Required**: Yes
- **CSRF Required**: Yes (`X-CSRF-Token` header)
- **Response**: `200 OK`

---

## 3. Business Management APIs (Phase 4)

All business endpoints strictly require authentication (`session` cookie) and user role `business_owner`. The business boundary is resolved server-side from `req.user.businessId`.

### GET `/api/v1/business`
- **Description**: Retrieves the authenticated owner's business profile.
- **Auth Required**: Yes (`business_owner`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "_id": "6719dd...",
      "name": "Artisan Sourdough Bakery",
      "category": "Bakery",
      "ownerId": "6719dc...",
      "googleReviewUrl": "https://maps.google.com/?cid=123456789",
      "googlePlaceId": null,
      "status": "active",
      "branding": {
        "logoUrl": null,
        "primaryColor": "#2563EB",
        "secondaryColor": "#1E293B"
      },
      "settings": {
        "allowPublicReviews": true,
        "notificationEmail": null,
        "defaultLanguage": "en",
        "headingText": null,
        "subheadingText": null
      },
      "createdAt": "2026-10-24T05:50:00.000Z",
      "updatedAt": "2026-10-24T05:50:00.000Z"
    }
  }
  ```
- **Errors**:
  - `401 Unauthorized`: If not authenticated.
  - `403 Forbidden`: If account or business is suspended.

---

### PATCH `/api/v1/business`
- **Description**: Partially updates permitted business profile fields. Enforces mass-assignment protection (unknown/forbidden fields rejected).
- **Auth Required**: Yes (`business_owner`)
- **CSRF Required**: Yes (`X-CSRF-Token` header)
- **Permitted Fields**:
  - `name`: string (2-120 chars)
  - `category`: string (2-80 chars)
  - `googleReviewUrl`: valid HTTP/HTTPS URL or null
  - `googlePlaceId`: string or null
  - `branding.primaryColor`: valid hex color code
  - `branding.secondaryColor`: valid hex color code
- **Request Body Example**:
  ```json
  {
    "name": "Artisan Sourdough & Pastry",
    "category": "Artisan Bakery",
    "googleReviewUrl": "https://maps.google.com/?cid=987654321",
    "branding": {
      "primaryColor": "#10B981"
    }
  }
  ```
- **Response**: `200 OK` (Returns updated business profile document)
- **Errors**:
  - `400 Bad Request`: If invalid URL, invalid hex color, or forbidden fields (`ownerId`, `status`, `_id`) provided.
  - `403 Forbidden`: If CSRF token is invalid or business is suspended.

---

### GET `/api/v1/business/settings`
- **Description**: Retrieves the authenticated business's current settings.
- **Auth Required**: Yes (`business_owner`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "allowPublicReviews": true,
      "notificationEmail": "alerts@artisanbakery.com",
      "defaultLanguage": "en",
      "headingText": "How was your experience with us?",
      "subheadingText": "We appreciate genuine customer reviews."
    }
  }
  ```

---

### PATCH `/api/v1/business/settings`
- **Description**: Partially updates permitted business settings.
- **Auth Required**: Yes (`business_owner`)
- **CSRF Required**: Yes (`X-CSRF-Token` header)
- **Permitted Fields**:
  - `defaultLanguage`: `'en'`
  - `allowPublicReviews`: boolean
  - `notificationEmail`: valid email string or null
  - `headingText`: string or null (max 120 chars)
  - `subheadingText`: string or null (max 250 chars)
- **Request Body Example**:
  ```json
  {
    "allowPublicReviews": true,
    "notificationEmail": "feedback@artisanbakery.com",
    "headingText": "Rate your visit",
    "subheadingText": "Your review helps us improve every day."
  }
  ```
- **Response**: `200 OK` (Returns updated settings object)
- **Errors**:
  - `400 Bad Request`: If invalid email or forbidden fields provided.
  - `403 Forbidden`: If CSRF token is invalid or business is suspended.

---

## 4. QR Campaign Management APIs

All campaign management endpoints require an authenticated session and `business_owner` role.

### POST `/api/v1/qr-campaigns`
- **Description**: Creates a new QR campaign with optional logo upload (`multipart/form-data` or `application/json`).
- **Auth Required**: Yes (`business_owner`)
- **CSRF Required**: Yes (`X-CSRF-Token` header)
- **Request Fields**:
  - `title`: string (1-100 characters, required)
  - `heading`: string (1-150 characters, required)
  - `description`: string (optional, max 300 characters)
  - `branding.primaryColor`: hex color string (optional, default `#2563EB`)
  - `branding.backgroundColor`: hex color string (optional, default `#FFFFFF`)
  - `logo`: file upload (optional, max 2MB, PNG/JPEG/WEBP only)
- **Response**: `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "_id": "6719dd...",
      "businessId": "6719dc...",
      "title": "Front Counter Stand",
      "heading": "How was your coffee today?",
      "description": "Help us improve our morning service",
      "branding": {
        "primaryColor": "#10B981",
        "backgroundColor": "#F9FAFB",
        "logoKey": "logo-6719dc-uuid.png",
        "logoUrl": "http://localhost:5050/api/v1/storage/files/logo-6719dc-uuid.png"
      },
      "status": "active",
      "publicToken": "a1b2c3d4e5f6789012345678",
      "scanCount": 0,
      "createdAt": "2026-10-24T06:00:00.000Z",
      "updatedAt": "2026-10-24T06:00:00.000Z"
    }
  }
  ```

---

### GET `/api/v1/qr-campaigns`
- **Description**: Lists campaigns for the authenticated tenant with pagination and filtering.
- **Auth Required**: Yes (`business_owner`)
- **Query Parameters**:
  - `page`: integer (default 1)
  - `limit`: integer (default 10, max 50)
  - `status`: `'active'` | `'inactive'` (optional)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": [ ... ],
    "meta": {
      "total": 3,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
  ```

---

### GET `/api/v1/qr-campaigns/:id`
- **Description**: Retrieves a single QR campaign by ID, scoped to the authenticated tenant.
- **Auth Required**: Yes (`business_owner`)
- **Response**: `200 OK` (Returns campaign document)
- **Errors**:
  - `404 Not Found`: If campaign does not exist or belongs to another tenant.

---

### PATCH `/api/v1/qr-campaigns/:id`
- **Description**: Updates permitted fields of a campaign (`title`, `heading`, `description`, `branding`, and optional logo replacement).
- **Auth Required**: Yes (`business_owner`)
- **CSRF Required**: Yes (`X-CSRF-Token` header)
- **Response**: `200 OK` (Returns updated campaign document)

---

### POST `/api/v1/qr-campaigns/:id/deactivate`
- **Description**: Deactivates a campaign. Deactivated campaigns can no longer be scanned or resolved by public visitors.
- **Auth Required**: Yes (`business_owner`)
- **CSRF Required**: Yes (`X-CSRF-Token` header)
- **Response**: `200 OK` (Returns campaign with `status: "inactive"`)

---

### GET `/api/v1/qr-campaigns/:id/export?format=png|svg|pdf`
- **Description**: Exports the branded QR code as a downloadable binary file.
- **Auth Required**: Yes (`business_owner`)
- **Query Parameter**:
  - `format`: `'png'` | `'svg'` | `'pdf'` (required)
- **Responses**:
  - `format=png`: `200 OK` (`Content-Type: image/png`, attachment download)
  - `format=svg`: `200 OK` (`Content-Type: image/svg+xml`, attachment download)
  - `format=pdf`: `200 OK` (`Content-Type: application/pdf`, attachment download with title, heading, and centered high-res QR)
  - `400 Bad Request`: If invalid format requested.

---

## 5. Public QR & Storage APIs

### POST `/api/v1/public/qr/:token/scan`
- **Description**: Public endpoint triggered when a customer scans a physical QR code. Records an anonymous scan event and returns public branding for rendering the landing page.
- **Auth Required**: None (Public)
- **Rate Limit**: 60 requests / minute per IP (`publicScanLimiter`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "title": "Front Counter Stand",
      "heading": "How was your coffee today?",
      "description": "Help us improve our morning service",
      "branding": {
        "primaryColor": "#10B981",
        "backgroundColor": "#F9FAFB",
        "logoUrl": "http://localhost:5050/api/v1/storage/files/logo-uuid.png"
      }
    }
  }
  ```
- **Errors**:
  - `404 Not Found`: If token is invalid or campaign is inactive.

---

### GET `/api/v1/storage/files/:key`
- **Description**: Serves uploaded brand logo assets with HTTP caching.
- **Auth Required**: None (Public CDN-style endpoint)
- **Security**: Validates storage key against path traversal attacks.
- **Response**: `200 OK` with `Cache-Control: public, max-age=86400`

---

## 6. Public Feedback & Review Collection APIs

### GET `/api/v1/public/qr/:token`
- **Description**: Resolves campaign landing page data for a customer scanning a QR code. Returns business name, branding, custom questions, and configured Google review URL without review gating.
- **Auth Required**: None (Public)
- **Rate Limit**: 60 requests / minute per IP (`publicScanLimiter`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "campaign": {
        "title": "Front Counter Stand",
        "heading": "How was your coffee today?",
        "description": "Help us improve our morning service",
        "branding": {
          "primaryColor": "#10B981",
          "backgroundColor": "#F9FAFB",
          "logoUrl": "http://localhost:5050/api/v1/storage/files/logo-uuid.png"
        }
      },
      "business": {
        "name": "Artisan Bakery"
      },
      "googleReviewUrl": "https://g.page/r/artisan-bakery/review",
      "feedbackQuestions": [
        {
          "id": "overall_experience",
          "label": "What did you enjoy most about your visit?",
          "type": "text",
          "required": false
        },
        {
          "id": "service_quality",
          "label": "How was the service speed and attentiveness?",
          "type": "single_choice",
          "required": false,
          "options": ["Excellent", "Good", "Average", "Needs Improvement"]
        }
      ]
    }
  }
  ```

---

### POST `/api/v1/public/qr/:token/feedback`
- **Description**: Submits rating (1–5), authentic written experience, validated question answers, and contact details. Complies with review policy: Google review link is returned to all customers regardless of rating.
- **Auth Required**: None (Public)
- **Rate Limit**: 10 submissions / 15 minutes per IP (`publicFeedbackLimiter`)
- **Request Body**:
  ```json
  {
    "rating": 5,
    "customerName": "Jane Doe",
    "customerEmail": "jane@example.com",
    "customerPhone": "+1 (555) 019-2834",
    "text": "The sourdough and coffee were exceptional!",
    "answers": [
      {
        "questionId": "service_quality",
        "answer": "Excellent"
      }
    ],
    "consentAccepted": true
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "message": "Thank you for your feedback! Your response has been received.",
      "feedbackId": "6719dc1234567890abcdef01",
      "googleReviewUrl": "https://g.page/r/artisan-bakery/review"
    }
  }
  ```
- **Errors**:
  - `400 Bad Request`: If rating < 1 or > 5, both email and phone are missing, consent is false, or invalid question answers are supplied.
  - `404 Not Found`: If campaign is inactive or token is invalid.

---

### POST `/api/v1/public/qr/:token/google-review-click`
- **Description**: Records a click event when a customer chooses the Google review option. Strictly resolves the verified database destination URL to prevent open redirects.
- **Auth Required**: None (Public)
- **Rate Limit**: 30 requests / 15 minutes per IP (`publicReviewClickLimiter`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "destinationUrl": "https://g.page/r/artisan-bakery/review"
    }
  }
  ```
- **Errors**:
  - `400 Bad Request`: If Google review URL is not configured for the business.
  - `404 Not Found`: If campaign is inactive.

---

### POST `/api/v1/public/qr/:token/ai-assistance`
- **Description**: Assists customers in polishing the grammar, clarity, and readability of their own draft feedback. Strictly adheres to facts provided by the customer; does not invent experiences, alter sentiment, gate reviews, or publish to Google.
- **Auth Required**: None (Public anonymous customer journey)
- **Rate Limit**: 15 requests / 15 minutes per IP (`publicAiAssistanceLimiter`)
- **Request Body**:
  ```json
  {
    "draftText": "the coffee was lukewarm and the pastry was stale, waited 25 minutes for order",
    "answers": [
      {
        "questionId": "service_quality",
        "answer": "Needs Improvement"
      }
    ],
    "mode": "improve_clarity"
  }
  ```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "originalDraft": "the coffee was lukewarm and the pastry was stale, waited 25 minutes for order",
        "suggestedText": "The coffee was lukewarm and the pastry was stale. I waited 25 minutes for my order. (How was the service speed and attentiveness?: Needs Improvement)",
        "mode": "improve_clarity"
      }
    }
    ```
  - `400 Bad Request`: If `draftText` is missing, < 10 characters, > 2000 characters, answers exceed 10 items, or unexpected fields (such as contact info) are sent.
  - `404 Not Found`: If public QR token is invalid or campaign is inactive.
  - `503 Service Unavailable`: If AI provider is disabled, unconfigured, timed out, or unavailable (`error.code: "AI_PROVIDER_UNAVAILABLE"`).

- **Frontend Integration Contract**:
  1. The customer types their authentic feedback and answers questions.
  2. Customer clicks an explicit "Improve Clarity with AI" button.
  3. UI displays `suggestedText` separately from `originalDraft`.
  4. Customer can review, freely edit, reject, or accept the suggestion.
  5. The AI endpoint does NOT write to the database or publish anything. Only when the customer clicks "Submit Feedback" (`POST /api/v1/public/qr/:token/feedback`) is feedback saved.

---

## 7. Internal Feedback Management APIs

All internal feedback endpoints require an authenticated session and `business_owner` role.

### GET `/api/v1/feedback`
- **Description**: Lists feedback submissions for the authenticated business owner with filtering and pagination.
- **Auth Required**: Yes (`business_owner`)
- **Query Parameters**:
  - `page`: integer (default 1)
  - `limit`: integer (default 10, max 50)
  - `rating`: integer (1-5, optional)
  - `status`: `'new'` | `'reviewed'` | `'resolved'` (optional)
  - `startDate`: ISO date string (optional)
  - `endDate`: ISO date string (optional)
  - `sortBy`: `'createdAt'` | `'rating'` (default `'createdAt'`)
  - `sortOrder`: `'asc'` | `'desc'` (default `'desc'`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": [
      {
        "_id": "6719dc...",
        "businessId": "6719db...",
        "rating": 5,
        "text": "The sourdough and coffee were exceptional!",
        "answers": [ ... ],
        "status": "new",
        "customerId": {
          "_id": "6719da...",
          "name": "Jane Doe",
          "email": "jane@example.com",
          "phone": "+15550192834",
          "lastVisitedAt": "2026-10-24T06:00:00.000Z"
        },
        "qrCampaignId": {
          "_id": "6719d9...",
          "title": "Front Counter Stand",
          "publicToken": "a1b2c3d4e5f6789012345678"
        },
        "createdAt": "2026-10-24T06:00:00.000Z"
      }
    ],
    "meta": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
  ```

---

### GET `/api/v1/feedback/:id`
- **Description**: Retrieves single feedback submission details scoped to the authenticated tenant.
- **Auth Required**: Yes (`business_owner`)
- **Response**: `200 OK`
- **Errors**:
  - `404 Not Found`: If feedback does not exist or belongs to another business tenant.

---

### PATCH `/api/v1/feedback/:id/status`
- **Description**: Updates internal review workflow status (`'new'` -> `'reviewed'` -> `'resolved'`). Prevents altering customer rating, text, or ownership.
- **Auth Required**: Yes (`business_owner`)
- **CSRF Required**: Yes (`X-CSRF-Token` header)
- **Request Body**:
  ```json
  {
    "status": "reviewed"
  }
  ```
- **Response**: `200 OK` (Returns updated feedback document)
- **Errors**:
  - `400 Bad Request`: If invalid status value or forbidden fields provided.
  - `404 Not Found`: If feedback does not exist or belongs to another tenant.

---

## 8. Owner Dashboard & Analytics APIs (Phase 8)

All dashboard endpoints require an active authenticated session with the `business_owner` role and derive business authorization strictly from the server-managed user session. Rate-limited via `dashboardLimiter` (120 requests / 15 minutes).

### GET `/api/v1/dashboard/summary`
- **Description**: High-level overview of feedback, ratings, and engagement metrics for the business over a selected time window.
- **Auth Required**: Yes (`business_owner`)
- **Query Parameters**:
  - `range`: `'7d'` | `'30d'` | `'90d'` (default `'30d'`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "period": {
        "range": "30d",
        "startDate": "2026-09-24T06:40:00.000Z",
        "endDate": "2026-10-24T06:40:00.000Z"
      },
      "feedbacks": {
        "total": 42,
        "periodTotal": 15,
        "newCount": 5,
        "reviewedCount": 8,
        "resolvedCount": 2
      },
      "ratings": {
        "averageRating": 4.67,
        "totalRatings": 15
      },
      "engagement": {
        "totalScansAllTime": 140,
        "periodScans": 52,
        "googleReviewClicks": 18,
        "activeCampaignsCount": 3
      },
      "semanticNotes": {
        "scans": "Raw QR scan events recorded by the platform (not unique visitors).",
        "googleReviewClicks": "Raw clicks on the external Google Review link recorded by the platform (not verified published reviews on Google)."
      }
    }
  }
  ```

---

### GET `/api/v1/dashboard/feedback-trends`
- **Description**: Daily time-series breakdown of feedback volume, average star ratings, QR scans, and Google review clicks. Guarantees zero-event days are populated for consistent visual charting.
- **Auth Required**: Yes (`business_owner`)
- **Query Parameters**:
  - `range`: `'7d'` | `'30d'` | `'90d'` (default `'30d'`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "period": {
        "range": "7d",
        "startDate": "2026-10-17T06:40:00.000Z",
        "endDate": "2026-10-24T06:40:00.000Z"
      },
      "trends": [
        {
          "date": "2026-10-17",
          "feedbackCount": 0,
          "averageRating": null,
          "scanCount": 4,
          "googleReviewClicks": 1
        },
        {
          "date": "2026-10-18",
          "feedbackCount": 3,
          "averageRating": 4.67,
          "scanCount": 12,
          "googleReviewClicks": 5
        }
      ]
    }
  }
  ```

---

### GET `/api/v1/dashboard/ratings-breakdown`
- **Description**: Distribution of star ratings from 1 to 5 stars with counts and percentages over the selected period.
- **Auth Required**: Yes (`business_owner`)
- **Query Parameters**:
  - `range`: `'7d'` | `'30d'` | `'90d'` (default `'30d'`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "period": {
        "range": "30d",
        "startDate": "2026-09-24T06:40:00.000Z",
        "endDate": "2026-10-24T06:40:00.000Z"
      },
      "totalRatings": 15,
      "averageRating": 4.67,
      "breakdown": [
        { "star": 1, "count": 0, "percentage": 0 },
        { "star": 2, "count": 1, "percentage": 6.7 },
        { "star": 3, "count": 0, "percentage": 0 },
        { "star": 4, "count": 4, "percentage": 26.7 },
        { "star": 5, "count": 10, "percentage": 66.7 }
      ]
    }
  }
  ```

---

### GET `/api/v1/dashboard/qr-performance`
- **Description**: Performance metrics for each of the owner's QR campaigns, including period scans, feedback count, and Google review clicks.
- **Auth Required**: Yes (`business_owner`)
- **Query Parameters**:
  - `range`: `'7d'` | `'30d'` | `'90d'` (default `'30d'`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "period": {
        "range": "30d",
        "startDate": "2026-09-24T06:40:00.000Z",
        "endDate": "2026-10-24T06:40:00.000Z"
      },
      "campaigns": [
        {
          "campaignId": "6719dc1234567890abcdef01",
          "title": "Front Counter Stand",
          "heading": "How was your coffee today?",
          "status": "active",
          "publicToken": "camp_abc123xyz456",
          "totalScansAllTime": 85,
          "periodScans": 34,
          "periodFeedbacks": 12,
          "periodGoogleReviewClicks": 9,
          "createdAt": "2026-10-01T10:00:00.000Z"
        }
      ]
    }
  }
  ```

---

### GET `/api/v1/dashboard/recent-feedback`
- **Description**: Privacy-hardened paginated preview of recent customer feedback. Strips all customer PII (no emails, no phone numbers) and truncates text preview to <= 150 characters.
- **Auth Required**: Yes (`business_owner`)
- **Query Parameters**:
  - `page`: integer (min 1, default 1)
  - `limit`: integer (min 1, max 20, default 5)
  - `status`: `'new'` | `'reviewed'` | `'resolved'` (optional)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "6719de1234567890abcdef02",
        "rating": 5,
        "status": "new",
        "textPreview": "The pastries were warm and the cappuccino was perfectly foamed...",
        "hasText": true,
        "campaignTitle": "Front Counter Stand",
        "createdAt": "2026-10-24T06:15:00.000Z"
      }
    ],
    "meta": {
      "total": 15,
      "page": 1,
      "limit": 5,
      "totalPages": 3
    }
  }
  ```

---

## 8. Billing, Subscription & Payment APIs

### Commercial Plans Overview
- **Plan A — Monthly**: ₹99 per month (`9900` paise in INR), 1 calendar month duration.
- **Plan B — Five-Month Package**: ₹399 for 5 calendar months (`39900` paise in INR), one-time payment package with calendar-month boundary clamping.
- **Plan C — FREE4YOU Promotional Code**: Code `FREE4YOU` grants lifetime-free access while active.
- **7-Day Free Trial**: Automatically and persistently provisioned on new business account creation.

---

### GET `/api/v1/billing/plans`
- **Description**: Public endpoint listing all active, published subscription plans with integer minor prices (paise in INR), billing intervals, and feature limits.
- **Auth**: None (Public, bounded by rate limiter)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": [
      {
        "planId": "monthly",
        "name": "Monthly Plan",
        "description": "Full access to ReviewFlow with monthly billing at ₹99/month.",
        "price": 9900,
        "currency": "INR",
        "interval": "monthly",
        "features": [
          "Unlimited QR Campaigns",
          "Unlimited monthly customer scans",
          "AI Review Feedback Assistance",
          "Custom branding & logo themes",
          "Owner analytics & exports"
        ],
        "limits": {
          "maxCampaigns": 100,
          "maxMonthlyScans": 50000,
          "aiAssistanceEnabled": true
        }
      },
      {
        "planId": "five_month",
        "name": "Five-Month Package",
        "description": "Five calendar months of paid access for ₹399 one-time payment.",
        "price": 39900,
        "currency": "INR",
        "interval": "five_month",
        "features": [
          "5 full calendar months of access",
          "Unlimited QR Campaigns & scans",
          "AI Review Feedback Assistance",
          "Custom branding & priority analytics"
        ],
        "limits": {
          "maxCampaigns": 100,
          "maxMonthlyScans": 50000,
          "aiAssistanceEnabled": true
        }
      }
    ]
  }
  ```

---

### GET `/api/v1/billing/subscription`
- **Description**: Retrieves the authenticated business owner's current subscription, entitlement source, days remaining, and trial timestamps.
- **Auth Required**: Yes (`business_owner`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "id": "6719de1234567890abcdef03",
      "planId": "trial",
      "planName": "7-Day Free Trial",
      "status": "active",
      "entitlementStatus": "trial_active",
      "canAccessProduct": true,
      "entitlementSource": "trial",
      "billingInterval": "monthly",
      "priceSnapshot": {
        "amount": 0,
        "currency": "INR"
      },
      "currentPeriodStart": "2026-10-26T10:00:00.000Z",
      "currentPeriodEnd": "2026-11-02T10:00:00.000Z",
      "trialEndsAt": "2026-11-02T10:00:00.000Z",
      "daysRemaining": 7,
      "isLifetime": false,
      "cancelAtPeriodEnd": false
    }
  }
  ```

---

### POST `/api/v1/billing/subscription/checkout`
- **Description**: Initiates a payment checkout order with Razorpay (or mock provider in development/test). Prices and currencies are resolved server-side.
- **Auth Required**: Yes (`business_owner`)
- **Headers**: `X-CSRF-Token: <csrf_token>`
- **Request Body**:
  ```json
  {
    "planId": "monthly",
    "interval": "monthly"
  }
  ```
- **Responses**:
  - `200 OK` (Order initiated):
    ```json
    {
      "success": true,
      "data": {
        "checkoutId": "order_DAvDpkP99",
        "provider": "razorpay",
        "isSimulated": false,
        "status": "initiated",
        "amount": 9900,
        "currency": "INR",
        "planId": "monthly",
        "interval": "monthly",
        "keyId": "rzp_test_public_key_id",
        "message": "Razorpay order created successfully. Awaiting customer checkout."
      }
    }
    ```

---

### POST `/api/v1/billing/verify-payment`
- **Description**: Verifies checkout HMAC SHA-256 signature server-side after customer completes Razorpay payment and activates paid entitlement.
- **Auth Required**: Yes (`business_owner`)
- **Headers**: `X-CSRF-Token: <csrf_token>`
- **Request Body**:
  ```json
  {
    "orderId": "order_DAvDpkP99",
    "paymentId": "pay_DAvE1rA00",
    "signature": "9ef356ba02a8..."
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "verified": true,
      "checkoutId": "order_DAvDpkP99",
      "paymentReference": "pay_DAvE1rA00",
      "status": "succeeded",
      "isSimulated": false,
      "amount": 9900,
      "currency": "INR",
      "subscription": {
        "id": "6719de1234567890abcdef03",
        "planId": "monthly",
        "status": "active",
        "entitlementSource": "paid_subscription",
        "currentPeriodStart": "2026-10-26T10:00:00.000Z",
        "currentPeriodEnd": "2026-11-26T10:00:00.000Z"
      },
      "message": "Payment verified successfully and paid access activated."
    }
  }
  ```

---

### POST `/api/v1/billing/redeem-promo`
- **Description**: Redeems promotional code (e.g. `FREE4YOU`) for lifetime-free access. Normalizes whitespace and casing, enforces single redemption per business, and prevents concurrent redemptions.
- **Auth Required**: Yes (`business_owner`)
- **Headers**: `X-CSRF-Token: <csrf_token>`
- **Request Body**:
  ```json
  {
    "code": "FREE4YOU"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "code": "FREE4YOU",
      "isLifetime": true,
      "message": "Promotional code FREE4YOU redeemed successfully! Lifetime-free access granted.",
      "subscription": {
        "id": "6719de1234567890abcdef03",
        "planId": "free4you",
        "status": "active",
        "entitlementSource": "promo_free4you",
        "currentPeriodEnd": "2099-12-31T23:59:59.999Z"
      }
    }
  }
  ```

---

### POST `/api/v1/billing/webhook`
- **Description**: Public webhook receiver for Razorpay events. Verifies raw request body with HMAC SHA-256 using `RAZORPAY_WEBHOOK_SECRET` and performs idempotent deduplication using `WebhookEvent` records.
- **Auth Required**: None (Razorpay server-to-server)
- **Headers**: `X-Razorpay-Signature: <hmac_sha256_signature>`
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "status": "processed",
      "eventId": "event_123456789",
      "eventType": "payment.captured"
    }
  }
  ```

---

### POST `/api/v1/billing/subscription/cancel`
- **Description**: Requests cancellation for the current subscription. Supports immediate cancellation or cancellation at the end of the current billing cycle.
- **Auth Required**: Yes (`business_owner`)
- **Headers**: `X-CSRF-Token: <csrf_token>`
- **Request Body**:
  ```json
  {
    "immediate": false
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "isCancelled": true,
      "status": "active",
      "cancelAtPeriodEnd": true,
      "cancelledAt": "2026-10-26T10:00:00.000Z",
      "currentPeriodEnd": "2026-11-26T10:00:00.000Z",
      "message": "Subscription will remain active until the end of the current billing period."
    }
  }
  ```

---

### GET `/api/v1/billing/payment-history`
- **Description**: Returns paginated audit events of transactions for the authenticated business. Never leaks secrets or customer card credentials.
- **Auth Required**: Yes (`business_owner`)
- **Query Parameters**:
  - `page`: integer (min 1, default 1)
  - `limit`: integer (min 1, max 20, default 10)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "6719de1234567890abcdef04",
          "provider": "mock",
          "isSimulated": true,
          "eventType": "payment.succeeded",
          "status": "success",
          "amount": 99900,
          "currency": "INR",
          "checkoutId": "mock_chk_46a36f9a-8e2b-4d4e-b5f7-66a87c53d100",
          "paymentReference": "mock_pay_13b56c8d-7a1f-4f2b-a3d8-77b96d54e201",
          "failureReason": null,
          "createdAt": "2026-10-24T06:50:00.000Z"
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 1,
        "totalPages": 1
      }
    }
  }
  ```

---

## 9. Super Admin APIs (Phase 10)

Base Path: `/api/v1/admin`  
Authorization: Required (`super_admin`)  
Rate Limit: 120 requests / 15 minutes per IP (`adminLimiter`)

### GET `/api/v1/admin/overview`
- **Description**: Returns accurate platform-wide high-level metrics derived from real database records.
- **Auth Required**: Yes (`super_admin`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "businesses": {
        "total": 24,
        "active": 22,
        "suspended": 1,
        "pending": 1
      },
      "users": {
        "total": 26,
        "businessOwners": 24,
        "superAdmins": 2
      },
      "subscriptions": {
        "total": 24,
        "active": 18,
        "pending": 2,
        "cancelled": 3,
        "expired": 1
      },
      "revenue": {
        "totalAmountMinor": 2397600,
        "currency": "INR",
        "successfulTransactionsCount": 24,
        "isSimulated": true,
        "note": "Revenue includes only verified successful payment events (simulated mock transactions in development)."
      },
      "recentActivity": [
        {
          "id": "6719de1234567890abcdef05",
          "action": "plan.updated",
          "actorEmail": "admin@platform.com",
          "targetType": "Plan",
          "targetId": "starter",
          "createdAt": "2026-10-24T07:00:00.000Z"
        }
      ]
    }
  }
  ```

---

### GET `/api/v1/admin/businesses`
- **Description**: Searchable, paginated list of all businesses on the platform with safe owner details.
- **Auth Required**: Yes (`super_admin`)
- **Query Parameters**:
  - `page`: integer (default 1)
  - `limit`: integer (default 10, max 50)
  - `query`: string (optional, searches name and category)
  - `status`: `'all'` | `'active'` | `'suspended'` | `'pending_verification'` (default `'all'`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "6719de1234567890abcdef01",
          "name": "Artisan Bakery",
          "category": "Bakery",
          "status": "active",
          "owner": {
            "id": "6719de1234567890abcdef00",
            "name": "Jane Baker",
            "email": "owner@bakery.com"
          },
          "subscriptionSummary": {
            "planId": "starter",
            "status": "active",
            "billingInterval": "monthly",
            "currentPeriodEnd": "2026-11-24T06:50:00.000Z"
          },
          "createdAt": "2026-10-20T10:00:00.000Z"
        }
      ],
      "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
    }
  }
  ```

---

### GET `/api/v1/admin/businesses/:id`
- **Description**: Detailed inspection view for a specific business, including branding, campaigns count, and feedback count.
- **Auth Required**: Yes (`super_admin`)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "id": "6719de1234567890abcdef01",
      "name": "Artisan Bakery",
      "category": "Bakery",
      "status": "active",
      "googleReviewUrl": "https://g.page/r/artisan-bakery/review",
      "googlePlaceId": "ChIJN1t_tDeuEmsRUsoyG83frY4",
      "branding": {
        "primaryColor": "#2563EB",
        "secondaryColor": "#1E293B",
        "logoUrl": null
      },
      "owner": {
        "id": "6719de1234567890abcdef00",
        "name": "Jane Baker",
        "email": "owner@bakery.com"
      },
      "subscriptionSummary": {
        "planId": "starter",
        "status": "active",
        "billingInterval": "monthly",
        "currentPeriodEnd": "2026-11-24T06:50:00.000Z"
      },
      "stats": {
        "campaignsCount": 3,
        "feedbacksCount": 18
      },
      "createdAt": "2026-10-20T10:00:00.000Z"
    }
  }
  ```

---

### GET `/api/v1/admin/subscriptions`
- **Description**: Cross-tenant paginated subscription listing with status and plan filtering.
- **Auth Required**: Yes (`super_admin`)
- **Query Parameters**:
  - `page`: integer (default 1)
  - `limit`: integer (default 10, max 50)
  - `status`: `'all'` | `'active'` | `'pending'` | `'cancelled'` | `'expired'`
  - `planId`: string (optional)
- **Response**: `200 OK`

---

### GET `/api/v1/admin/plans`
- **Description**: Returns all subscription plans, including unpublished/archived tiers.
- **Auth Required**: Yes (`super_admin`)
- **Response**: `200 OK`

---

### POST `/api/v1/admin/plans`
- **Description**: Privileged creation of a new subscription plan with integer minor pricing.
- **Auth Required**: Yes (`super_admin`)
- **Headers**: `X-CSRF-Token: <csrf_token>`
- **Request Body**:
  ```json
  {
    "planId": "enterprise-custom",
    "name": "Enterprise Custom",
    "description": "High volume enterprise tier",
    "price": 999900,
    "currency": "INR",
    "interval": "yearly",
    "isPublished": true,
    "features": ["Dedicated Account Manager", "Custom integrations"],
    "limits": {
      "maxCampaigns": 100,
      "maxMonthlyScans": 50000,
      "aiAssistanceEnabled": true
    },
    "sortOrder": 4
  }
  ```
- **Response**: `201 Created`

---

### PATCH `/api/v1/admin/plans/:id`
- **Description**: Privileged update of an existing plan. Updating prices preserves historical subscription snapshots.
- **Auth Required**: Yes (`super_admin`)
- **Headers**: `X-CSRF-Token: <csrf_token>`
- **Request Body**:
  ```json
  {
    "price": 149900,
    "isPublished": true
  }
  ```
- **Response**: `200 OK`

---

### GET `/api/v1/admin/audit-logs`
- **Description**: Paginated security audit trail of privileged administrative events.
- **Auth Required**: Yes (`super_admin`)
- **Query Parameters**:
  - `page`: integer (default 1)
  - `limit`: integer (default 20, max 50)
  - `action`: string (optional)
  - `targetType`: string (optional)
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "6719de1234567890abcdef06",
          "actorId": "6719de1234567890abcdef00",
          "actorEmail": "admin@platform.com",
          "action": "plan.created",
          "targetType": "Plan",
          "targetId": "enterprise-custom",
          "metadata": { "name": "Enterprise Custom", "price": 999900 },
          "ipAddress": "127.0.0.1",
          "userAgent": "Mozilla/5.0 ...",
          "createdAt": "2026-10-24T07:05:00.000Z"
        }
      ],
      "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
    }
  }
  ```




