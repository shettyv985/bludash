# BLUDASH

A custom analytics and reporting dashboard for Meta Ads and social media performance. This Next.js app combines client login, Meta data fetching, AI-powered analysis, and PDF/HTML report generation.

## What this project does

- Provides a **login-based dashboard** for clients and admins.
- Fetches **Meta Ads performance** from Facebook/Instagram ad accounts.
- Fetches **social media post insights** for Facebook and Instagram.
- Builds **pre-analyzed report payloads** from raw Meta data.
- Sends data to **generative AI** to create deep performance reports.
- Renders HTML reports for browser printing and PDF generation.
- Supports a **public Instagram fallback** when private API access is unavailable.

## Core features

- **Login flow:** static credentials in `lib/auth.ts` with localStorage session management.
- **Dashboard routing:** `app/page.tsx` redirects to login, `app/login/page.tsx` renders the login page, and `app/dashboard/page.tsx` renders the main app.
- **Client selection:** admin users with `clientKey: ALL` can select any client; other users are locked to their own client.
- **Report selection:** choose between `Social Media` and `Performance` reports.
- **Date range and platform filters:** select reporting window and platform filter (Facebook / Instagram / Both).
- **AI analysis:** uses OpenAI Responses API and Manus endpoints for deep JSON and HTML report generation.

## Architecture overview

### Frontend

- `app/layout.tsx` defines the global HTML layout, fonts, and metadata.
- `app/page.tsx` is the public entry point and renders the login form.
- `app/login/page.tsx` renders the login page.
- `app/dashboard/page.tsx` is the authenticated dashboard with report controls.
- `components/LoginForm.tsx` builds the login UI, validates credentials, and stores user info.
- `components/dashboard/*` contains dashboard form controls, report views, and utility hooks.

### Backend / API

- `app/api/ads/route.ts` handles Meta Ads configuration and snapshot requests.
- `app/api/social-media/route.ts` returns resolved social media configuration.
- `app/api/public-instagram/route.ts` scrapes public Instagram profile data when private API access is unavailable.
- `app/api/gpt-report/route.ts` sends ad performance payloads to OpenAI and returns JSON report data.
- `app/api/social-gpt-report/route.ts` sends social media payloads to OpenAI and returns JSON report data.
- `app/api/gpt-html-report/route.ts` renders report HTML from payload and AI analysis.
- `app/api/manus-report/route.ts` and `app/api/manus-html/route.ts` support Manus AI report generation paths.
- `app/api/social-manus-report/route.ts` and `app/api/social-manus-html/route.ts` support Manus-based social report generation.
- `app/api/chat/route.ts` supports an AI chat assistant on the dashboard.

### Data helpers

- `lib/metaClientConfig.ts` loads and validates client-specific Meta credentials from environment variables.
- `lib/metaAdsPerformanceServer.ts` queries Facebook Ads endpoints to build ad/campaign/adset snapshots.
- `lib/metaSocialReportServer.ts` queries Facebook Page and Instagram media insights.
- `lib/buildReportPayload.ts` turns raw ad data into a structured, benchmarked payload for AI analysis.
- `lib/buildSocialReportPayload.ts` turns social media posts into a structured payload.
- `lib/openaiResponses.ts` handles OpenAI Responses API requests and JSON extraction.
- `lib/generateReportPDF.ts` and `lib/generateSocialReportPDF.ts` request HTML renderers and open report tabs.

## How this is useful

BLUDASH is built for marketing teams and digital agencies that need:

- a single pane of glass for **Meta Ads performance** and **organic social insights**
- quick **AI-generated executive summaries** and **deep report narratives**
- a flexible client-based dashboard with **admin access** and **client restrictions**
- fallback support for **public Instagram scraping** when private tokens are missing

The app is useful for turning raw Facebook/Instagram metrics into meaningful recommendations, reporting, and creative action plans.

## Running locally

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
npm run start
```

## Environment configuration

This project relies on environment variables for Meta API credentials, AI APIs, and report generation.

### Required env vars

- `OPENAI_API_KEY` — required for OpenAI report generation.

### Optional AI and report env vars

- `MANUS_API_KEY` — optional if you use Manus-powered report and chat endpoints.
- `GEMINI_API_KEY` — optional if you use the Gemini HTML report route.
- `OPENAI_REPORT_MODEL` — optional model override for OpenAI Responses API.
- `OPENAI_REPORT_REASONING_EFFORT` — optional reasoning effort setting for OpenAI (`low`, `medium`, `high`, `xhigh`).
- `META_ADS_INSIGHTS_CHUNK_DAYS` — optional number of days fetched per Meta Ads insights request; defaults to `2`.

### Client-specific env vars

Each client uses a prefix matching the `clientKey` values in `lib/auth.ts` and `lib/metaClientConfig.ts`. Example keys include:

- `ABADBuilders_TOKEN`
- `ABADBuilders_AD_ACCOUNT_ID`
- `ABADBuilders_FB_PAGE_ID`
- `ABADBuilders_IG_USER_ID`
- `ABADBuilders_IG_PROFILE_URL`
- `ABADBuilders_IG_USERNAME`

If the Instagram Business ID is not available, the code can attempt to resolve it from the linked Facebook page by using `FB_PAGE_ID` and the access token.

## Credentials and login

Static login credentials live in `lib/auth.ts`.





The login form stores the session in `localStorage` under `bludash_user`.

## Important files

- `app/dashboard/page.tsx` — main dashboard page and UI state.
- `components/dashboard/PerformanceReport.tsx` — performance report rendering and export logic.
- `components/dashboard/SocialMediaReport.tsx` — social media report rendering.
- `components/dashboard/useAdsPerformance.ts` — fetches and caches ad performance snapshots.
- `components/dashboard/useBoostedPosts.ts` — fetches boosted post insights and matches to organic posts.
- `components/LoginForm.tsx` — login UI and authentication logic.
- `lib/metaClientConfig.ts` — client config resolution and required field checks.
- `lib/openaiResponses.ts` — shared OpenAI request and JSON response handling.

## Data flow summary

1. User logs in and selects client, report type, date range, and platform.
2. The dashboard uses client config from `lib/metaClientConfig.ts`.
3. For ads reports, `/api/ads` fetches ad account snapshots from Meta.
4. For social reports, `/api/social-media` resolves social config and optionally `/api/public-instagram` scrapes Instagram.
5. The frontend builds analyzed payloads with `buildReportPayload` or `buildSocialReportPayload`.
6. AI endpoints generate deep JSON insight objects using OpenAI or Manus.
7. Report HTML is rendered via `app/api/gpt-html-report/route.ts` or Manus HTML routes.
8. Users can download or print the generated report.

## Notes

- The app currently uses direct user-password authentication for demo purposes; production would require a secure auth system.
- The `public-instagram` route is a fallback for scraping when Instagram Business API access is unavailable.
- The `gpt-report` and `social-gpt-report` endpoints expect strict JSON output from AI and parse it safely.
- The dashboard includes a theme toggle and a responsive grid-based layout for modern usability.

## Package and tech stack

- `next` 16.2.4
- `react` 19.2.4
- `typescript` 5
- `tailwindcss` 4
- `lucide-react` for icons
- `jspdf` and `jspdf-autotable` for PDF utilities

## How to extend

- Add new clients by extending `lib/auth.ts`, adding env vars in `metaClientConfig.ts`, and updating `AUTH` values.
- Add new report types by creating a new dashboard component and a matching API route.
- Add richer AI prompts by editing `app/api/gpt-report/route.ts`, `app/api/social-gpt-report/route.ts`, or the Manus prompt builders.
- Add a proper portal authentication layer to replace the static credentials.

---

This README now reflects BLUDASH's actual app architecture, data flow, and purpose, not the default starter content.
