# Review Management SaaS — Backend

Production-ready backend for a multi-tenant Review Management SaaS platform, engineered as a clean modular monolith using TypeScript, Node.js, and Express.

---

## 🛠️ Technology Stack (Phase 1 Foundation)

- **Runtime & Language**: Node.js (>=20.0.0, tested on Node v26) with TypeScript (Strict mode, ES2022, NodeNext resolution)
- **Web Framework**: Express
- **Config & Validation**: Zod with zero-leak schema validation
- **Security & Headers**: Helmet, secure CORS allowlist, request ID tracking (`X-Request-Id`)
- **Logging**: Pino & Pino-HTTP with automatic redaction of sensitive credentials and tokens
- **Testing**: Vitest & Supertest for rapid, native TypeScript integration testing
- **Code Quality**: ESLint 9 (Flat Config) & Prettier

---

## 🚀 Quick Start Guide

### 1. Prerequisites

- **Node.js**: `v20.0.0` or higher (run `node -v` to check)
- **npm**: `v10.0.0` or higher (run `npm -v` to check)

### 2. Installation

Navigate to the `backend/` directory and install dependencies:

```bash
cd backend
npm install
```

### 3. Environment Configuration

Create your local `.env` configuration file from the template:

```bash
cp .env.example .env
```

The default values are configured for local development:

```env
NODE_ENV=development
PORT=5050
APP_BASE_URL=http://localhost:5050
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
LOG_LEVEL=info
```

> **Note for macOS users**: Default port is set to `5050` to avoid conflict with the macOS AirPlay Receiver service which occupies port `5000` (`commplex-main`).

### 4. Running the Server

#### Development Mode (with live hot reload via `tsx`):

```bash
npm run dev
```

#### Production Build & Start:

```bash
npm run build
npm run start
```

### 5. Running Quality Checks & Tests

- **Run Tests**:
  ```bash
  npm run test
  ```
- **Type Check**:
  ```bash
  npm run typecheck
  ```
- **Lint Check**:
  ```bash
  npm run lint
  ```
- **Format Code**:
  ```bash
  npm run format
  ```

---

## 📡 Implemented Endpoints (Phase 1)

### Liveness Probe

- **Endpoint**: `GET /api/health`
- **Purpose**: Verifies that the process is running, responding to HTTP traffic, and healthy.
- **Example Response**:
  ```json
  {
    "success": true,
    "data": {
      "status": "healthy",
      "timestamp": "2026-10-24T05:23:16.682Z",
      "uptimeSeconds": 7,
      "environment": "development"
    },
    "meta": {
      "version": "0.1.0"
    }
  }
  ```

### Readiness Probe

- **Endpoint**: `GET /api/ready`
- **Purpose**: Used by reverse proxies, Kubernetes, or load balancers to ensure the application is ready to accept traffic.
- **Example Response**:
  ```json
  {
    "success": true,
    "data": {
      "status": "ready",
      "timestamp": "2026-10-24T05:23:16.682Z",
      "checks": {
        "server": "ok"
      }
    }
  }
  ```

### Error Responses

All errors (including unhandled routes and bad input) strictly adhere to the unified format:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Endpoint 'GET /api/nonexistent' not found"
  }
}
```

---

## 🔒 Security & Reliability Principles

1. **Information Leakage Prevention**: Production errors never leak stack traces, database internals, or file paths.
2. **Structured Logging with Redaction**: Pino automatically redacts authorization headers, cookies, passwords, tokens, and customer contact fields before writing logs.
3. **Graceful Shutdown**: The server handles `SIGINT` and `SIGTERM` cleanly, stops accepting new requests, drains inflight connections, and enforces a 10s maximum timeout before exiting.
4. **Request Tracing**: Every HTTP request receives a unique UUID in `req.id` and the `X-Request-Id` response header for end-to-end request tracing.
