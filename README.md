# SalesSearchers

The ultimate AI-powered sales SaaS platform combining meeting intelligence, CRM, outreach automation, AI coaching, and workflow automation.

## Features

### ✅ Phase 1: Meeting Intelligence
- Connect calendars (Google + Microsoft) with OAuth
- Auto-detect and record meetings via Recall.ai
- Transcription and AI-generated insights
- Action items, key topics, objections, coaching tips
- Configurable recording policies (always, external only, keyword-based)

### ✅ Phase 2: Email Sequences & Unified Inbox
- Gmail integration with OAuth
- Unified inbox for all email accounts
- Email sequences with multi-step automation
- Personalization with variables
- Open/click tracking
- Sequence analytics

### ✅ Phase 3: Pipeline & CRM
- Contacts & Companies management
- BetterContact data enrichment (email + phone waterfall)
- Deal pipeline with custom stages
- AI coaching tips from meeting insights
- Contact and company profiles

### ✅ Phase 4: LinkedIn & Data Rooms
- LinkedIn outreach tracking
- LinkedIn action queue
- Digital sales rooms (Trumpet-style)
- Content sharing with view analytics
- Data room action items
- Activity timeline

### ✅ Phase 5: Analytics & Team Collaboration
- Advanced analytics dashboard
- Pipeline forecasting
- Team performance metrics
- Global search (Cmd+K)
- In-app notifications
- Notes with @mentions
- Team management & invitations
- CSV import/export
- User profile & settings

### ✅ Phase 6: AI Content Generation & Workflow Automation
- AI Writing Assistant
  - Follow-up email generation
  - Cold email generation
  - LinkedIn message generation (connection, InMail, reply)
  - Call script generation with discovery questions & objection handlers
  - Objection response generation
  - Text improvement (shorter, longer, formal, casual, persuasive)
  - Content history & ratings
- Workflow Automations
  - Trigger-based automation (deal stage changed, contact created, meeting completed, etc.)
  - Action library (create task, update deal stage, enroll in sequence, send webhook, etc.)
  - Manual trigger support
  - Run history & debugging
  - Action execution results

### ✅ Phase 7: Templates, Lead Scoring & Custom Fields
- Templates Library
  - Email templates with variables
  - LinkedIn message templates
  - Call script templates
  - Template categories
  - Variable substitution with contact/company data
  - Template rendering with entity context
  - Duplicate templates
  - Template usage tracking
- Lead Scoring
  - Configurable scoring rules
  - Event-based score changes (email opened, meeting attended, etc.)
  - Engagement, behavior, and fit scores
  - Grade calculation (A-F)
  - Score history tracking
  - Manual score adjustments
  - Score distribution analytics
  - Leaderboard view
- Custom Fields
  - Define custom fields for contacts, companies, deals
  - Multiple field types (text, number, date, dropdown, multi-select, etc.)
  - Required and unique field validation
  - Default values
  - Show in list/form visibility controls
  - Field reordering
  - Bulk value updates

## Tech Stack

- **Frontend**: Next.js 15, React 19, TailwindCSS, TanStack Query
- **Backend**: Fastify (Node.js), Prisma ORM
- **Database**: PostgreSQL (multi-tenant)
- **Workflow Engine**: Temporal
- **Storage**: S3-compatible (Hetzner/MinIO)
- **AI**: OpenAI GPT-4o-mini
- **Meeting Bot**: Recall.ai
- **Data Enrichment**: BetterContact

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts:
- PostgreSQL (5432)
- Redis (6379)
- MinIO (9000/9001)
- Temporal (7233)
- Temporal UI (8080)

### 3. Set up environment

```bash
cp env.example .env
```

Edit `.env` with your API keys:
- `RECALL_API_KEY` - Get from [recall.ai](https://recall.ai)
- `OPENAI_API_KEY` - Get from [platform.openai.com](https://platform.openai.com)
- `GOOGLE_CLIENT_ID/SECRET` - Get from Google Cloud Console
- `MICROSOFT_CLIENT_ID/SECRET` - Get from Azure Portal
- `BETTERCONTACT_API_KEY` - Get from [bettercontact.rocks](https://bettercontact.rocks)

### 4. Initialize database

```bash
pnpm db:generate
pnpm db:push
```

### 5. Run the apps

```bash
# Terminal 1: API server
pnpm dev:api

# Terminal 2: Worker (Temporal)
pnpm dev:worker

# Terminal 3: Web app
pnpm dev:web
```

Visit:
- **Web App**: http://localhost:3000
- **API**: http://localhost:3001
- **Temporal UI**: http://localhost:8080
- **MinIO Console**: http://localhost:9001

## Project Structure

```
.
├── apps/
│   ├── api/                 # Fastify API server
│   │   └── src/
│   │       ├── routes/      # API endpoints
│   │       ├── plugins/     # Fastify plugins
│   │       └── lib/         # Business logic
│   ├── web/                 # Next.js frontend
│   │   └── src/
│   │       ├── app/         # App router pages
│   │       ├── components/  # React components
│   │       └── lib/         # Client utilities
│   └── worker/              # Temporal worker
│       └── src/
│           ├── workflows/   # Temporal workflows
│           └── activities/  # Temporal activities
├── packages/
│   ├── db/                  # Prisma schema & client
│   ├── shared/              # Shared types, schemas, utils
│   └── integrations/        # External service clients
└── docker/                  # Docker configs
```

## Key Features

### AI Writing Assistant
Generate professional sales content with context-aware AI:
- **Follow-up Emails**: Based on meeting insights, action items, objections
- **Cold Emails**: Personalized outreach with templates
- **LinkedIn Messages**: Connection requests, InMails, replies
- **Call Scripts**: Opening, discovery questions, pitch, objection handlers, close
- **Objection Responses**: "Feel, felt, found" framework responses
- **Text Improvement**: Make text shorter, longer, formal, casual, or persuasive

### Workflow Automations
Build trigger-action workflows to automate repetitive tasks:
- **Triggers**: Deal stage changed, contact created, meeting completed, email replied, etc.
- **Actions**: Create task, update deal stage, enroll in sequence, send webhook, etc.
- **Manual Triggers**: Test and run automations on demand
- **Run History**: Debug with detailed action execution logs

### Meeting Recording Flow

1. User connects calendar → OAuth tokens stored
2. Calendar sync workflow fetches events
3. Recording policy evaluates each event
4. Eligible meetings are scheduled
5. Bot joins meeting at scheduled time (Recall.ai)
6. Recording + transcript processed
7. AI generates insights (OpenAI)
8. Tasks auto-created from action items

## API Endpoints

### Auth
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user

### Meetings
- `GET /api/meetings` - List meetings
- `POST /api/meetings` - Create meeting
- `GET /api/meetings/:id` - Get meeting details
- `POST /api/meetings/:id/cancel` - Cancel recording
- `POST /api/meetings/:id/insights/regenerate` - Regenerate insights

### AI Content Generation
- `POST /api/ai/generate/email` - Generate email
- `POST /api/ai/generate/linkedin` - Generate LinkedIn message
- `POST /api/ai/generate/call-script` - Generate call script
- `POST /api/ai/generate/objection-response` - Generate objection response
- `POST /api/ai/improve` - Improve text
- `GET /api/ai/history` - Get content history
- `POST /api/ai/:id/rate` - Rate content
- `POST /api/ai/:id/use` - Mark content as used

### Workflow Automations
- `GET /api/automations` - List automations
- `POST /api/automations` - Create automation
- `GET /api/automations/:id` - Get automation
- `PUT /api/automations/:id` - Update automation
- `DELETE /api/automations/:id` - Delete automation
- `POST /api/automations/:id/toggle` - Toggle active state
- `POST /api/automations/:id/trigger` - Trigger manually
- `GET /api/automations/:id/runs` - Get run history
- `GET /api/automations/meta/triggers` - List available triggers
- `GET /api/automations/meta/actions` - List available actions

### Tasks
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `PATCH /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Contacts & Companies
- `GET /api/contacts` - List contacts
- `POST /api/contacts` - Create contact
- `POST /api/contacts/:id/enrich` - Enrich contact
- `GET /api/companies` - List companies
- `POST /api/companies` - Create company

### Pipeline
- `GET /api/pipeline/stages` - List stages
- `GET /api/pipeline/deals` - List deals
- `POST /api/pipeline/deals` - Create deal
- `PUT /api/pipeline/deals/:id/stage` - Update stage

### Analytics
- `GET /api/analytics/overview` - Sales overview
- `GET /api/analytics/forecast` - Pipeline forecast
- `GET /api/analytics/team-performance` - Team metrics
- `GET /api/analytics/trends` - Activity trends
- `GET /api/analytics/leaderboard` - User leaderboard

### Search
- `GET /api/search` - Global search
- `GET /api/search/quick` - Quick search (top results)

### Templates
- `GET /api/templates` - List templates
- `POST /api/templates` - Create template
- `GET /api/templates/:id` - Get template
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template
- `POST /api/templates/:id/duplicate` - Duplicate template
- `POST /api/templates/:id/render` - Render with variables
- `GET /api/templates/categories` - Get categories

### Lead Scoring
- `GET /api/lead-scoring/scores` - Get lead scores (leaderboard)
- `GET /api/lead-scoring/scores/:contactId` - Get contact score
- `POST /api/lead-scoring/events` - Record score event
- `POST /api/lead-scoring/adjust` - Manual adjustment
- `GET /api/lead-scoring/rules` - List scoring rules
- `POST /api/lead-scoring/rules` - Create rule
- `PUT /api/lead-scoring/rules/:id` - Update rule
- `DELETE /api/lead-scoring/rules/:id` - Delete rule
- `GET /api/lead-scoring/analytics/distribution` - Score distribution
- `GET /api/lead-scoring/event-types` - Available event types
- `POST /api/lead-scoring/recalculate` - Recalculate all scores

### Custom Fields
- `GET /api/custom-fields` - List custom fields
- `POST /api/custom-fields` - Create field
- `GET /api/custom-fields/:id` - Get field
- `PUT /api/custom-fields/:id` - Update field
- `DELETE /api/custom-fields/:id` - Delete field
- `POST /api/custom-fields/reorder` - Reorder fields
- `GET /api/custom-fields/values/:entityType/:entityId` - Get values
- `PUT /api/custom-fields/values/:fieldId` - Set value
- `PUT /api/custom-fields/values/bulk` - Bulk set values
- `GET /api/custom-fields/meta/field-types` - Get field types

## Development

### Generate Prisma client
```bash
pnpm db:generate
```

### Apply migrations
```bash
pnpm db:migrate
```

### Push schema changes
```bash
pnpm db:push
```

### Open Prisma Studio
```bash
pnpm db:studio
```

### Type checking
```bash
pnpm typecheck
```

### Build all packages
```bash
pnpm build
```

## Deployment (Hetzner)

### Docker Compose (Simple)

Use the production docker-compose with proper secrets and volumes.

### Kubernetes (Scale)

Deploy with k3s for horizontal scaling:
- API replicas behind load balancer
- Worker replicas with Temporal
- PostgreSQL with connection pooling
- Redis cluster for caching

## License

Proprietary - All rights reserved
