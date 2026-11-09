# Plant Knowledge Graph – web deliverable (Vercel)

A static version of the prototype: the ISA-88 knowledge graph plus the analytics app built on top of it.
It needs no Docker, Neo4j or TimescaleDB, so it can be hosted on Vercel.

> All data is **simulated**. The equipment, recipes, batches and lots are assumptions. No company data is used.

## Why a knowledge graph: from hours to seconds

In most plants, a cross-batch question has its answer spread over several systems: batch records in the MES, lot
genealogy in the ERP, raw values in the historian, alarms in an event log and device history in the CMMS. Someone has to
export from each one, match timestamps and join the results in a spreadsheet. The graph stores those links once
(`CONSUMED`, `PRODUCED`, `DURING`, `INSTALLED_AT`, …), so the same question becomes a traversal.

The B-0412 investigation, question by question:

| Question | Without a graph | Manual (est.) | Graph |
|---|---|---|---|
| Which raw-material lots went into B-0412? | MES batch record → ERP lot lookup | 20–40 min | ms |
| Which later batches and lots contain B-0412 material (all levels)? | ERP genealogy, lot by lot, level by level | 1–2 h | ms |
| Which phase and equipment were active when the alarm fired? | Batch report + alarm log, matched by timestamp | 20–40 min | ms |
| Has TT-101 alarmed before, and which device was installed each time? | Alarm log export (30 batches) + CMMS install history | 1–2 h | ms |
| Is TT-101 drifting? Peak temperature per batch | Historian export per batch, combined in a spreadsheet | 45–90 min | ms |
| Where else is model TX-200 installed, and has it drifted there? | CMMS asset register + work-order history | 30–60 min | ms |
| **Total** | **5 systems** | **≈ 4–8 hours** | **well under a second** |

The **Value** page runs these six queries live and shows the measured time for each one.

Beyond speed, the graph gives:

- **Smaller, faster QA holds:** exact genealogy names the affected lots (B-0413, B-0414) right after a deviation.
- **Visible recurring faults:** linking alarms, devices and work orders across batches exposes the TT-101 drift that was
  closed twice as "no fault", and flags TT-301 with the same model before it causes a deviation.
- **Knowledge that stays with the plant:** which device sits where and what happened last time is in the graph, not only in
  an experienced engineer's head.
- **Audit-ready answers:** every answer is a reproducible query, not a one-off spreadsheet.

> The manual times are illustrative estimates for a plant with separate MES, ERP, historian, alarm log and CMMS; they are
> not measured. The graph times are measured on the simulated graph (267 nodes). Index-backed traversals in Neo4j
> typically stay in the millisecond-to-second range at production scale because they only touch connected data.

## What's inside

| Page | What it shows |
|---|---|
| Overview | The golden story (B-0412 → TT-101 drift → TX-200 at TT-301) and the architecture |
| Value | How the graph turns a multi-hour, multi-system investigation into milliseconds, with live timings |
| Knowledge graph | An interactive graph explorer with preset views, search, layer filters, a node inspector and neighbour expansion |
| Batch traceability | Lots in and out, downstream batches, phase runs (planned vs. actual), process-value charts and the batch subgraph |
| Fault analysis | Alarm history per Control Module, the device installed at each alarm, and per-batch peaks from the graph aggregates |
| Maintenance knowledge | Where a device model is installed, its work-order history and the drift recommendation |
| Data model | Graph schema, node and relationship counts, data-quality checks, and downloads (`graph.json`, `graph.cypher`) |

Every table and chart is a traversal of the in-browser graph (`src/kg.js`). The Cypher query that answers the same
question in Neo4j is shown next to it.

## How the data is made

`scripts/build_graph.py` replays the deterministic scenario (`../services/scenario.py`) for the 30 historical
batches **B-0391 to B-0420**. It applies the same graph rules as the sync job (`../services/sync.py`) in memory and writes:

- `public/data/graph.json`: 267 nodes and 880 relationships, with the same labels, types and properties as in Neo4j
- `public/data/pv/B-xxxx.json`: raw process values per batch, i.e. the time-series store. They are kept outside the graph (ADR-0001).
- `public/data/graph.cypher`: a script that loads the same graph into Neo4j 5 (`cypher-shell -f graph.cypher`)
- `public/data/meta.json`: build information

The generated files are committed, so Vercel only runs the Vite build. Re-generate them after changing the scenario:

```bash
python scripts/build_graph.py
```

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build && npm run preview
```

## Deploy to Vercel

- **Dashboard:** import the repository and set **Root Directory = `web`**. The framework (Vite), the build command and the
  `dist` output come from `vercel.json`.
- **CLI:** from this folder, `npx vercel` (preview) or `npx vercel --prod`.

Routing uses URL hashes (e.g. `/#/trace?batch=B-0412`), so links to any view can be shared and no rewrites are needed.
