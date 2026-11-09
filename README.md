# ISA-88 Plant Knowledge Graph

A knowledge graph of a batch plant, modelled on the **ISA-88** physical and procedural models, plus an analytics app
that answers cross-system questions (traceability, fault analysis, maintenance) as graph traversals.

> All data is **simulated**. The equipment, recipes, batches and lots are assumptions. No company data is used.

The project exists in two forms:

| | This repository (web) | Full local stack |
|---|---|---|
| What it is | Static React app with the graph loaded in the browser | Edge-to-graph data pipeline in Docker Compose |
| Runs on | Any static host (Vercel), or `npm run dev` | Docker on a local machine |
| Graph store | `graph.json` + an in-browser traversal layer | Neo4j 5 |
| Time series | One JSON file per batch | TimescaleDB |
| Data | 30 historical batches, B-0391 to B-0420 | The same 30 batches, plus optional live batches |

The web version is what's hosted. The [full local stack](#the-full-local-stack-what-runs-behind-this) is where the
architecture was built and tested; it's described at the end of this README.

## Why a knowledge graph: from hours to seconds

In most plants, a cross-batch question has its answer spread over several systems: batch records in the MES, lot
genealogy in the ERP, raw values in the historian, alarms in an event log and device history in the CMMS. Someone has to
export from each one, match timestamps and join the results in a spreadsheet. The graph stores those links once
(`CONSUMED`, `PRODUCED`, `DURING`, `INSTALLED_AT`, …), so the same question becomes a traversal.

The B-0412 investigation, question by question. Manual times are hands-on work for an experienced engineer who
already has access to every system:

| Question | Without a graph | Manual, hands-on (est.) | Graph |
|---|---|---|---|
| Which raw-material lots went into B-0412? | MES batch record → ERP lot lookup | 5–10 min | ms |
| Which later batches and lots contain B-0412 material (all levels)? | ERP genealogy, lot by lot, level by level | 10–20 min | ms |
| Which phase and equipment were active when the alarm fired? | Batch report + alarm log, matched by timestamp | 5–10 min | ms |
| Has TT-101 alarmed before, and which device was installed each time? | Alarm log export (30 batches) + CMMS install history | 15–30 min | ms |
| Is TT-101 drifting? Peak temperature per batch | Historian export per batch, combined in a spreadsheet | 15–30 min | ms |
| Where else is model TX-200 installed, and has it drifted there? | CMMS asset register + work-order history | 10–20 min | ms |
| **Total** | **5 systems** | **≈ 1–2 hours** | **well under a second** |

Elapsed time is often longer, because exports and records have to be requested from QA, IT or maintenance. The
slowest steps are the ones no single system can answer, such as which device was installed when an alarm fired.

The **Value** page runs these six queries live and shows the measured time for each one.

Beyond speed, the graph gives:

- **Smaller, faster QA holds:** exact genealogy names the affected lots (B-0413, B-0414) right after a deviation.
- **Visible recurring faults:** linking alarms, devices and work orders across batches exposes the TT-101 drift that was
  closed twice as "no fault", and flags TT-301 with the same model before it causes a deviation.
- **Knowledge that stays with the plant:** which device sits where and what happened last time is in the graph, not only in
  an experienced engineer's head.
- **Audit-ready answers:** every answer is a reproducible query, not a one-off spreadsheet.

> The manual times are conservative estimates for a plant with separate MES, ERP, historian, alarm log and CMMS; they
> are not measured and leave out waiting for exports or other teams. The graph times are measured on the simulated graph
> (267 nodes). Index-backed traversals in Neo4j typically stay in the millisecond-to-second range at production scale
> because they only touch connected data.

## The golden story

The demo follows one storyline across all pages:

1. **Traceability.** Batch **B-0412** (Citrus Base) raises a HIHI alarm on TT-101 during *Hold*. The graph shows which
   raw-material lots went in and which product lots and downstream batches (B-0413, B-0414) are affected.
2. **Fault analysis.** TT-101 had already raised warnings in B-0400 and B-0406. The work order at that time found
   "no fault". The per-batch peaks show the drift building up.
3. **Maintenance knowledge.** WO-77012 replaced the transmitter, model TX-200. The same model is still installed at
   **TT-301**, which drifted before, so a check there is recommended.

## What's inside

| Page | What it shows |
|---|---|
| Overview | The golden story and the architecture |
| Value | How the graph turns a 1–2 hour, multi-system investigation into milliseconds, with live timings |
| Knowledge graph | An interactive graph explorer with preset views, search, layer filters, a node inspector and neighbour expansion |
| Batch traceability | Lots in and out, downstream batches, phase runs (planned vs. actual), process-value charts and the batch subgraph |
| Fault analysis | Alarm history per Control Module, the device installed at each alarm, and per-batch peaks from the graph aggregates |
| Maintenance knowledge | Where a device model is installed, its work-order history and the drift recommendation |
| Data model | Graph schema, node and relationship counts, data-quality checks, and downloads (`graph.json`, `graph.cypher`) |

Every table and chart is a traversal of the in-browser graph (`src/kg.js`). The Cypher query that answers the same
question in Neo4j is shown next to it.

**Stack:** React 18, Vite 5, Cytoscape.js (fcose and dagre layouts) for the graph, Recharts for process values.

## Run the web app

```bash
npm install
npm run dev        # http://localhost:5173
npm run build && npm run preview
```

## Deploy to Vercel

- **Dashboard:** import the repository and leave the Root Directory at the repo root. The framework (Vite), the build
  command and the `dist` output come from `vercel.json`.
- **CLI:** `npx vercel` (preview) or `npx vercel --prod`.

Routing uses URL hashes (e.g. `/#/trace?batch=B-0412`), so links to any view can be shared and no rewrites are needed.

## How the data is made

`scripts/build_graph.py` replays the deterministic scenario from the full local stack for the 30 historical batches
**B-0391 to B-0420**. It applies the same graph rules as the stack's sync job, but in memory, and writes:

- `public/data/graph.json`: 267 nodes and 880 relationships, with the same labels, types and properties as in Neo4j
- `public/data/pv/B-xxxx.json`: raw process values per batch (21,900 in total), i.e. the time-series store. They are
  kept outside the graph, as in the full stack.
- `public/data/graph.cypher`: a script that loads the same graph into Neo4j 5 (`cypher-shell -f graph.cypher`)
- `public/data/meta.json`: build information and data-quality checks

The generated files are committed, so Vercel only runs the Vite build. The script imports `services/scenario.py` and
reads `data/` from the full local project, so it has to run from inside that project (where this app sits in `web/`):

```bash
python web/scripts/build_graph.py
```

---

## The full local stack: what runs behind this

The web app is a snapshot. The main engineering work is a local prototype of how a plant would actually fill this graph:
data leaves the automation layer through an edge orchestrator (**Litmus Edge**, simulated by default), travels over MQTT
into a time-series store, and a sync job turns the graph-relevant part into Neo4j nodes and relationships. Everything runs
in Docker Compose. The stack's code is kept in a separate local project, not in this repository.

### Architecture

```
 Level 0-2          Level 3                 Level 3.5 (DMZ)                  Level 4 (IT)
 PLC / batch  ──▶  litmus-edge-sim  ──MQTT──▶ mqtt-broker ──▶ ingest ──▶ TimescaleDB ──▶ kg-sync ──▶ Neo4j
 (simulated)       Litmus payloads          (UNS topics)              (staging + time series)        │
                                                                         ▲                           ▼
                                                    CMMS export (CSV) ───┼─────────────────────▶  Streamlit app
```

| Service | Purdue zone | Role |
|---|---|---|
| `litmus-edge-sim` | L3 | Scenario engine. Publishes tag values in the Litmus Edge payload format, plus batch, phase, alarm and material events. Also exposes an OPC UA server (port 4840) acting as the PLC |
| `mqtt-broker` | L3.5 | Eclipse Mosquitto 2 |
| `ingest` | L3.5 | Writes MQTT messages to TimescaleDB idempotently and records topics that aren't in the master list |
| `timescaledb` | L3.5 | PostgreSQL 16 + TimescaleDB. Staging area and time-series store |
| `kg-sync` | L4 | Incremental, watermark-based sync into Neo4j with Cypher `MERGE` |
| `neo4j` | L4 | Neo4j 5.26 Community, the knowledge graph |
| `app` | L4 | Read-only Streamlit front end: traceability, fault analysis, maintenance and pipeline status tabs, querying Neo4j and TimescaleDB live |

### How the pipeline works

- **Unified Namespace.** MQTT topic paths mirror the ISA-88 physical model:
  `<enterprise>/<site>/<area>/pc01/r101/r101-temp/tt101/pv` (process cell / unit / equipment module / control module / tag).
- **Deterministic scenario.** `scenario.py` generates each batch from its batch number, so every restart produces the same
  data. It writes the golden story in: TT-101's TX-200 transmitter drifts, B-0400 and B-0406 raise HI warnings, B-0412
  raises HIHI, the device is replaced before B-0415. It also publishes one rogue topic (TT-305) that's commissioned in the
  field but missing from the master list, to test the review path.
- **Idempotent ingest.** Process values go to a TimescaleDB hypertable (`staging.process_value`, primary key `tag_id, time`,
  7-day chunks); events go to `staging.event` with a unique `event_id`. Both use `ON CONFLICT DO NOTHING`, so replaying the
  backfill never duplicates rows. Unknown topics land in `ops.unknown_topic` with first/last seen and a message count.
- **Watermark sync.** Every 10 s, `kg-sync` reads events with an id above the last watermark (`ops.sync_watermark`), applies
  one handler per event type (batch start/end, phase start/end, material consumed/produced, alarm) and advances the
  watermark. All writes are `MERGE`, so a cycle can safely be re-run. Master data (Engineering Master List, tag list,
  master recipes, CMMS export) is reloaded when the file changes.
- **Aggregates, not raw values.** When a phase run ends, the sync job queries min/max/avg/sample count per tag for that time
  window from TimescaleDB and stores them on a `(:PhaseRun)-[:MEASURED]->(:Tag)` relationship. The graph gets the context it
  needs for questions like "peak temperature per batch" without holding the raw time series.
- **Context enrichment.** Alarms are linked to the phase run that was active when they fired (`Alarm -[:DURING]-> PhaseRun`),
  preferring a run on the alarm's own equipment module and falling back to any run on the same unit. Work orders that
  reference an alarm get `-[:TRIGGERED_BY]->` links. Physical devices carry time-bounded `INSTALLED_AT` relationships, so
  the graph can say which serial number sat at TT-101 when each alarm fired.

### Design decisions (ADRs)

1. **Raw process values stay out of Neo4j.** Graph databases are built for traversing relationships, not for range-scanning
   millions of time-stamped points. TimescaleDB holds the raw data (in a real plant the site historian could take this
   role); the graph holds structure, events, aggregates and a reference from each tag to its series.
2. **The Engineering Master List owns the hierarchy.** The sync job could build the plant structure from incoming topic
   paths, but a typo in an edge configuration would then change the official equipment hierarchy, which isn't acceptable
   for a GMP-relevant record. Topics are checked against the list and unknown ones are flagged for review.
3. **Data flows one way, OT to IT, with no write-back.** The Compose networks (`ot_l3`, `dmz_l35`, `it_l4`) mirror the
   Purdue zones, and each service is only attached to the zones it may talk to. Insights such as "check TT-301" reach the
   plant through people and the CMMS, never as commands, so a wrong or compromised graph can't affect production.

### Real Litmus Edge mode

With `LITMUS=1`, the real **Litmus Edge 4.4 (Developer Edition, Docker)** takes over the tag data path. It reads tags from
the simulator's OPC UA server through DeviceHub (e.g. node `ns=2;s=TT101.PV`, 1 s polling) and forwards them over its
"MQTT - Generic" integration to topics under `litmus/`. Ingest matches those messages by tag name, ignoring case and
separators (`TT101.PV`, `TT101_PV` and `tt101-pv` all map to the same tag). Batch, phase, alarm and material events still
come from the simulator, which plays the role of the batch system and MES.

### Natural-language queries (experimental variant)

A separate copy of the stack adds an **"Ask the graph"** tab. A local LLM (gpt-oss:20b through Ollama, so nothing leaves
the machine) turns a question into one read-only Cypher query. The prompt includes the live graph schema, the ISA-88
vocabulary and seven verified example queries. The generated query is shown before its results, and three safeguards
apply: prompt rules, a keyword check that rejects write clauses, and a Neo4j READ transaction with a 15 s timeout. If
Neo4j rejects the query or it returns nothing, the model gets one repair attempt. gpt-oss:20b answered 8 of 8 held-out
questions correctly in 6–25 s; smaller models were faster but often wrong. The Claude API can be used instead of Ollama.

### Running the full stack

```bash
docker compose up -d --build
```

| What | URL |
|---|---|
| Streamlit app | http://localhost:8501 |
| Neo4j Browser | http://localhost:7474 |

On first start the simulator publishes the 30 historical batches, and after about a minute the sync job has built the
graph. `LIVE=1` adds new batches in real time at 60× speed. `docker compose down -v` resets everything.

### Why the hosted version is static

Running Neo4j, TimescaleDB, MQTT and four Python services just to show 30 batches would need paid always-on hosting.
`build_graph.py` reuses the same scenario and graph rules to produce an identical graph as JSON, and `src/kg.js`
implements the traversals in the browser. `graph.cypher` loads that same graph into a real Neo4j, and each page shows
the Cypher it stands in for, so the static app and the full stack stay in step.
