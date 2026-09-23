# PolyVerses — Status

> Status: AUTHORED · Updated 2026-09-23 · Owner: Ossama Mokhtar

| Surface | Real, simulated or design |
|---|---|
| Google sign-in, per-user Firestore storage of generated PRDs | **Real** |
| `POST /api/evaluate` with 5 prompt-specialised agent modes (Gemini, server-side key) | **Real** when `GEMINI_API_KEY` is set; **sandbox template** otherwise, and labelled as such |
| Orchestration console: staged workflow with approve / modify / rerun / pause gates | **Real UI flow**; three of its stages call the model, the rest are scripted |
| Agent roster (up to 23 agents with load, success rate, latency) | **Design**: static metadata with a simulated load jitter |
| Observability dashboard | **Simulated**: browser-generated metrics, labelled in the UI |
| Code browser ("Athena" Python / LangGraph backend) | **Reference design**: illustrative files, labelled; not the code that runs |
| Prompt console | **Real**: edit and view agent prompts |
| Firestore rules tests | **Planned** only |
| Deployment, users | **None** |
