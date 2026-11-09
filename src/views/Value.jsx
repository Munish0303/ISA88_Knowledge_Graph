import { useCallback, useEffect, useState } from "react";
import { Q } from "../kg.js";
import { href } from "../ui.jsx";

// The B-0412 investigation, one question at a time. "systems" and "manualMin" describe how a plant
// without a graph answers it: hands-on minutes for an experienced engineer with access (an estimate).
// "run" answers the same question on the in-browser graph; its time is measured live.
const QUESTIONS = [
  {
    q: "Which raw-material lots went into B-0412?",
    systems: ["MES", "ERP"],
    how: "Batch record, then a lot lookup per material",
    manualMin: [5, 10],
    to: href("trace", { batch: "B-0412" }),
    run: (kg) => `${Q.upstream(kg, "B-0412").length} lots`,
  },
  {
    q: "Which later batches contain B-0412 material?",
    systems: ["ERP"],
    how: "Lot genealogy, one level at a time",
    manualMin: [10, 20],
    to: href("trace", { batch: "B-0412" }),
    run: (kg) => {
      const ids = [...new Set(Q.genealogy(kg, "B-0412", "down").flatMap((e) => e.to))].map((k) => k.split(":")[1]);
      return ids.length ? ids.sort().join(", ") : "none";
    },
  },
  {
    q: "What was running when the alarm fired?",
    systems: ["MES", "Alarm log"],
    how: "Match the alarm timestamp to the batch report",
    manualMin: [5, 10],
    to: href("trace", { batch: "B-0412" }),
    run: (kg) => {
      const hit = Q.phaseRuns(kg, "B-0412").find((r) => r.alarms.length);
      return hit ? `${hit.phase} on ${hit.equipment_module}` : "no alarm";
    },
  },
  {
    q: "Has TT-101 alarmed before, and on which device?",
    systems: ["Alarm log", "CMMS"],
    how: "Export 30 batches of alarms, join to install history",
    manualMin: [15, 30],
    to: href("fault", { cm: "TT101" }),
    run: (kg) => {
      const rows = Q.alarmHistory(kg, "TT101");
      return `${rows.length} alarms in ${new Set(rows.map((r) => r.batch)).size} batches`;
    },
  },
  {
    q: "Is TT-101 drifting from batch to batch?",
    systems: ["Historian"],
    how: "Export each batch, compare peaks in a spreadsheet",
    manualMin: [15, 30],
    to: href("fault", { cm: "TT101" }),
    run: (kg) => `peaks for ${new Set(Q.trend(kg, "TT101").map((r) => r.batch)).size} batches`,
  },
  {
    q: "Where else is model TX-200 installed?",
    systems: ["CMMS"],
    how: "Asset register plus work-order history per position",
    manualMin: [10, 20],
    to: href("maint", { model: "TX-200" }),
    run: (kg) => {
      const r = Q.recommendation(kg, "TX-200");
      return r.still.length ? `${r.still.map((s) => s.split(" ")[0]).join(", ")}, ${r.drifts} past drifts` : `${r.drifts} past drifts`;
    },
  },
];

const REPEATS = 25; // average over several runs so the timer resolution does not dominate
const SCALE_MIN = 30; // shared axis for the per-step bars

function measure(kg) {
  return QUESTIONS.map((x) => {
    let answer = "";
    const t0 = performance.now();
    for (let i = 0; i < REPEATS; i++) answer = x.run(kg);
    return { answer, ms: (performance.now() - t0) / REPEATS };
  });
}

const fmtMs = (v) => (v < 0.01 ? "<0.01 ms" : v < 1 ? `${v.toFixed(2)} ms` : `${v.toFixed(1)} ms`);

export default function Value({ kg }) {
  const [results, setResults] = useState(null);
  const run = useCallback(() => setResults(measure(kg)), [kg]);
  useEffect(() => { run(); }, [run]);

  const lo = QUESTIONS.reduce((s, x) => s + x.manualMin[0], 0);
  const hi = QUESTIONS.reduce((s, x) => s + x.manualMin[1], 0);
  const graphMs = results ? results.reduce((s, r) => s + r.ms, 0) : null;
  const hours = `${Math.round(lo / 60)}–${Math.round(hi / 60)} h`;

  return (
    <div className="v">
      <section className="v-hero">
        <div>
          <div className="v-eyebrow">Why a knowledge graph</div>
          <h2>One investigation, {hours} by hand. {graphMs != null && graphMs >= 1 ? "Milliseconds" : "Under a millisecond"} on the graph.</h2>
          <p>
            After the TT-101 alarm in B-0412, an engineer needs answers from five systems that don't talk to each other.
            The graph already holds the links between them, so each question is a single query.
          </p>
        </div>
        <Compare hours={hours} graphMs={graphMs} />
      </section>

      <section className="v-section">
        <div className="v-section-head">
          <div>
            <h3>The investigation, step by step</h3>
            <p>Manual: hands-on minutes for an engineer with access to every system. Graph: measured in your browser, average of {REPEATS} runs.</p>
          </div>
          <button className="btn small" onClick={run}>Run again</button>
        </div>

        <ol className="v-steps">
          <li className="v-steps-head" aria-hidden="true">
            <span />
            <span>Question</span>
            <span className="v-axis">
              {[0, 10, 20, 30].map((t) => <i key={t} style={{ left: `${(t / SCALE_MIN) * 100}%` }}>{t}{t === 30 ? " min" : ""}</i>)}
            </span>
            <span>Graph answer</span>
            <span className="r">Graph time</span>
          </li>
          {QUESTIONS.map((x, i) => {
            const r = results?.[i];
            const [a, b] = x.manualMin;
            return (
              <li key={x.q} className="v-step">
                <span className="v-n">{i + 1}</span>
                <div className="v-q">
                  <a href={x.to}>{x.q}</a>
                  <div className="v-how">
                    {x.systems.map((s) => <span key={s} className="v-sys">{s}</span>)}
                    <span>{x.how}</span>
                  </div>
                </div>
                <div className="v-bar" title={`Manual estimate: ${a}–${b} min`}>
                  <div className="v-track" aria-hidden="true">
                    <span className="v-lo" style={{ width: `${(a / SCALE_MIN) * 100}%` }} />
                    <span className="v-hi" style={{ width: `${((b - a) / SCALE_MIN) * 100}%` }} />
                  </div>
                  <span className="v-bar-label">{a}–{b} min</span>
                </div>
                <div className="v-answer">{r ? r.answer : "…"}</div>
                <div className="v-ms">{r ? fmtMs(r.ms) : "…"}</div>
              </li>
            );
          })}
          <li className="v-step v-total">
            <span />
            <div className="v-q"><b>Total</b><div className="v-how"><span>5 systems, plus waiting for exports from QA, IT or maintenance</span></div></div>
            <div className="v-bar"><span className="v-bar-label"><b>{hours}</b></span></div>
            <div className="v-answer" />
            <div className="v-ms"><b>{graphMs == null ? "…" : fmtMs(graphMs)}</b></div>
          </li>
        </ol>
      </section>

      <section className="v-section v-why">
        <h3>Why it's faster</h3>
        <div className="v-cols">
          <div>
            <h4>The links already exist</h4>
            <p>Lot genealogy, alarm context and device history are relationships the sync job writes once, instead of
              joins someone rebuilds from exports each time.</p>
            <code>(:Batch)-[:PRODUCED]-&gt;(:MaterialLot)&lt;-[:CONSUMED]-(:Batch)</code>
          </div>
          <div>
            <h4>Cross-system joins are one hop</h4>
            <p>"Which device was installed when this alarm fired?" needs the alarm log and the CMMS. In the graph it is a
              time-bounded relationship.</p>
            <code>(:PhysicalDevice)-[:INSTALLED_AT {"{from, to}"}]-&gt;(:ControlModule)</code>
          </div>
          <div>
            <h4>New questions, no new interface</h4>
            <p>Nobody planned to ask where else TX-200 is installed. Because devices, positions and work orders are
              connected, it is one more query, not a new report.</p>
            <code>(:PhysicalDevice {"{model: 'TX-200'}"})-[:INSTALLED_AT]-&gt;()</code>
          </div>
        </div>
      </section>

      <section className="v-section">
        <h3>What the speed buys</h3>
        <dl className="v-wins">
          <dt>Smaller, faster QA holds</dt>
          <dd>The affected lots (from B-0413 and B-0414) are known minutes after the deviation, so only they are held.{" "}
            <a href={href("trace", { batch: "B-0412" })}>Trace B-0412</a></dd>
          <dt>Recurring faults show up</dt>
          <dd>TT-101 warned twice before and was closed as "no fault". Across batches, the drift is plain, and TT-301 with
            the same model gets checked first. <a href={href("maint", { model: "TX-200" })}>See TX-200</a></dd>
          <dt>Knowledge stays with the plant</dt>
          <dd>What sits where and what happened last time is in the graph, not only in one engineer's head.</dd>
          <dt>Answers you can repeat</dt>
          <dd>Each answer is a query over the same data, with the Cypher shown on every page, not a one-off spreadsheet.</dd>
        </dl>
      </section>

      <p className="v-note">
        Manual times are conservative estimates of hands-on work, not measurements, and leave out waiting for other teams.
        Graph times are measured on this simulated graph ({kg.nodes.size} nodes, {kg.rels.length} relationships). Neo4j
        traversals stay fast at production scale because they only touch connected data.
      </p>
    </div>
  );
}

// Both totals on one linear scale: the graph bar is too small to draw, which is the point.
function Compare({ hours, graphMs }) {
  return (
    <div className="v-compare" role="img"
      aria-label={`By hand: ${hours}. Knowledge graph: ${graphMs == null ? "measuring" : fmtMs(graphMs)}.`}>
      <div className="v-cmp-row">
        <div className="v-cmp-label">By hand · 5 systems</div>
        <div className="v-cmp-value">{hours}</div>
        <div className="v-cmp-track"><span className="v-cmp-manual" /></div>
      </div>
      <div className="v-cmp-row">
        <div className="v-cmp-label">Knowledge graph</div>
        <div className="v-cmp-value v-accent">{graphMs == null ? "…" : fmtMs(graphMs)}</div>
        <div className="v-cmp-track"><span className="v-cmp-graph" /></div>
      </div>
      <div className="v-cmp-foot">
        Both bars use the same scale. The graph bar is far thinner than a pixel, so it is drawn 2px wide.
      </div>
    </div>
  );
}
