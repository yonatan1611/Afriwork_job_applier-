# 🚀 Afriwork Job Applier

### Intelligent Job Monitoring & Auto-Application Engine

Afriwork Applier is a production-ready automation service that continuously monitors Afriwork jobs via GraphQL, scores them using a weighted preference engine, notifies via Telegram, and optionally auto-applies using AI-generated cover letters.

Designed for reliability, extensibility, and deployment.

---

# ✨ Core Capabilities

### 🔎 Smart Job Polling

- Configurable polling interval
- Cursor/page-based fetching
- Filters only `published` jobs
- Handles API authentication & token refresh

### 🧠 Intelligent Scoring Engine

Weighted scoring across:

- Roles
- Skills
- Locations
- Experience level
- Compensation type
- Recency

Jobs exceeding `SCORE_THRESHOLD` are marked as `matched`.

### 🗂 Deduplication & Persistence

- MongoDB-backed storage
- Unique index on `jobs_applied.job_id`
- Tracks job state:
  - `matched`
  - `ignored`
  - `applied`

### 🤖 Telegram Integration

- Instant job alerts
- Inline buttons:
  - ✅ Apply
  - ❌ Ignore
- Preference management commands
- Experience memory management
- Threshold control

### ✍ AI Cover Letter Generation (Optional)

- Powered by Groq LLM
- Injects saved experience
- Context-aware job customization

### 🔐 Afriwork Authentication Handling

- Supports static bearer token
- Or automatic login via credentials
- Caches and refreshes token automatically

---

# 🏗 Architecture Overview

```
Afriwork GraphQL API
        │
        ▼
 GraphQL Client (Hasura headers)
        │
        ▼
 Job Polling Service
        │
        ▼
  Scoring Engine
        │
        ▼
 MongoDB (jobs_applied)
        │
        ▼
 Telegram Bot Service
        │
        ├── Apply → AI Cover Letter → Afriwork API
        └── Ignore → Update status
```

---

# 🧩 Tech Stack

| Layer            | Technology              |
| ---------------- | ----------------------- |
| Runtime          | Node.js (v20+)          |
| Database         | MongoDB                 |
| API              | GraphQL (Hasura)        |
| Messaging        | Telegram Bot API        |
| AI               | Groq                    |
| HTTP             | cross-fetch             |
| Containerization | Docker / Docker Compose |

---

# ⚙️ Configuration

Create a `.env` file:

```env
#################################
# GraphQL
#################################
GRAPHQL_ENDPOINT=https://api.afriworket.com/v1/graphql
HASURA_ANON_ROLE=anonymous
POLL_INTERVAL_MS=60000
PAGE_SIZE=5
SCORE_THRESHOLD=8

#################################
# Database
#################################
MONGODB_URI=mongodb://localhost:27017/afriwork
DB_NAME=afriwork

#################################
# Telegram
#################################
TELEGRAM_BOT_TOKEN=xxxx
TELEGRAM_CHAT_ID=123456

#################################
# AI (Optional)
#################################
GROQ_API_KEY=sk_xxx

#################################
# Afriwork Auth
#################################
AFRIWORK_LOGIN_EMAIL=you@example.com
AFRIWORK_LOGIN_PASSWORD=your-password
AFRIWORK_ORIGIN_PLATFORM_ID=<uuid-from-afriwork>
AFRIWORK_BEARER_TOKEN=
```

---

# ▶ Running Locally

```bash
npm install
npm run start
```

Expected log:

```
[Polling] Started. Interval: 60000ms
```

---

# 🧪 Running Tests

```
npm test
```

---

# 🐳 Docker Deployment (Recommended)

### 1️⃣ Prepare Environment

```
cp .env.example .env
# edit values
```

### 2️⃣ Build & Start

```
docker compose up -d --build
```

Services:

- `mongo`
- `app`

Internal Mongo connection:

```
mongodb://mongo:27017/afriwork
```

### 3️⃣ View Logs

```
docker compose logs -f app
```

### 4️⃣ Stop

```
docker compose down
```

---

# 🤖 Telegram Commands

## Preferences

View current:

```
/pref
```

Set preference:

```
/pref set roles planning_engineer 5
```

Remove:

```
/pref del roles planning_engineer
```

Valid categories:

- roles
- skills
- locations
- experience

---

## Threshold

View:

```
/threshold
```

Update:

```
/threshold set 10
```

---

## Experience Memory

View:

```
/exp
```

Set:

```
/exp set 5+ years as Planning Engineer using Primavera P6.
```

Clear:

```
/exp clear
```

---

# 🧠 Scoring Model

Each job receives a computed score:

```
Total Score =
(role_weight × match)
+ (skill_weight × match)
+ (location_weight × match)
+ (experience_weight × match)
+ recency_bonus
```

If:

```
score >= SCORE_THRESHOLD
```

→ Job marked as `matched`  
→ Telegram notification triggered

---

# 📂 Project Structure

```
src/
├── config/            # environment & constants
├── integrations/      # external clients
│   ├── graphql/
│   ├── telegram/
│   └── mongo/
├── repositories/      # data access layer
├── core/              # scoring domain logic
├── services/          # polling & orchestration
├── auth/              # Afriwork login handling
└── index.js           # entrypoint

test/
```

---

# 📌 Design Principles

- Idempotent processing
- Explicit job state transitions
- Single-responsibility modules
- Stateless services (except DB)
- Container-first deployment

---

# 📄 License

MIT License

---

# 👤 Author

Built for automated intelligent job targeting on Afriwork.

---
