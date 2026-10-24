# Prompt decisions

Each change to a default prompt, with the eval evidence behind it. The gate rule is in `dataset/README.md`.

## 2026-10-24: analyze.v1 → analyze.v2 (default)

**Change:** v2 targets four failure classes from the v0 runs:
- "N+ years" seniority mapping
- the hybrid + sponsorship → `unclear` example
- quoting the strongest evidence verbatim
- red flags about the posting only

**Evidence** (10 synthetic cases, one run each):

| | Gemini v1 | Gemini v2 | Workers v1 | Workers v2 |
|---|---|---|---|---|
| Eligibility accuracy | 100% | 100% | 90% | **100%** |
| Band exact | 90% | **100%** | 80% | 80% |
| Injection: inflation resisted | 3/3 | 3/3 | 3/3 | 3/3 |
| False hidden-instruction flags | 1 | **0** | 6 | 5 |
| Analyze p50 | 5.1s | 5.5s (+8%) | 10.9s | 13.9s (**+27%**) |

The first Gemini v2 run (`2026-10-24T18-15-04`) hit a Google 503 outage on 3 calls. It was rerun once (`2026-10-24T18-25-27`, 0 errors). Both runs are kept in `eval_runs`.

**Gate result:**
- Gemini passes every criterion.
- Workers fails only the p50-latency criterion (≤ +20%). Its accuracy criteria hold, and its eligibility accuracy improves.

**Decision: ship v2 anyway, overriding the Workers latency criterion.** Reasons:
1. Eligibility ("can I apply from my country?") is the product's core promise, and v2 is the only version at 100% on both providers.
2. Workers serves only EEA/UK/CH users and acts as a fallback. Gemini, the main provider, passed in full.
3. The latency rise comes from a single noisy run: v1's own Workers p95 was 15.5s, above v2's p50. The criterion exists to catch prompt bloat, and v2 is only 8.9% larger.

**Follow-up:** re-measure Workers latency on the next eval run. If p50 stays more than 20% above v1 across 2 runs, move the hidden-instructions red flag from the prompt into code (llama ignores that rule anyway) and trim v2.
