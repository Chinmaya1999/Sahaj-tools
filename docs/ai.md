# AI features: design, limits and evaluation

AI is **optional**. With `LLM_PROVIDER=none` (default) every tool works; AI buttons show a clear "not enabled" message (tested in E2E).

## Where AI is used
1. Resume wording (`POST /api/resumes/ai`): summary, bullet points, cover letter – from facts the user typed.
2. Invitation wording / Odia translation help (`POST /api/invitations/ai`) – three editable options.
Not used for: arithmetic, totals, stock, PDFs, QR, resizing, payments (all deterministic).

## Safeguards (all in code, all tested with a fake model)
- Provider-neutral adapter, key only on the server, 20 s timeout, graceful 503 fallback.
- Per-user (default 15/day) and global (default 300/day) request caps → bounded spend. Token usage is recorded per user/day (`AiUsage`).
- Model must return JSON; it is parsed and validated with Zod; junk is rejected.
- **Resume guard:** any number (year, %, count) in the output that is not in the user's supplied facts causes the suggestion to be discarded.
- Output is labelled "AI-generated – review and edit"; nothing is applied without the user clicking "Use".
- Invitation output carries a warning to verify names/dates/addresses/translation with a fluent reader.
- Only the text the user submitted for that request is sent to the provider (privacy policy says so).

## Evaluation (no accuracy figure is claimed)
No measured accuracy exists because no live model key was available during development. Before enabling AI in production, run this procedure and record results:
- **Dataset:** ≥30 resume fact-sets (varied seniority, thin facts, non-English names, special characters) and ≥20 invitation requests (6 occasions × English/Odia).
- **Resume acceptance criteria:** 0 invented employers/degrees/numbers (hard fail; guard catches numbers, human review catches names); ≥90% judged "usable after light edit" by 2 reviewers; 100% valid JSON after one retry.
- **Odia criteria:** a fluent Odia reader marks each option acceptable/unacceptable; require ≥80% acceptable and zero offensive/incorrect festival or family terms before enabling `language=or` AI wording for customers. Until then keep the "verify translation" warning prominent (it is).
- **Procedure:** run the dataset through the endpoints with the chosen model, store outputs, blind-review, compute rates, repeat whenever the model or prompt changes.
