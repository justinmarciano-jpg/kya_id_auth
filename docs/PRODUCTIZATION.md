# Productization: KYA ID Auth

**Lens:** VP Product / Growth. PMF, monetization, funnel conversion. No vanity metrics.

---

## 1. Ideal Customer Profile (ICP) — Ruthless precision

**Primary ICP:**  
**Platform or engineering org that already runs 10+ production AI agents (or agent types) that call MCPs/tools, and is feeling real pain from role/service-account sprawl.**

- **Title:** Head of Platform, Director of Engineering (AI/agents), CTO at an AI-native or heavy-automation company.
- **Behavioral signal:** They have (or are building) a “gateway” or “tool layer” in front of MCPs/tools. They’ve already hit the wall: “We’re creating a new role + scoped MCP set + service account per agent. It doesn’t scale.”
- **Budget:** They have infra/security budget. They care about audit, compliance, and ops cost.
- **Not ICP:** Solo devs, “we might use agents someday,” or teams with 1–2 agents and no gateway. If the product serves “everyone,” it serves no one.

**Secondary ICP:**  
**Enterprise that mandates “identity and audit for every non-human actor.”** Compliance/security is the buyer; eng is the implementer. Monetization is enterprise license + support, not usage-based.

---

## 2. Problem validation (does this deserve a budget?)

| Claim | Evidence you need before scaling GTM |
|-------|-------------------------------------|
| “Role/service-account per agent doesn’t scale” | 5+ conversations: “How many agents do you run? How do you scope MCP/tool access today? How much time do you spend on it?” |
| “We’d pay for a hosted identity layer” | Willingness to pay (letter of intent, pilot fee, or signed pilot). If they’ll only use OSS, treat as community, not revenue. |
| “Audit/compliance matters” | Security/compliance in the loop on vendor selection; requirement for “per-agent” or “per-actor” audit trail. |

**Kill signal:** If the only answer is “it’s annoying” and no one can tie it to cost (ops, risk, or compliance), this is a nice-to-have, not a product. Narrow to ICPs where the pain is budgeted (time, risk, or contract).

---

## 3. Go-To-Market (GTM) strategy

**Positioning (one line):**  
“Identity and scoped permissions for AI agents — so you stop creating a new role and service account for every agent.”

**Acquisition channels (in order of leverage):**

1. **PLG / DevRel (primary if you want low CAC):**  
   OSS repo + hosted free tier. Funnel: discover repo → run example (Docker or npm) → “Aha!” in < 30 min → sign up for hosted → hit usage limit → convert to paid. Content: “How we scaled agent access without role sprawl,” “MCP gateway + per-agent credentials in 15 minutes.” Track signup source (repo, blog, docs).

2. **Sales-led (enterprise):**  
   Outbound to platform/eng leaders at companies that already run agent fleets (Dust-style, internal agent platforms, heavy MCP usage). Offer: pilot (hosted or self-hosted) with clear success metric (e.g. “reduce role/service-account creation by X”). Conversion: pilot → annual contract. No free tier for this segment; price on “agents under management” or “verified calls/month” + support/SLA.

3. **Partnership / embed:**  
   “Powered by KYA” inside agent platforms (e.g. Dust, Inngest, temporal). They resell or bundle; you get revenue share or platform fee. Only pursue if you have a clear rev-share or per-seat model.

**Competitive positioning:**  
- Not “we’re OAuth for AI” (confusing; you’re not OAuth).  
- “Per-agent credentials and permissions so your MCP/tool layer can allow/deny without creating a new role per agent.”  
- Versus “we use one service account per agent”: “We give each agent a signed credential with scoped capabilities; you verify one JWT and enforce. No role sprawl.”  
- Versus “we use RBAC”: “RBAC is for humans. Agents get their own identity and capability set; your gateway checks the token.”

**Pricing psychology (tiered):**

- **Free / OSS:** Self-host only. Unlimited agents. Use case: try it, contribute, run in dev. No SLA, no audit retention.
- **Starter (PLG):** Hosted. Cap: e.g. 50 agents, 10k verifications/month. Goal: activation and “Aha!”, not profit. Price: $0 or nominal ($29/mo).
- **Growth:** Higher caps (agents + verification volume). Target: teams that outgrow Starter. Price: $99–299/mo. This is where unit economics matter (CAC payback < 12 mo).
- **Enterprise:** Self-host or dedicated hosted. Unlimited/custom caps. Audit retention, SSO/SCIM, SLA. Price: annual contract, $20k–100k+ depending on agents and compliance. Focus on LTV and net retention.

**Monetization lever:**  
Revenue must be tied to something that scales with customer success: **agents under management** and/or **verification (API) volume**. Not “seats” alone — the buyer is platform/eng, not every developer. Optional: audit log retention (e.g. 90 days free, 1 year+ paid).

---

## 4. The “Aha!” moment

**Definition:**  
“I registered an agent with capabilities, put the verifier in front of my MCP/tool layer, and allowed/denied a call without creating a new role or service account.”

**Fastest path to Aha! (target: < 30 min from landing to value):**

1. **Landing:** “Identity for AI agents — scoped permissions without role sprawl.” CTA: “Run the example” (Docker one-liner), “Try the dashboard,” or “Sign up for hosted.”
2. **Demo dashboard (in-repo):** Run server → open `http://localhost:3000` (or `/dashboard.html`). Register an agent in the form, then “Try the verifier” with an action (e.g. `read:notion` vs `write:database`). See Allowed/Denied in the UI. Outcome: “So my gateway just verifies a JWT and reads capabilities.”
3. **Run the example (no signup):** `docker compose up -d` + `docker compose -f docker-compose.yml -f examples/docker-compose.test.yml run --rm test-flow`. User sees: register → verifier allows/denies by capability. Same outcome as dashboard, CLI-style.
4. **Activation (with signup):** Sign up → create project → get API URL + registration secret → register first agent (curl, SDK, or dashboard) → run verifier against hosted JWKS → see allowed/denied. Outcome: “I’m using KYA in production.”
5. **Retention hook:** First “real” integration: user adds verifier to their MCP gateway or agent runtime; first verified allow/deny in their env. That’s the moment to capture in product and in support.

**Funnel metric:**  
% of signups (or repo users who run the example) who reach “first agent registered and at least one verification” within 7 days. If this is low, fix onboarding and docs before adding features.

---

## 5. Telemetry plan (if it isn’t tracked, it doesn’t exist)

**Instrumentation:** PostHog, Amplitude, or Mixpanel. Every critical action = one event. No “cool” events that don’t tie to funnel or revenue.

**Funnel events (hosted product):**

| Stage | Event | Owner |
|-------|--------|--------|
| Acquisition | `signup_started`, `signup_completed`, `source` (repo / blog / paid) | Growth |
| Activation | `project_created`, `first_agent_registered`, `first_verification_success` | Product |
| Retention | `verification_success` (count by project, daily), `agent_count` (by project) | Product |
| Revenue | `plan_upgraded`, `plan_downgraded`, `contract_signed` | Sales / RevOps |

**In-repo hooks (optional):** The server supports an optional `onEvent` callback in config (e.g. when creating the app for a hosted wrapper). Events fired: `agent_registered` (agent_id, project_id), `agent_lookup` (agent_id), `log_submitted` (agent_id), `jwks_fetched`. Wire these to PostHog/Amplitude in your hosted deployment; no PII in the payload by default.

**Conversion rates to watch:**

- Signup → first agent registered (target: > 40% within 7 d).
- First agent registered → first verification (target: > 80% within 24 h).
- Free/Starter → paid (target: > 5% of actives; tune by cohort).
- Churn: % of paid customers that go to zero verifications or cancel. Segment by plan.

**Drop-off alerts:**  
If “signup → first agent” drops below 30%, treat as P0. If “first agent → first verification” drops below 60%, the verifier path or docs are broken.

**OSS / self-host:**  
No PII. Optional: anonymous “run_example” (e.g. Docker run count) or “telemetry_opt_in” with high-level usage (agents count, verification count). Do not ship “cool tech” that isn’t tied to a decision (e.g. “improve onboarding” or “prioritize enterprise”).

---

## 6. What to kill (harsh filter)

- **Features that don’t drive revenue, retention, or acquisition:**  
  Example: fancy dashboards that don’t affect “first verification” or upgrade. Kill until core funnel is instrumented and improving.

- **“We’re like OAuth for AI”:**  
  Confusing and inaccurate. Replace with: “Per-agent credentials and scoped permissions for your MCP/tool layer.”

- **Serving “everyone building AI”:**  
  Narrow to ICP: 10+ production agents, gateway in front of MCPs/tools, pain from role/service-account sprawl (or compliance). Ignore everyone else for GTM.

- **Building without proof of willingness to pay:**  
  Before scaling sales or paid features, get 3–5 ICPs to say “we’d pay for hosted/support” and, if possible, sign a pilot or LOI. If they only want OSS, double down on community and usage; don’t assume they’ll convert later.

- **Vanity metrics:**  
  “Stars,” “downloads,” “agents created” — only matter if they predict activation or revenue. Track “agents that led to at least one verification” and “projects that upgraded to paid.”

---

## 7. Summary: actionable next steps

| Lever | Action |
|-------|--------|
| **ICP** | Write a one-pager: “Who we’re for (platform/eng, 10+ agents, MCP gateway), who we’re not (solo dev, 1–2 agents).” Use it in every GTM asset. |
| **GTM** | Choose one: PLG (OSS + hosted free tier + content) or sales-led (outbound to platform/eng, pilot → contract). Don’t do both at full scale until one works. |
| **Aha!** | Optimize the path: landing → run example (Docker) → first agent + first verification. Measure time-to-Aha! and 7-day activation %. |
| **Telemetry** | Ship: signup, project_created, first_agent_registered, first_verification_success, plan_upgraded. Add alerts on funnel drop-off. |
| **Revenue** | Tie pricing to agents and/or verification volume. Get 3–5 ICPs to commit (pilot or LOI) before building more “cool” features. |

If the pain isn’t budgeted and no one will pay, this stays OSS and community. If it is, this doc is the playbook.
