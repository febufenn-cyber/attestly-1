# Attestly

> upload your policies once, AI auto-answers vendor security questionnaires (CAIQ, SIG) and flags anything it can't back up.

**Alternative to the product-shape pioneered by Delve (YC ~S23)** — rank #1 of 500 in the [YC-500 Fable 5 Venture Blueprint](https://github.com/) (score 7.5/10).

## Why this exists
AI agents can do compliance grunt work at a fraction of consultant cost. The buildable wedge: ai agent that fills security questionnaires from your evidence base.

## MVP scope
- [ ] Policy upload
- [ ] questionnaire import
- [ ] AI drafts answers
- [ ] confidence flags
- [ ] export to Excel/portal

## Architecture
`Workers+Supabase+Claude` — Cloudflare Workers + Hono API, Supabase (Postgres + RLS + Auth + pgvector), Claude API via Agent SDK (claude-fable-5 for agent reasoning, claude-haiku-4-5 for volume), wrangler deploys.

**Integrations:** Claude API; Google Drive; Stripe
**Data:** Company policy corpus and answered-questionnaire library.
**Agent core:** Agent retrieves evidence and drafts defensible questionnaire answers end-to-end.

## Business
| | |
|---|---|
| Monetization | Per-questionnaire or seat subscription |
| First customer | Sales engineers drowning in security questionnaires |
| GTM wedge | Free single-questionnaire trial; sales-eng communities |
| Competition risk | High: hot AI-compliance space |
| Regulatory/trust risk | Med: wrong answers create liability |
| India angle | Speeds Indian vendors through US buyers' security review bottleneck. |
| Difficulty / build time | Medium / 2-3 weeks |

## 30-day plan
- **W1:** core loop — Policy upload + questionnaire import
- **W2:** AI drafts answers + confidence flags + export to Excel/portal + auth + billing
- **W3:** polish, instrument events, seed first users via: Free single-questionnaire trial; sales-eng communities
- **W4:** launch + first revenue; kill/scale decision

---
*Built with Fable 5 (Claude Code). Blueprint row: inspired by Delve — "AI-native SOC2 and HIPAA compliance automation platform."*