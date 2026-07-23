# Riley Greiff, P.E.

**AI / Machine Learning Engineer**

Remote (based in Tennessee) · 931-801-9462 · rgreiff97@gmail.com · github.com/RileyGreiff

---

## Summary

Machine learning engineer who ships LLM-powered products end to end — from data pipeline to deployed, user-facing app. MS in Computational Analytics from Georgia Tech and a licensed Professional Engineer (TN) with 7 years as a transportation engineer solving quantitative, high-stakes problems. Strengths in applied LLM systems (retrieval, extraction, ranking), production ML serving, and inference efficiency.

---

## Technical Skills

**Languages:** Python, SQL, R, TypeScript
**ML / AI:** PyTorch, Transformers, LightGBM, FAISS, RAG, two-tower retrieval, learning-to-rank, quantization
**LLM / Applied:** Claude API, structured extraction, agent loops, cost-aware routing, offline eval
**Systems / MLOps:** FastAPI, Docker, Redis, PostgreSQL, Prometheus, dynamic batching, load testing, CI
**Data / Web / Cloud:** pandas, NumPy, A/B testing & bootstrap CIs, Next.js/React, Vercel, Google Cloud, Neon, Stripe

---

## Education

**M.S., Computational Analytics** — Georgia Institute of Technology · 2023 – 2025
**B.S., Civil Engineering** — University of Tennessee, Knoxville · 2015 – 2019 · GPA 3.79 / 4.00

---

## Selected Projects

**The Wedding Dossier — Live AI Product** · Next.js, PostgreSQL, Claude API, Google Cloud · [theweddingdossier.com](https://theweddingdossier.com)
- Built and operate a live production LLM pipeline solo, end to end: discover (Google Places) → crawl → **extract with Claude (Batch API)** → **score & rank** → serve a personalized dashboard — **5 states, 47 metros, ~285 cities, 15,000+ vendors**.
- Per-category scoring model blends weighted features with data-sparsity and wedding-relevance gating (learned from real crawl-quality failures); cost-engineered to ~$0.0025/vendor under Google's free tier. Stack: Next.js 16 / React 19, Neon Postgres, Clerk, Stripe, Vercel.

**Mini-Netflix RecSys — Production-Style Recommender** · PyTorch, FAISS, LightGBM, FastAPI
- Two-stage system: PyTorch two-tower retrieval (FAISS ANN, <5 ms) → LightGBM LambdaRank ranking, served via FastAPI at **~45 ms/request** with dynamic batching, backpressure, a Redis feature store (train/serve skew checks), and Prometheus metrics (~3,200 LOC).
- Ran a simulated A/B test with bootstrap CIs and measured a statistically significant NDCG@10 lift from the ranking stage (diagnosed and fixed an unstable relative-lift estimator that produced meaningless CIs).

**Token Convergence — Interpretability Research** · PyTorch, Transformers
- Measured per-token, per-layer representation convergence across **Pythia-1.4B/6.9B and Mistral-7B** (32K+ tokens); reported an honest negative result on KV-cache speedups with causal freeze-intervention validation. Drafting a workshop paper.

**LLM Plays Pokémon — Autonomous Agent** · Claude API, Python
- Autonomous agent that plays Pokémon FireRed from emulator memory with deterministic BFS navigation and cost-aware Haiku/Sonnet routing — **88% of 69K actions ran as free deterministic steps**, keeping total API spend under $10 (SQLite-logged token/cost accounting).

*Also: `kvviz` (KV-cache profiler), tiny quantized LLMs on Nintendo DS.*

---

## Professional Experience

**Transportation Engineer** — Tennessee Department of Transportation · Jan 2020 – Jul 2025, Feb 2026 – Present
- Perform and author traffic safety and operations studies on state highways; review site plans and traffic impact studies for commercial driveway permits and develop conceptual road-safety improvement plans.
- Built a **data-driven crash-risk ranking model** that scored every 4-lane divided-highway intersection lacking a left-turn lane by crash count, AADT, speed limit, and crash rate — surfacing the highest-risk sites for safety investment (queried the TDOT crash database + GIS).
- As Transportation Engineering Specialist (2020–24), helped coordinate **50+ resurfacing and bridge-replacement projects worth $20M+ annually across 24 East TN counties**; computed quantity estimates and ran inspections for compliance.

**Traffic Operations Specialist** — Y-12 National Security Complex · Jul 2025 – Feb 2026
- Built a system to log and track workzone traffic verifications and traffic studies for standards compliance and auditability; partnered with developers on a new platform to host, share, and log the department's traffic work.

**Traffic Engineer** — Felsburg, Holt & Ullevig · Synchro/VISSIM traffic modeling · Jun – Nov 2019

---

*One-page version, ATS-safe. Dates are right-aligned in the .docx/.pdf.*
