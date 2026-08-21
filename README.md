<div align="center">

# 📣 SyncPost

**Write once, publish everywhere.** Compose a post, adapt it per platform, and publish or schedule it across every connected social account from one place.

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Nx](https://img.shields.io/badge/Nx-143055?style=for-the-badge&logo=nx&logoColor=white)](https://nx.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=for-the-badge&logo=stripe&logoColor=white)](https://stripe.com/)
[![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)

[![strict](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](./tsconfig.base.json)
[![tests](https://img.shields.io/badge/tests-64_passing-success?style=flat-square&logo=jest&logoColor=white)](#-testing)
[![CI](https://img.shields.io/badge/CI-nx_affected-143055?style=flat-square&logo=githubactions&logoColor=white)](./.github/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#-license)

</div>

---

## 📑 Table of contents

| | | |
|---|---|---|
| [⚡ Quick start](#-quick-start) | [🏗️ Architecture](#️-architecture) | [🧩 Tech stack](#-tech-stack) |
| [🔑 Environment](#-environment-variables) | [🔄 Core flows](#-core-flows) | [➕ Adding a platform](#-adding-a-social-platform) |
| [📁 Project layout](#-project-layout) | [🛠️ Commands](#️-command-reference) | [🌐 API reference](#-api-reference) |
| [🧪 Testing](#-testing) | [🔒 Security](#-security-model) | [🚀 Deployment](#-deployment) |

---

## ⚡ Quick start

> **Prerequisites:** Node.js 20+, Docker (or any PostgreSQL 14+), npm 10+

### 1️⃣ Clone and install

```bash
git clone <your-repo-url> post-sync && cd post-sync
npm install
```

### 2️⃣ Start PostgreSQL

Copy-paste this to get a throwaway database running in seconds:

```bash
docker run -d --name syncpost-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=syncpost \
  -p 5432:5432 \
  postgres:16-alpine
```

<details>
<summary>🐘 Already have Postgres? Create the database instead</summary>

```bash
createdb syncpost
```

Then point `DATABASE_URL` at it in step 3.
</details>

### 3️⃣ Generate secrets and write `.env`

The API **refuses to boot** with weak or missing secrets, so generate real ones:

```bash
cp .env.example .env
cp apps/user/.env.example apps/user/.env
cp apps/admin/.env.example apps/admin/.env

# Generate two distinct 48-byte secrets and write them into .env
node -e '
const { randomBytes } = require("crypto");
const fs = require("fs");
let env = fs.readFileSync(".env", "utf8");
const set = (k, v) => {
  env = env.match(new RegExp(`^${k}=.*$`, "m"))
    ? env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}="${v}"`)
    : env + `\n${k}="${v}"\n`;
};
set("JWT_SECRET", randomBytes(48).toString("base64"));
set("TOKEN_ENCRYPTION_KEY", randomBytes(48).toString("base64"));
set("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/syncpost?schema=public");
set("DIRECT_URL", "postgresql://postgres:postgres@localhost:5432/syncpost?schema=public");
set("ADMIN_EMAIL", "admin@yourcompany.com");
set("ADMIN_PASSWORD", "ChangeThisPassword123!");
fs.writeFileSync(".env", env);
console.log("✅ .env populated with fresh secrets");
'
```

> [!IMPORTANT]
> `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` must be **at least 32 characters and different from each other**. `TOKEN_ENCRYPTION_KEY` encrypts stored OAuth tokens — changing it later makes every stored token undecryptable and forces all users to reconnect.

### 4️⃣ Migrate and seed

```bash
npm run db:migrate      # create tables
npm run db:seed         # create the first ADMIN from ADMIN_EMAIL / ADMIN_PASSWORD
```

### 5️⃣ Run everything

```bash
npm run dev
```

| Service | URL | Notes |
|---|---|---|
| 🔌 **API** | http://localhost:3000/api | NestJS |
| 👤 **User panel** | http://localhost:4220 | compose, schedule, analytics |
| 🛡️ **Admin panel** | http://localhost:4230 | users, plans, billing |
| ❤️ **Health** | http://localhost:3000/api/health | pings the DB too |

### ✅ Verify it works

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok"}
```

<details>
<summary>🧹 Tear the database down when you're done</summary>

```bash
docker rm -f syncpost-db
```
</details>

---

## 🏗️ Architecture

An Nx monorepo: one NestJS API, two React SPAs, three shared libraries.

```mermaid
graph TB
    subgraph clients["🖥️ Clients"]
        USER["👤 User panel<br/>React 19 + Vite<br/>:4220"]
        ADMIN["🛡️ Admin panel<br/>React 19 + Vite<br/>:4230"]
    end

    subgraph libs["📦 Shared libraries"]
        CORE["@syncpost/platform-core<br/>platform registry<br/>zero deps, browser-safe"]
        CLIENT["@syncpost/api-client<br/>typed fetch client"]
        UI["@syncpost/ui<br/>shadcn-style components"]
    end

    subgraph api["⚙️ API — NestJS :3000"]
        GUARDS["🔐 Guards<br/>JWT · Roles · Subscription"]
        MODULES["📋 Modules<br/>auth · posts · social<br/>admin · billing · uploads"]
        REGISTRY["🎯 PublisherRegistry<br/>strategy dispatch"]
        VAULT["🔒 TokenVault<br/>AES-256-GCM + refresh"]
        WORKER["⏱️ Scheduler<br/>@Cron every minute"]
    end

    subgraph external["☁️ External"]
        DB[("🐘 PostgreSQL<br/>Prisma")]
        SOCIAL["🌐 LinkedIn · Facebook · X"]
        STRIPE["💳 Stripe"]
        CDN["🖼️ Cloudinary"]
    end

    USER & ADMIN --> CLIENT --> GUARDS --> MODULES
    USER & ADMIN --> UI
    USER & ADMIN -.imports.-> CORE
    MODULES --> REGISTRY --> VAULT
    MODULES --> DB
    WORKER --> REGISTRY
    REGISTRY -.descriptors.-> CORE
    VAULT --> SOCIAL
    MODULES --> STRIPE
    MODULES --> CDN

    classDef client fill:#61DAFB,stroke:#0a7ea4,color:#000
    classDef lib fill:#f59e0b,stroke:#b45309,color:#000
    classDef svc fill:#E0234E,stroke:#8a0d2b,color:#fff
    classDef ext fill:#334155,stroke:#0f172a,color:#fff
    class USER,ADMIN client
    class CORE,CLIENT,UI lib
    class GUARDS,MODULES,REGISTRY,VAULT,WORKER svc
    class DB,SOCIAL,STRIPE,CDN ext
```

### Request lifecycle

```mermaid
flowchart LR
    REQ["📥 Request"] --> CORS["🌐 CORS<br/>allowlist"]
    CORS --> JWT["🔑 JwtAuthGuard"]
    JWT --> ROLE["👮 RolesGuard"]
    ROLE --> SUB["💳 SubscriptionGuard"]
    SUB --> PIPE["✅ ValidationPipe<br/>whitelist +<br/>forbidNonWhitelisted"]
    PIPE --> CTRL["🎮 Controller"]
    CTRL --> SVC["⚙️ Service"]
    SVC --> PRISMA["🐘 Prisma"]
    PRISMA --> RES["📤 Response"]

    JWT -.401.-> ERR["❌"]
    ROLE -.403.-> ERR
    SUB -.403.-> ERR
    PIPE -.400.-> ERR

    style REQ fill:#22c55e,color:#000
    style RES fill:#22c55e,color:#000
    style ERR fill:#ef4444,color:#fff
```

---

## 🧩 Tech stack

<table>
<tr><th align="left">Layer</th><th align="left">Technology</th><th align="left">Why</th></tr>

<tr><td rowspan="4"><b>⚙️ Backend</b></td>
<td><img src="https://img.shields.io/badge/NestJS_11-E0234E?style=flat-square&logo=nestjs&logoColor=white"></td>
<td>DI container is what makes the publisher strategy pluggable</td></tr>
<tr><td><img src="https://img.shields.io/badge/Prisma_5-2D3748?style=flat-square&logo=prisma&logoColor=white"></td>
<td>Type-safe queries; the schema is the source of truth</td></tr>
<tr><td><img src="https://img.shields.io/badge/PostgreSQL_16-4169E1?style=flat-square&logo=postgresql&logoColor=white"></td>
<td>Relational integrity + row locking for the scheduler</td></tr>
<tr><td><img src="https://img.shields.io/badge/Passport_JWT-34E27A?style=flat-square&logo=passport&logoColor=black"></td>
<td>Role re-read from DB per request, not trusted from the token</td></tr>

<tr><td rowspan="4"><b>🖥️ Frontend</b></td>
<td><img src="https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black"></td>
<td>Two SPAs sharing one component library</td></tr>
<tr><td><img src="https://img.shields.io/badge/Vite_8-646CFF?style=flat-square&logo=vite&logoColor=white"></td>
<td>Sub-second HMR</td></tr>
<tr><td><img src="https://img.shields.io/badge/Tailwind_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white"></td>
<td>Design tokens shared by both panels</td></tr>
<tr><td><img src="https://img.shields.io/badge/TipTap_3-000000?style=flat-square&logo=tiptap&logoColor=white"></td>
<td>Rich composer, flattened to plain text per platform</td></tr>

<tr><td rowspan="3"><b>🔧 Tooling</b></td>
<td><img src="https://img.shields.io/badge/Nx_23-143055?style=flat-square&logo=nx&logoColor=white"></td>
<td>Task caching + enforced module boundaries</td></tr>
<tr><td><img src="https://img.shields.io/badge/TypeScript_strict-3178C6?style=flat-square&logo=typescript&logoColor=white"></td>
<td>`strict` + `noUncheckedIndexedAccess`, zero `any`</td></tr>
<tr><td><img src="https://img.shields.io/badge/Jest_30-C21325?style=flat-square&logo=jest&logoColor=white"></td>
<td>64 tests incl. a full DI-graph compile check</td></tr>

<tr><td rowspan="3"><b>☁️ Services</b></td>
<td><img src="https://img.shields.io/badge/Stripe-635BFF?style=flat-square&logo=stripe&logoColor=white"></td>
<td>Subscriptions, with verified webhook signatures</td></tr>
<tr><td><img src="https://img.shields.io/badge/Cloudinary-3448C5?style=flat-square&logo=cloudinary&logoColor=white"></td>
<td>Image hosting for post media</td></tr>
<tr><td><img src="https://img.shields.io/badge/Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white"></td>
<td>Deploy target; healthcheck at `/api/health`</td></tr>
</table>

### 🌐 Supported platforms

| Platform | Connect | Publish | Native schedule | Edit | Images | Char limit |
|---|:---:|:---:|:---:|:---:|:---:|---:|
| ![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white) | OAuth 2.0 | ✅ | ❌ | ❌ | 1 | 3,000 |
| ![Facebook](https://img.shields.io/badge/Facebook-1877F2?style=flat-square&logo=facebook&logoColor=white) | OAuth 2.0 | ✅ | ✅ Pages only | ✅ | 1 | 63,206 |
| ![X](https://img.shields.io/badge/X-000000?style=flat-square&logo=x&logoColor=white) | OAuth 2.0 + PKCE | ✅ | ❌ | ❌ | — | 280 |

> [!NOTE]
> Every one of these values lives in **one place** — `libs/platform-core/src/lib/platforms.ts`. Both React apps and the API read from it, and a compile-time assertion binds it to the Prisma enum.

---

## 🔑 Environment variables

### Required — the API will not start without these

| Variable | Rule | Purpose |
|---|---|---|
| `DATABASE_URL` | non-empty | Postgres connection |
| `JWT_SECRET` | ≥ 32 chars, not a placeholder | Signs auth tokens |
| `TOKEN_ENCRYPTION_KEY` | ≥ 32 chars, **≠ `JWT_SECRET`** | AES-256-GCM key for stored OAuth tokens |

**Optional:** `WORKER_ENABLED=false` turns off scheduled publishing on a pod, so API and worker instances can be scaled separately. Defaults to enabled.

```mermaid
flowchart LR
    BOOT["🚀 Boot"] --> VAL{"validateEnv"}
    VAL -->|"missing / short /<br/>placeholder / reused"| FAIL["❌ Exit 1<br/>lists every problem at once"]
    VAL -->|valid| DI{"DI container"}
    DI -->|unresolved provider| FAIL
    DI -->|ok| REG{"PublisherRegistry"}
    REG -->|"platform without<br/>a publisher"| FAIL
    REG -->|ok| UP["✅ Listening"]

    style FAIL fill:#ef4444,color:#fff
    style UP fill:#22c55e,color:#000
```

### Optional — per integration

<details>
<summary><b>🔗 Social platform credentials</b></summary>

| Variable | Notes |
|---|---|
| `LINKEDIN_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | Needs "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" products |
| `LINKEDIN_ENABLE_ORGANIZATIONS` | `true` requires Marketing Developer Platform approval — enabling it early breaks the whole login grant |
| `FACEBOOK_APP_ID` / `_SECRET` / `_REDIRECT_URI` | Business-type app, `pages_show_list` + `pages_manage_posts` + `pages_read_engagement` |
| `FACEBOOK_ENABLE_GROUPS` | `true` requires Advanced Access for `publish_to_groups` — same warning |
| `X_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | OAuth 2.0 with PKCE |
| `*_AUTH_REDIRECT_URI` | Separate callback for *sign in with*, distinct from *connect account* |

</details>

<details>
<summary><b>💳 Stripe, 🖼️ Cloudinary, 🔍 Google sign-in</b></summary>

| Variable | Notes |
|---|---|
| `STRIPE_SECRET_KEY` | Use `sk_test_…` while developing |
| `STRIPE_WEBHOOK_SECRET` | From `stripe listen --forward-to localhost:3000/api/stripe/webhook` |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Image uploads |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `GOOGLE_AUTH_REDIRECT_URI` | "Sign in with Google" |

</details>

---

## 🔄 Core flows

### 1. Connecting a social account

One OAuth grant can yield several destinations — a personal profile *and* every Page you manage — each stored as its own row.

```mermaid
sequenceDiagram
    autonumber
    actor U as 👤 User
    participant W as 🖥️ User panel
    participant A as ⚙️ API
    participant R as 🎯 Registry
    participant P as 🌐 Provider
    participant V as 🔒 TokenVault
    participant DB as 🐘 Postgres

    U->>W: Click "Connect LinkedIn"
    W->>A: GET /api/social/LINKEDIN/connect
    A->>R: for('LINKEDIN')
    R-->>A: LinkedInService
    Note over A: PKCE only if descriptor<br/>says oauth2-pkce (X)
    A->>DB: store CSRF state (+ verifier)
    A-->>W: { url }
    W->>P: redirect to authorize
    U->>P: Approve
    P->>A: GET /api/social/LINKEDIN/callback?code&state
    A->>DB: consume + verify state
    A->>P: exchange code → tokens
    A->>P: fetch profile + admin'd Pages
    P-->>A: 1 profile + N Pages
    A->>V: encryptForStorage(tokens)
    V-->>A: AES-256-GCM ciphertext
    A->>DB: upsert one SocialAccount per destination
    A-->>W: redirect ?connected=1
```

### 2. Publishing — fan-out across destinations

```mermaid
sequenceDiagram
    autonumber
    actor U as 👤 User
    participant A as ⚙️ API
    participant V as 🔒 TokenVault
    participant R as 🎯 Registry
    participant P as 🌐 Providers
    participant DB as 🐘 Postgres

    U->>A: POST /api/posts { content, destinationIds[] }
    A->>A: enforce plan limits
    A->>DB: Post status = PUBLISHING

    par For each destination, concurrently
        A->>V: getValidAccessToken(account)
        alt token expiring
            V->>P: refresh grant
            V->>DB: store new (encrypted) tokens
        end
        V-->>A: plaintext token (in memory only)
        A->>R: for(platform)
        R-->>A: publisher
        A->>P: publish()
        P-->>A: platformPostId ✅ / typed error ❌
        A->>DB: upsert PostPublishResult
    end

    A->>DB: finalize → PUBLISHED · PARTIAL · FAILED
    A-->>U: per-destination results
```

> [!TIP]
> Results are tracked **per destination**, so one dead LinkedIn token doesn't hide a successful tweet. The post resolves to `PARTIAL` and tells you exactly which target failed and why.

### 3. Scheduling

Facebook Pages are handed to Meta to publish; everything else is held and published by SyncPost's own scheduler.

```mermaid
flowchart TD
    S["🗓️ Schedule post"] --> Q{"descriptor<br/>nativeScheduling<br/>includes this<br/>destination type?"}
    Q -->|"✅ Facebook Page"| META["Hand to Meta<br/>published=false +<br/>scheduled_publish_time"]
    Q -->|"❌ everything else"| OWN["status = SCHEDULED"]

    META --> PEND["Result = PENDING"]
    OWN --> TICK["⏱️ Worker tick — every minute"]

    subgraph worker["PublishingWorker"]
        direction TB
        TICK --> REAP["1️⃣ Reap stale PUBLISHING<br/>> 15 min → back to SCHEDULED"]
        REAP --> CLAIM["2️⃣ Claim due posts<br/>FOR UPDATE SKIP LOCKED"]
        CLAIM --> RETRY["3️⃣ Retry destinations<br/>whose backoff elapsed"]
    end

    CLAIM --> PUB["Publish via registry<br/>skips already-SUCCESS<br/>destinations"]
    RETRY --> PUB
    PUB --> OUT{"outcome"}
    OUT -->|"✅"| OK["SUCCESS"]
    OUT -->|"429 / 5xx / timeout"| BACK["RETRYING<br/>exponential backoff,<br/>honours Retry-After"]
    OUT -->|"401 / 4xx / cap hit"| DEAD["FAILED — terminal"]
    BACK -.->|next tick| RETRY

    OK & DEAD & PEND --> FIN["Recompute post status<br/>PUBLISHED · PARTIAL · FAILED"]

    style REAP fill:#f59e0b,color:#000
    style OK fill:#22c55e,color:#000
    style DEAD fill:#ef4444,color:#fff
    style BACK fill:#3b82f6,color:#fff
```

> [!TIP]
> **Crash recovery.** If a process dies mid-publish, the post is left in `PUBLISHING`. The reaper returns anything stuck there for over 15 minutes to the queue, and re-publishing skips destinations that already succeeded — so recovery completes the remaining targets instead of double-posting.

### 4. Token lifecycle

The fix for tokens that used to silently die:

```mermaid
stateDiagram-v2
    [*] --> Active: OAuth connect
    Active --> Refreshing: within 5 min of expiry
    Refreshing --> Active: ✅ provider issues new tokens
    Refreshing --> NeedsReconnect: ❌ refresh rejected
    Active --> NeedsReconnect: platform cannot refresh<br/>(e.g. LinkedIn)
    NeedsReconnect --> Active: user reconnects
    Active --> [*]: disconnect

    note right of Refreshing
        Concurrent publishes share
        ONE refresh. X rotates its
        refresh token, so parallel
        refreshes would invalidate
        each other.
    end note
```

### 5. Billing

```mermaid
sequenceDiagram
    autonumber
    actor U as 👤 User
    participant A as ⚙️ API
    participant S as 💳 Stripe

    U->>A: POST /api/stripe/checkout-session { planId }
    A->>A: validate plan is active + paid
    A->>S: create Checkout session
    A-->>U: redirect to Stripe
    U->>S: pay
    S->>A: POST /api/stripe/webhook
    A->>A: verify signature against RAW body
    alt signature invalid
        A-->>S: 400 ❌
    else valid
        A->>A: activate subscription
        A-->>S: 200 ✅
    end
```

---

## ➕ Adding a social platform

The registry is designed so the compiler walks you through it. Miss a step and the **build or the boot fails** — never a runtime surprise for a user.

```mermaid
flowchart TD
    A["1️⃣ Add id to PlatformId<br/><code>libs/platform-core/…/types.ts</code>"] --> B{"🔴 Build fails:<br/>PLATFORMS missing key"}
    B --> C["2️⃣ Add descriptor to PLATFORMS<br/>label · colour · limit · capabilities<br/>connection · permalink"]
    C --> D{"🔴 Build fails:<br/>Prisma enum mismatch"}
    D --> E["3️⃣ Add to SocialPlatform enum<br/>+ <code>npm run db:migrate</code>"]
    E --> F{"🔴 Boot fails:<br/>no publisher registered"}
    F --> G["4️⃣ Write the publisher<br/>extends BasePublisher"]
    G --> H["5️⃣ Register in social.module.ts"]
    H --> I["✅ Both UIs pick it up<br/>automatically"]

    style B fill:#ef4444,color:#fff
    style D fill:#ef4444,color:#fff
    style F fill:#ef4444,color:#fff
    style I fill:#22c55e,color:#000
```

**What you inherit from `BasePublisher`:** request timeouts, typed error mapping (`TokenExpired` / `RateLimited` with `Retry-After` / `Transient` / `Permanent`), token-expiry maths, and auth-URL building.

**What you must supply:** the descriptor, and `errorDetail()` — the path through *your* provider's error body, which is the only thing that genuinely differs.

<details>
<summary>📄 Minimal publisher skeleton</summary>

```ts
@Injectable()
export class BlueskyService extends BasePublisher implements PlatformPublisher {
  readonly descriptor = PLATFORMS.BLUESKY;

  constructor(http: HttpClient) {
    super(http);
  }

  /** Each provider nests its reason differently. This is the only required override. */
  protected errorDetail(body: unknown): string | undefined {
    return (body as { message?: string } | undefined)?.message;
  }

  getAuthUrl(state: string): string { /* … */ }
  async handleCallback(code: string): Promise<ConnectedDestination[]> { /* … */ }
  async publish(account: SocialAccount, content: string): Promise<PublishResult> { /* … */ }
  async deletePost(account: SocialAccount, id: string): Promise<void> { /* … */ }
  async editPost(): Promise<void> { /* … */ }
  async getMetrics(account: SocialAccount, id: string): Promise<PostMetrics> { /* … */ }
}
```

Optionally implement `RefreshableTokenSource` if the provider can refresh tokens without user interaction.
</details>

> [!NOTE]
> `connection` is a descriptor field precisely because **not every platform uses OAuth 2.0 authorization-code**. Bluesky uses app passwords, Mastodon needs per-instance registration, Discord uses webhooks. Assuming OAuth for all of them would be wrong.

---

## 📁 Project layout

```
post-sync/
├── apps/
│   ├── api/                        ⚙️  NestJS
│   │   └── src/
│   │       ├── auth/               🔐 JWT, OAuth sign-in, identity providers
│   │       ├── social/             🌐 the platform layer
│   │       │   ├── publishers/     🎯 BasePublisher · registry · errors · HTTP · PKCE
│   │       │   ├── tokens/         🔒 TokenVault · AES-256-GCM crypto
│   │       │   └── *.service.ts    📡 one publisher per platform
│   │       ├── posts/              📝 CRUD, fan-out publish, @Cron scheduler
│   │       ├── admin/              🛡️ users, plans, analytics
│   │       ├── stripe/             💳 checkout + verified webhooks
│   │       ├── common/             🧰 guards · pipes · decorators · selects
│   │       └── config/             ✅ boot-time env validation
│   ├── user/                       👤 React SPA
│   └── admin/                      🛡️ React SPA
├── libs/
│   ├── platform-core/              🧩 THE platform registry (framework-free)
│   ├── api-client/                 🔌 typed fetch client + shared types
│   └── ui/                         🎨 shadcn-style components
├── prisma/                         🐘 schema · migrations · seed
└── .github/workflows/ci.yml        🔁 nx affected: lint · typecheck · test · build
```

**Module boundaries are enforced by ESLint**, not convention:

```mermaid
flowchart LR
    API["scope:api"] --> SHARED["scope:shared"]
    WEB["scope:web"] --> SHARED
    API -.->|"🚫 blocked"| WEB
    SHARED -.->|"🚫 blocked"| API

    style SHARED fill:#f59e0b,color:#000
    style API fill:#E0234E,color:#fff
    style WEB fill:#61DAFB,color:#000
```

---

## 🛠️ Command reference

### 🏃 Development

```bash
npm run dev              # all three apps, colour-coded
npm run dev:api          # API only        → :3000
npm run dev:user         # user panel      → :4220
npm run dev:admin        # admin panel     → :4230
```

### 🐘 Database

```bash
npm run db:migrate       # create + apply a migration (dev)
npm run db:migrate:deploy# apply pending migrations (prod)
npm run db:generate      # regenerate the Prisma client
npm run db:seed          # create the first ADMIN account
npm run db:studio        # browse data in a GUI
```

### ✅ Quality gates

```bash
npx nx run-many -t lint typecheck test build     # everything
npx nx affected -t lint typecheck test build     # only what changed (CI does this)
npx nx run api:test                              # one project
npx nx run-many -t test --skip-nx-cache          # ignore the cache
```

### 📦 Build

```bash
npm run build:api && npm run build:user && npm run build:admin
```

### 🔍 Handy one-liners

```bash
# Every route the API exposes
grep -rn "@Get(\|@Post(\|@Patch(\|@Delete(" apps/api/src | sed 's|apps/api/src/||'

# Prove tokens are encrypted at rest (should print ciphertext, not a token)
docker exec syncpost-db psql -U postgres -d syncpost \
  -c 'SELECT left("accessToken", 40) FROM social_accounts LIMIT 1;'

# Watch the scheduler pick up due posts
npm run dev:api 2>&1 | grep -iE "publish|schedul"
```

---

## 🌐 API reference

All routes are prefixed `/api`. 🔒 = JWT required · 🛡️ = ADMIN only

<details open>
<summary><b>🔐 Auth</b></summary>

| Method | Route | | Description |
|---|---|:--:|---|
| `POST` | `/auth/signup` | | Create account, returns JWT |
| `POST` | `/auth/login` | | Exchange credentials for a JWT |
| `GET` | `/auth/me` | 🔒 | Current user |
| `GET` | `/auth/oauth/:platform` | | Start social sign-in |
| `GET` | `/auth/oauth/:platform/callback` | | OAuth return |
</details>

<details>
<summary><b>📝 Posts</b></summary>

| Method | Route | | Description |
|---|---|:--:|---|
| `GET` | `/posts` | 🔒 | List your posts |
| `GET` | `/posts/analytics` | 🔒 | Engagement, `?from=` / `?to=` ISO 8601 |
| `GET` | `/posts/:id` | 🔒 | One post with live metrics |
| `POST` | `/posts` | 🔒 | Create, publish, or schedule |
| `PATCH` | `/posts/:id` | 🔒 | Edit (where the platform allows) |
| `POST` | `/posts/:id/publish` | 🔒 | Publish a draft |
| `DELETE` | `/posts/:id` | 🔒 | Delete locally and remotely |
</details>

<details>
<summary><b>🌐 Social</b></summary>

| Method | Route | | Description |
|---|---|:--:|---|
| `GET` | `/social/accounts` | 🔒 | Connected destinations |
| `GET` | `/social/:platform/connect` | 🔒 | Get the authorize URL |
| `GET` | `/social/:platform/callback` | | OAuth return |
| `DELETE` | `/social/accounts/:id` | 🔒 | Disconnect |
</details>

<details>
<summary><b>🛡️ Admin · 💳 Billing · 🖼️ Uploads</b></summary>

| Method | Route | | Description |
|---|---|:--:|---|
| `GET` | `/admin/users` | 🛡️ | List users |
| `POST` | `/admin/users` | 🛡️ | Create a user |
| `PATCH` | `/admin/users/:id/subscription` | 🛡️ | Grant or change a plan |
| `PATCH` | `/admin/users/:id/deactivate` | 🛡️ | Deactivate |
| `PATCH` | `/admin/users/:id/reactivate` | 🛡️ | Reactivate |
| `GET`·`POST`·`PATCH`·`DELETE` | `/admin/plans` | 🛡️ | Plan CRUD |
| `GET` | `/admin/analytics/posts` | 🛡️ | Cross-user analytics |
| `GET` | `/admin/billing` | 🛡️ | Revenue overview |
| `GET` | `/plans` | | Public plan list |
| `GET` | `/subscriptions/me` | 🔒 | Your subscription |
| `POST` | `/stripe/checkout-session` | 🔒 | Start checkout |
| `PATCH` | `/stripe/change-plan` | 🔒 | Switch to a free plan |
| `POST` | `/stripe/webhook` | | Signature-verified |
| `POST` | `/uploads` | 🔒 | Image upload, 8 MB cap |
| `GET` | `/health` | | Liveness + DB ping |
</details>

---

## 🧪 Testing

```bash
npx nx run-many -t test          # 64 tests
npx nx run api:test              # API only
npx nx run platform-core:test    # registry + content adaptation
```

| Suite | Covers |
|---|---|
| 🧩 `platform-core` | Registry invariants, unique colour tokens, native-scheduling rules, permalinks, truncation with hashtag preservation |
| 🎯 `publisher.registry` | Refuses to boot on a missing or duplicate publisher |
| 🌐 `base-publisher` | Every branch of error translation — 401, 403, 429 + `Retry-After`, 5xx, timeout, 4xx, non-axios throws |
| 🔒 `token-crypto` | Round-trip, tamper detection, wrong-key rejection, no plaintext in output |
| 🔑 `token-vault` | Refresh-on-expiry, rotated refresh tokens, **concurrent refresh collapses to one**, `NEEDS_RECONNECT` on failure |
| ✅ `env.validation` | Every boot rule, including reporting all problems at once |
| 👮 `roles.guard` | Allow, deny, and the unauthenticated edge case |
| ♻️ `retry-policy` | Which failures retry, exponential backoff, `Retry-After`, attempt cap |
| 🧯 `publishing.worker` *(integration)* | Crash recovery, and that concurrent workers never claim one post twice — needs a real database |
| 🧱 `app.module` | **Compiles the entire DI graph** |
| 🆔 `parse-entity-id.pipe` | Accepts seeded well-known IDs, rejects malformed ones |

> [!IMPORTANT]
> `app.module.spec.ts` exists because three separate defects passed lint, typecheck *and* every unit test while the application could not start — all of them DI container-resolution failures. It needs no database and catches that entire class.

---

## 🔒 Security model

| Control | Implementation |
|---|---|
| 🔑 **Passwords** | bcrypt, cost 12. Login errors never reveal whether an email exists |
| 🔐 **OAuth tokens** | AES-256-GCM at rest, random IV per encryption, `keyVersion` for rotation |
| 🚫 **Password hashes** | Explicit Prisma `select` allowlists — hashes never leave the database |
| ✅ **Input validation** | Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`; UUID pipes on ID params |
| 🛑 **Boot safety** | Refuses to start on weak, missing, placeholder, or reused secrets |
| 💳 **Stripe webhooks** | Signature verified against the raw body before anything is trusted |
| 👮 **Authorisation** | Role re-read from the DB per request, so demotions take effect immediately |
| 🌐 **CORS** | Explicit origin allowlist |

<details>
<summary><b>⚠️ Known gaps — being honest about what isn't done</b></summary>

These are tracked, not hidden:

- **No rate limiting** — `@nestjs/throttler` not yet added; login and signup are unthrottled
- **No global exception filter** — Prisma errors can surface as 500s with internal detail
- **Auth is opt-in per controller** — a new controller is public until `@UseGuards` is added
- **JWTs in OAuth redirect URLs** — land in browser history and proxy logs
- **No refresh-token rotation** for app sessions — one 7-day access token, no revocation
- **`localStorage` token storage** on the frontend, with no CSP
- **In-process refresh mutex** — correct for a single worker; multi-instance needs a row lock

</details>

---

## 🚀 Deployment

Configured for **Railway** via `railway.json`, but any Node host works.

```mermaid
flowchart LR
    PUSH["📤 git push"] --> CI["🔁 GitHub Actions<br/>nx affected"]
    CI -->|fails| STOP["🛑 blocked"]
    CI -->|passes| BUILD["📦 npm install<br/>nx build api"]
    BUILD --> MIG["🐘 prisma migrate deploy"]
    MIG --> BOOT["🚀 node dist/apps/api/main.js"]
    BOOT --> VAL{"validateEnv<br/>+ DI + registry"}
    VAL -->|fails| STOP
    VAL -->|passes| HC["❤️ /api/health"]
    HC --> LIVE["✅ Live"]

    style STOP fill:#ef4444,color:#fff
    style LIVE fill:#22c55e,color:#000
```

```bash
npm run start:prod    # migrate, then boot
```

**Checklist before first deploy:**

- [ ] `DATABASE_URL` + `DIRECT_URL` set (`DIRECT_URL` bypasses a pooler for migrations)
- [ ] `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` generated, ≥ 32 chars, different from each other
- [ ] `USER_APP_URL` / `ADMIN_APP_URL` set — they drive CORS *and* OAuth redirects
- [ ] Provider redirect URIs registered with each platform
- [ ] `STRIPE_WEBHOOK_SECRET` from the deployed endpoint, not the CLI
- [ ] Healthcheck pointed at `/api/health`

> [!CAUTION]
> Back up `TOKEN_ENCRYPTION_KEY` somewhere durable. Lose it and every stored OAuth token becomes undecryptable — every user has to reconnect every account.

---

## 📄 License

MIT

<div align="center">

**Built with** ![NestJS](https://img.shields.io/badge/-NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white) ![React](https://img.shields.io/badge/-React-61DAFB?style=flat-square&logo=react&logoColor=black) ![Prisma](https://img.shields.io/badge/-Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white) ![Nx](https://img.shields.io/badge/-Nx-143055?style=flat-square&logo=nx&logoColor=white)

</div>
