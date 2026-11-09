import { useCallback, useEffect, useState } from "react";
import { Q } from "../kg.js";
import { Callout, Stat, Table, href } from "../ui.jsx";

// The B-0412 investigation, one question at a time. "manual" is how a plant without a graph
// typically answers it: which systems someone opens and an estimated effort (an assumption, not a measurement).
// "run" answers the same question on the in-browser graph; its time is measured live.
const QUESTIONS = [
  {
    q: "Which raw-material lots went into B-0412?",
    systems: "MES batch record → ERP lot lookup",
    manualMin: [5, 10],
    to: href("trace", { batch: "B-0412" }),
    run: (kg) => { const r = Q.upstream(kg, "B-0412"); return `${r.length} lots`; },
  },
  {
    q: "Which later batches and lots contain B-0412 material (all levels)?",
    systems: "ERP lot genealogy, lot by lot, level by level",
    manualMin: [10, 20],
    to: href("trace", { batch: "B-0412" }),
    run: (kg) => {
      const batches = new Set(Q.genealogy(kg, "B-0412", "down").flatMap((e) => e.to));
      return `${batches.size} downstream batches`;
    },
  },
  {
    q: "Which phase was running, on which equipment, when the alarm fired?",
    systems: "Batch report + alarm/event log, matched by timestamp",
    manualMin: [5, 10],
    to: href("trace", { batch: "B-0412" }),
    run: (kg) => {
      const runs = Q.phaseRuns(kg, "B-0412");
      const hit = runs.find((r) => r.alarms.length);
      return hit ? `${hit.phase} on ${hit.equipment_module}` : `${runs.length} phase runs`;
    },
  },
  {
    q: "Has TT-101 alarmed before, in which batches, and which device was installed each time?",
    systems: "Alarm log export (30 batches) + CMMS install history",
    manualMin: [15, 30],
    to: href("fault", { cm: "TT101" }),
    run: (kg) => {
      const rows = Q.alarmHistory(kg, "TT101");
      return `${rows.length} alarms in ${new Set(rows.map((r) => r.batch)).size} batches`;
    },
  },
  {
    q: "Is TT-101 drifting? Peak temperature per batch, across all batches",
    systems: "Historian export per batch, combined in a spreadsheet",
    manualMin: [15, 30],
    to: href("fault", { cm: "TT101" }),
    run: (kg) => {
      const rows = Q.trend(kg, "TT101");
      return `${new Set(rows.map((r) => r.batch)).size} batches compared`;
    },
  },
  {
    q: "Where else is transmitter model TX-200 installed, and has it drifted there?",
    systems: "CMMS asset register + work-order history",
    manualMin: [10, 20],
    to: href("maint", { model: "TX-200" }),
    run: (kg) => {
      const r = Q.recommendation(kg, "TX-200");
      return r.still.length ? `check ${r.still.join(", ")}` : `${r.drifts} drift work orders`;
    },
  },
];

const REPEATS = 25; // average over several runs so the timer resolution does not dominate

function measure(kg) {
  return QUESTIONS.map((x) => {
    let answer = "";
    const t0 = performance.now();
    for (let i = 0; i < REPEATS; i++) answer = x.run(kg);
    return { answer, ms: (performance.now() - t0) / REPEATS };
  });
}

const fmtMs = (v) => (v < 1 ? `${v.toFixed(2)} ms` : `${v.toFixed(1)} ms`);
const fmtRange = ([a, b]) => (a >= 60 ? `${a / 60}–${b / 60} h` : `${a}–${b} min`);

export default function Value({ kg }) {
  const [results, setResults] = useState(null);
  const run = useCallback(() => setResults(measure(kg)), [kg]);
  useEffect(() => { run(); }, [run]);

  const lo = QUESTIONS.reduce((s, x) => s + x.manualMin[0], 0);
  const hi = QUESTIONS.reduce((s, x) => s + x.manualMin[1], 0);
  const graphMs = results ? results.reduce((s, r) => s + r.ms, 0) : null;

  const rows = QUESTIONS.map((x, i) => ({
    ...x, manual: fmtRange(x.manualMin), answer: results?.[i].answer, ms: results?.[i].ms,
  }));

  return (
    <>
      <div className="page-head">
        <h2>Why a knowledge graph: from hours to seconds</h2>
        <p>
          In most plants the answer to a cross-batch question is spread over five or more systems: batch records in the MES,
          lot genealogy in the ERP, raw values in the historian, alarms in an event log and device history in the CMMS.
          Someone has to export, match timestamps and join it all by hand. The graph stores those links once, so the
          same question becomes a traversal that runs in milliseconds.
        </p>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Systems joined" value="5 (MES · ERP · historian · alarms · CMMS)" />
        <Stat label="Batches searched" value={`${kg.byLabel("Batch").length}`} />
        <Stat label="Manual, hands-on (estimate)" value={`${(lo / 60).toFixed(0)}–${(hi / 60).toFixed(0)} hours`} />
        <Stat label="Graph, measured in your browser" value={graphMs == null ? "…" : fmtMs(graphMs)} />
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>The B-0412 investigation, timed</h3>
            <p className="hint" style={{ margin: 0 }}>
              The six questions an engineer asks after the TT-101 HIHI alarm in B-0412. Manual times assume an experienced
              engineer who already has access to every system. Each graph time is the average of {REPEATS} runs on this page.
            </p>
          </div>
          <button className="btn primary" onClick={run}>Run again</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <Table rows={rows} columns={[
            { key: "q", label: "question", render: (r) => <a className="link" href={r.to}>{r.q}</a> },
            { key: "systems", label: "without a graph" },
            { key: "manual", label: "manual (est.)", num: true },
            { key: "answer", label: "graph answer" },
            { key: "ms", label: "graph time", num: true, render: (r) => (r.ms == null ? null : fmtMs(r.ms)) },
          ]} />
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          Total: about <b>{(lo / 60).toFixed(0)}–{(hi / 60).toFixed(0)} hours</b> of hands-on work versus{" "}
          <b>{graphMs == null ? "…" : fmtMs(graphMs)}</b> on the graph. Elapsed time is often longer, because exports and
          records have to be requested from QA, IT or maintenance. The slowest steps are the ones no single system can
          answer, such as which device was installed when an alarm fired.
        </p>
      </div>

      <h3 style={{ margin: "24px 0 12px" }}>Where the time goes, and what the graph changes</h3>
      <div className="grid g3">
        <div className="card">
          <h3>Links are stored, not rebuilt</h3>
          <p className="hint">
            Without a graph, "batch → lot → next batch" or "alarm → phase run → device installed at that moment" is
            rebuilt from exports every time. In the graph these are relationships (CONSUMED, PRODUCED, DURING,
            INSTALLED_AT), written once by the sync job.
          </p>
        </div>
        <div className="card">
          <h3>Multi-hop questions stay cheap</h3>
          <p className="hint">
            A traversal only touches the nodes connected to the starting point. Forward genealogy over several levels
            costs about the same as one level, whereas the manual route costs one more round of lookups per level.
          </p>
        </div>
        <div className="card">
          <h3>New questions need no new integration</h3>
          <p className="hint">
            "Where else is this model installed?" was not planned up front. Because devices, positions and work orders
            are already connected, it is one more query, not a new report or interface between two systems.
          </p>
        </div>
      </div>

      <h3 style={{ margin: "24px 0 12px" }}>Value beyond speed</h3>
      <div className="grid g2">
        <div className="card">
          <h3>Smaller, faster QA holds</h3>
          <p className="hint">
            Exact genealogy names the affected lots (here B-0413 and B-0414) within seconds of a deviation, so product
            can be held before it ships and nothing else has to be blocked "to be safe".
          </p>
        </div>
        <div className="card">
          <h3>Recurring faults become visible</h3>
          <p className="hint">
            TT-101 warned in B-0400 and B-0406 and was closed as "no fault". Linking alarms, devices and work orders across
            batches shows the drift, and points to TT-301 with the same model before it causes a deviation.
          </p>
        </div>
        <div className="card">
          <h3>Knowledge that stays with the plant</h3>
          <p className="hint">
            The connections an experienced engineer keeps in their head (which device sits where, what was replaced, what
            happened last time) are in the graph, so new staff and other shifts can ask the same questions.
          </p>
        </div>
        <div className="card">
          <h3>Audit-ready answers</h3>
          <p className="hint">
            Each answer is a reproducible query (the Cypher is shown on every page) over the same data, instead of a
            spreadsheet assembled once by hand.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Callout tone="info">
          <b>About the numbers:</b> the manual times are conservative estimates of hands-on work for a plant where these
          records sit in separate systems, assuming the engineer knows the tools and has access. They are not measured, and
          they leave out waiting for exports or other teams. The graph times are measured live on this simulated graph
          ({kg.nodes.size} nodes, {kg.rels.length} relationships). A production graph is much larger, but index-backed
          traversals in Neo4j typically stay in the millisecond-to-second range because they only touch connected data.
        </Callout>
      </div>
    </>
  );
}
