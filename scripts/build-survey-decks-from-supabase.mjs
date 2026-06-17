#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SURVEY_DIR = path.join(ROOT, "docs", "Surveys");

const BRAND = {
  cream: "#F5F5F5",
  orange: "#FF6B00",
  green: "#00AB69",
  teal: "#0092B3",
  ink: "#2F2D2D",
  black: "#151515",
};

function answerToString(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(answerToString).filter(Boolean).join("|");
  if (typeof value === "object") {
    return String(value.label ?? value.value ?? value.text ?? JSON.stringify(value));
  }
  return String(value);
}

function extractQuestions(resultsJsonb) {
  const root = resultsJsonb ?? {};
  const submission = root.submission ?? root.raw_payload?.submission ?? root.raw_payload ?? root;
  return Array.isArray(submission.questions) ? submission.questions : [];
}

function parseRows(rows) {
  return rows.map((row) => {
    const answers = new Map();
    for (const q of extractQuestions(row.results_jsonb)) {
      answers.set(q.name || q.id, answerToString(q.value));
    }
    return { ...row, answers };
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function titleCase(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getAnswer(row, question) {
  return row.answers.get(question) ?? "";
}

function numeric(row, question) {
  const n = Number(getAnswer(row, question));
  return Number.isFinite(n) ? n : null;
}

function numberFmt(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function pct(value, total) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function avg(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function ratingSummary(rows, question) {
  const counts = new Map([[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
  for (const row of rows) {
    const value = numeric(row, question);
    if (value >= 1 && value <= 5) counts.set(value, counts.get(value) + 1);
  }
  const values = rows.map((row) => numeric(row, question));
  const total = Array.from(counts.values()).reduce((sum, n) => sum + n, 0);
  return {
    question,
    counts,
    total,
    average: avg(values),
    favorable: (counts.get(4) ?? 0) + (counts.get(5) ?? 0),
  };
}

function choiceCounts(rows, question) {
  const counts = new Map();
  for (const row of rows) {
    const answer = getAnswer(row, question);
    if (!answer) continue;
    for (const part of answer.split("|").map((p) => p.trim()).filter(Boolean)) {
      counts.set(part, (counts.get(part) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function freeAnswers(rows, question) {
  return rows
    .map((row) => getAnswer(row, question).trim())
    .filter((answer) => answer && !/^n[\/_ -]?a$/i.test(answer) && !/^none$/i.test(answer));
}

function themeCounts(answers, themes) {
  return themes
    .map((theme) => {
      const count = answers.filter((answer) => {
        const text = answer.toLowerCase();
        return theme.keywords.some((keyword) => text.includes(keyword));
      }).length;
      return { label: theme.label, value: count };
    })
    .filter((theme) => theme.value > 0)
    .sort((a, b) => b.value - a.value);
}

function quote(answers, keywords = []) {
  const clean = answers
    .map((answer) => answer.replace(/\s+/g, " ").trim())
    .filter((answer) => answer.length >= 20);
  const keyed = clean.find((answer) => keywords.some((keyword) => answer.toLowerCase().includes(keyword)));
  const selected = keyed ?? clean.sort((a, b) => b.length - a.length)[0] ?? "";
  return selected.length > 210 ? `${selected.slice(0, 207).trim()}...` : selected;
}

function sourceWindow(rows) {
  const dates = rows.map((row) => new Date(row.submitted_at)).filter((date) => !Number.isNaN(date.valueOf()));
  if (!dates.length) return "";
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${format.format(min)} to ${format.format(max)}`;
}

function stat(label, value, note = "") {
  return `<div class="stat"><div class="stat-value">${escapeHtml(value)}</div><div class="stat-label">${escapeHtml(label)}</div>${note ? `<div class="stat-note">${escapeHtml(note)}</div>` : ""}</div>`;
}

function noteCard(title, body) {
  return `<div class="note-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div>`;
}

function quoteCard(text, label = "Respondent voice") {
  return `<figure class="quote-card"><blockquote>${escapeHtml(text)}</blockquote><figcaption>${escapeHtml(label)}</figcaption></figure>`;
}

function rankedList(items, total, limit = 6) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return `<div class="ranked-list">${items.slice(0, limit).map((item, index) => `
    <div class="rank-row">
      <div class="rank-num">${String(index + 1).padStart(2, "0")}</div>
      <div class="rank-main">
        <div class="rank-label">${escapeHtml(item.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(5, (item.value / max) * 100).toFixed(1)}%"></div></div>
      </div>
      <div class="rank-value">${item.value}<span>${pct(item.value, total)}</span></div>
    </div>`).join("")}</div>`;
}

function scaleChart(summaries) {
  const colors = {
    1: "var(--ink)",
    2: "rgba(47,45,45,.48)",
    3: "var(--teal)",
    4: "var(--green)",
    5: "var(--orange)",
  };
  return `<div class="scale-chart">
    <div class="legend">
      ${[1, 2, 3, 4, 5].map((n) => `<span><i style="background:${colors[n]}"></i>${n}</span>`).join("")}
    </div>
    ${summaries.map((summary) => {
      const label = summary.question
        .replace("Likely to Participate Next Year", "Participate next year")
        .replace("Inspires Me to Continue Learning", "Continue learning")
        .replace("Better Understanding of Cyber", "Understanding cyber")
        .replace("Interested in a Cyber Career", "Cyber career interest")
        .replace("Weekly Training Sessions and Recordings", "Weekly training");
      return `<div class="scale-row">
        <div class="scale-top"><strong>${escapeHtml(label)}</strong><span>${summary.average?.toFixed(1) ?? "-"} avg | ${pct(summary.favorable, summary.total)} 4-5</span></div>
        <div class="stacked-bar" aria-label="${escapeHtml(summary.question)}">
          ${[1, 2, 3, 4, 5].map((n) => {
            const value = summary.counts.get(n) ?? 0;
            if (!value) return "";
            const width = Math.max(2, (value / summary.total) * 100);
            return `<div class="segment" style="width:${width.toFixed(1)}%;background:${colors[n]}"><span>${value}</span></div>`;
          }).join("")}
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

function yesNoGrid(items, total) {
  return `<div class="yes-grid">${items.map((item) => `
    <div class="yes-card">
      <div class="yes-label">${escapeHtml(item.label)}</div>
      <div class="yes-value">${pct(item.yes, total)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(item.yes / total * 100).toFixed(1)}%"></div></div>
      <div class="yes-note">${item.yes} yes / ${total - item.yes} no</div>
    </div>`).join("")}</div>`;
}

function miniLogo() {
  return `<div class="cmcc-mark"><span class="mark-state"></span><span><b>California Mayors</b><em>Cyber Cup</em></span></div>`;
}

function slide(kind, eyebrow, title, body, options = {}) {
  const classes = ["slide", kind, options.className].filter(Boolean).join(" ");
  return `<section class="${classes}">
    <div class="slide-rule"></div>
    <header class="slide-head">
      <div>${miniLogo()}<div class="eyebrow">${escapeHtml(eyebrow)}</div></div>
      <div class="slide-kicker">${escapeHtml(options.kicker ?? "2026 post-event survey")}</div>
    </header>
    <main class="slide-body">${title ? `<h1>${title}</h1>` : ""}${body}</main>
    <footer class="slide-foot"><span>${escapeHtml(options.footer ?? "Survey results from live survey_results table")}</span><span>${escapeHtml(options.page ?? "")}</span></footer>
  </section>`;
}

function metricPair(title, left, right) {
  return `<div class="metric-pair"><h3>${escapeHtml(title)}</h3><div>${left}${right}</div></div>`;
}

function buildHtml(title, slides) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet" />
    <style>
      :root {
        --cream: ${BRAND.cream};
        --orange: ${BRAND.orange};
        --green: ${BRAND.green};
        --teal: ${BRAND.teal};
        --ink: ${BRAND.ink};
        --black: ${BRAND.black};
        --muted: rgba(47,45,45,.66);
        --line: rgba(47,45,45,.14);
        --shadow: 0 18px 40px rgba(21,21,21,.16);
      }
      * { box-sizing: border-box; }
      html, body { margin:0; height:100%; overflow:hidden; background:var(--cream); color:var(--ink); }
      body { font-family:"Inter", Arial, Helvetica, sans-serif; }
      .deck { width:100vw; height:100vh; position:relative; }
      .slide { position:absolute; inset:0; display:none; flex-direction:column; padding:34px 46px 30px; overflow:hidden; background:var(--cream); }
      .slide.active { display:flex; }
      .slide:first-child { display:flex; }
      .slide::before {
        content:""; position:absolute; inset:auto -160px -330px auto; width:720px; height:720px; border-radius:50%;
        border:52px solid rgba(0,146,179,.13); outline:18px solid rgba(0,171,105,.15); z-index:0;
      }
      .slide.cover::after, .slide.chapter::after {
        content:""; position:absolute; right:-120px; top:-160px; width:500px; height:500px; background:var(--orange);
        border-radius:50%; z-index:0;
      }
      .slide.cover, .slide.chapter { background:var(--black); color:var(--cream); }
      .slide.cover::before, .slide.chapter::before { border-color:rgba(0,171,105,.38); outline-color:rgba(0,146,179,.32); }
      .slide.green { background:var(--green); color:#fff; }
      .slide.teal { background:var(--teal); color:#fff; }
      .slide.orange { background:var(--orange); color:#fff; }
      .slide-rule { position:absolute; left:0; top:0; bottom:0; width:18px; background:linear-gradient(var(--teal), var(--green) 58%, var(--orange)); z-index:2; }
      .slide-head, .slide-foot, .slide-body { position:relative; z-index:1; }
      .slide-head { display:flex; justify-content:space-between; align-items:flex-start; min-height:72px; }
      .slide-foot { margin-top:auto; display:flex; justify-content:space-between; gap:20px; color:var(--muted); font:700 11px/1 "Rajdhani", Arial, sans-serif; letter-spacing:.11em; text-transform:uppercase; }
      .cover .slide-foot, .chapter .slide-foot, .green .slide-foot, .teal .slide-foot, .orange .slide-foot { color:rgba(255,255,255,.72); }
      .cmcc-mark { display:flex; gap:10px; align-items:center; font-family:"Rajdhani", Arial, sans-serif; text-transform:uppercase; letter-spacing:.03em; line-height:.95; }
      .cmcc-mark b, .cmcc-mark em { display:block; font-style:normal; font-weight:700; }
      .cmcc-mark b { color:var(--teal); }
      .cmcc-mark em { color:var(--green); }
      .cover .cmcc-mark b, .chapter .cmcc-mark b { color:var(--teal); }
      .cover .cmcc-mark em, .chapter .cmcc-mark em { color:var(--green); }
      .mark-state { width:28px; height:34px; display:block; background:linear-gradient(135deg, var(--green) 0 56%, var(--orange) 57% 100%); clip-path:polygon(18% 0, 76% 0, 76% 50%, 100% 72%, 90% 100%, 35% 92%, 18% 55%); border:2px solid currentColor; }
      .eyebrow, .slide-kicker { margin-top:10px; font:700 13px/1 "Rajdhani", Arial, sans-serif; letter-spacing:.17em; text-transform:uppercase; color:var(--orange); }
      .slide-kicker { margin:0; color:var(--muted); text-align:right; }
      .cover .slide-kicker, .chapter .slide-kicker, .green .slide-kicker, .teal .slide-kicker, .orange .slide-kicker { color:rgba(255,255,255,.72); }
      .slide-body { flex:1; display:flex; flex-direction:column; justify-content:center; gap:22px; }
      h1 { margin:0; max-width:1050px; font:700 58px/.9 "Rajdhani", Arial, sans-serif; letter-spacing:0; text-transform:uppercase; }
      .cover h1 { font-size:80px; max-width:820px; }
      .chapter h1 { font-size:78px; max-width:1000px; }
      h1 .accent { color:var(--orange); }
      p { margin:0; font-size:22px; line-height:1.35; color:rgba(47,45,45,.82); }
      .cover p, .chapter p, .green p, .teal p, .orange p { color:rgba(255,255,255,.86); }
      .lede { max-width:820px; font-size:24px; line-height:1.28; font-weight:650; }
      .grid { display:grid; gap:18px; }
      .cols-2 { grid-template-columns:1.1fr .9fr; align-items:stretch; }
      .cols-3 { grid-template-columns:repeat(3, 1fr); }
      .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
      .stat, .note-card, .quote-card, .metric-pair, .yes-card {
        background:#fff; border:1px solid var(--line); box-shadow:var(--shadow); border-radius:8px; padding:20px;
      }
      .cover .stat, .chapter .stat, .green .stat, .teal .stat, .orange .stat,
      .cover .note-card, .chapter .note-card, .green .note-card, .teal .note-card, .orange .note-card,
      .cover .quote-card, .chapter .quote-card, .green .quote-card, .teal .quote-card, .orange .quote-card {
        background:rgba(245,245,245,.94); color:var(--ink);
      }
      .stat-value { font:700 48px/.85 "Rajdhani", Arial, sans-serif; color:var(--orange); letter-spacing:0; }
      .stat-label { margin-top:8px; font-size:15px; font-weight:850; text-transform:uppercase; letter-spacing:.04em; }
      .stat-note { margin-top:8px; color:var(--muted); font-size:13px; line-height:1.25; }
      .note-card h3, .metric-pair h3 { margin:0 0 9px; font:700 24px/.95 "Rajdhani", Arial, sans-serif; text-transform:uppercase; color:var(--teal); }
      .note-card p { font-size:18px; }
      .quote-card { margin:0; border-left:8px solid var(--orange); }
      blockquote { margin:0; font-size:24px; line-height:1.28; font-weight:750; }
      figcaption { margin-top:14px; font:700 12px/1 "Rajdhani", Arial, sans-serif; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
      .ranked-list { display:grid; gap:11px; }
      .rank-row { display:grid; grid-template-columns:42px 1fr 76px; gap:12px; align-items:center; }
      .rank-num { font:700 22px/.9 "Rajdhani", Arial, sans-serif; color:var(--orange); }
      .rank-label { font-size:16px; font-weight:800; margin-bottom:6px; }
      .rank-value { text-align:right; font:700 24px/.9 "Rajdhani", Arial, sans-serif; }
      .rank-value span { display:block; margin-top:4px; color:var(--muted); font-size:12px; }
      .bar-track { width:100%; height:12px; background:rgba(47,45,45,.12); border-radius:99px; overflow:hidden; }
      .bar-fill { height:100%; background:linear-gradient(90deg, var(--green), var(--teal), var(--orange)); border-radius:99px; }
      .scale-chart { background:#fff; border:1px solid var(--line); border-radius:8px; padding:18px; box-shadow:var(--shadow); display:grid; gap:12px; }
      .legend { display:flex; justify-content:flex-end; gap:14px; font:700 12px/1 "Rajdhani", Arial, sans-serif; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
      .legend span { display:inline-flex; align-items:center; gap:5px; }
      .legend i { width:13px; height:13px; border-radius:2px; display:inline-block; }
      .scale-row { display:grid; gap:6px; }
      .scale-top { display:flex; justify-content:space-between; gap:12px; font-size:15px; }
      .scale-top span { color:var(--muted); font-weight:800; }
      .stacked-bar { height:32px; display:flex; overflow:hidden; border-radius:4px; background:rgba(47,45,45,.1); }
      .segment { height:100%; display:flex; align-items:center; justify-content:center; color:#fff; font:800 13px/1 "Inter", Arial, sans-serif; min-width:18px; }
      .segment span { text-shadow:0 1px 2px rgba(0,0,0,.35); }
      .yes-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
      .yes-label { font:700 24px/.95 "Rajdhani", Arial, sans-serif; text-transform:uppercase; color:var(--teal); }
      .yes-value { margin:12px 0 8px; font:700 62px/.8 "Rajdhani", Arial, sans-serif; color:var(--orange); }
      .yes-note { margin-top:8px; color:var(--muted); font-weight:750; font-size:13px; }
      .metric-pair > div { display:grid; grid-template-columns:1fr 1fr; gap:13px; }
      .chips { display:flex; flex-wrap:wrap; gap:10px; }
      .chip { background:var(--ink); color:#fff; padding:9px 12px; border-radius:4px; font:800 14px/1 "Rajdhani", Arial, sans-serif; text-transform:uppercase; letter-spacing:.04em; }
      .chapter-num { font:700 170px/.75 "Rajdhani", Arial, sans-serif; color:var(--orange); opacity:.95; }
      .takeaway { display:grid; grid-template-columns:160px 1fr; gap:28px; align-items:center; }
      .takeaway h2 { margin:0; font:700 30px/.95 "Rajdhani", Arial, sans-serif; text-transform:uppercase; color:var(--orange); }
      .takeaway p { font-size:28px; font-weight:780; }
      .split-title { display:grid; grid-template-columns:.86fr 1.14fr; gap:24px; align-items:center; }
      .callout { padding:24px; border-radius:8px; color:#fff; background:linear-gradient(135deg,var(--teal),var(--green)); box-shadow:var(--shadow); }
      .callout strong { display:block; font:700 40px/.9 "Rajdhani", Arial, sans-serif; text-transform:uppercase; color:#fff; }
      .callout span { display:block; margin-top:10px; font-size:18px; line-height:1.35; color:rgba(255,255,255,.88); }
      .nav { position:fixed; right:20px; bottom:18px; z-index:20; display:flex; gap:8px; }
      .nav button { border:0; background:var(--ink); color:#fff; width:38px; height:32px; border-radius:4px; font-weight:900; }
      @media print { .nav { display:none; } .slide { page-break-after:always; } }
    </style>
  </head>
  <body>
    <div class="deck">${slides.join("\n")}</div>
    <div class="nav"><button id="prev">‹</button><button id="next">›</button></div>
    <script>
      const slides = [...document.querySelectorAll(".slide")];
      let current = 0;
      function show(index) {
        current = Math.max(0, Math.min(slides.length - 1, index));
        slides.forEach((slide, i) => slide.classList.toggle("active", i === current));
      }
      document.getElementById("prev").onclick = () => show(current - 1);
      document.getElementById("next").onclick = () => show(current + 1);
      window.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" || event.key === " ") show(current + 1);
        if (event.key === "ArrowLeft") show(current - 1);
      });
      show(0);
    </script>
  </body>
</html>
`;
}

function buildCoachDeck(coachRows) {
  const n = coachRows.length;
  const window = sourceWindow(coachRows);
  const students = coachRows.reduce((sum, row) => sum + (numeric(row, "Number of Students") ?? 0), 0);
  const experience = ratingSummary(coachRows, "Mayors Cup Experience");
  const curriculum = choiceCounts(coachRows, "Cyber Curriculum");
  const teaching = choiceCounts(coachRows, "Teaching Cyber");
  const competition = choiceCounts(coachRows, "Competition Experience");
  const valueAnswers = freeAnswers(coachRows, "Value to Your Students");
  const dashboardAnswers = freeAnswers(coachRows, "Coaches Dashboard");
  const trainingAnswers = freeAnswers(coachRows, "Training During School Day");
  const improvements = freeAnswers(coachRows, "Improvements");
  const gaps = freeAnswers(coachRows, "Gaps");
  const employer = freeAnswers(coachRows, "Employer Engagement");
  const collaboration = freeAnswers(coachRows, "Improve Collaboration");
  const support = freeAnswers(coachRows, "Support");
  const impact = freeAnswers(coachRows, "Impact");
  const skills = freeAnswers(coachRows, "Skills");

  const slides = [
    slide("cover", "Coach survey", `<span class="accent">Coach</span><br/>post-event readout`, `
      <p class="lede">Current live survey data shows strong program value, but coaches still need more structured practice pathways, tighter day-of pacing, and clearer employer connections.</p>
      <div class="stats">${stat("coach responses", n, window)}${stat("students represented", numberFmt(students), "self-reported by coaches")}${stat("experience score", `${experience.average?.toFixed(1)}/5`, `${pct(experience.favorable, experience.total)} rated 4-5`)}</div>
    `),
    slide("standard", "Executive read", "The coach signal is positive, practical, and implementation-heavy.", `
      <div class="grid cols-3">
        ${noteCard("Value is real", "Coaches cite competition, belonging, resume value, and applied cyber work as the clearest student benefits.")}
        ${noteCard("Training wants structure", "Requests cluster around walkthroughs, tutorials, certifications, and practice that can fit school schedules.")}
        ${noteCard("Game day improved", "The new point system is specifically praised, while pacing and post-competition downtime still need design work.")}
      </div>
      <div class="stats">${stat("4+ year competitors", competition.find((c) => c.label === "4+ years")?.value ?? 0, "coach-reported competition history")}${stat("long-answer comments", valueAnswers.length + trainingAnswers.length + improvements.length + gaps.length + employer.length + collaboration.length + dashboardAnswers.length + support.length, "usable qualitative inputs")}${stat("top rating", experience.counts.get(5) ?? 0, "gave the event a 5")}</div>
    `),
    slide("standard", "Coach context", "The coach base mixes classroom, club, and dedicated cyber delivery.", `
      <div class="grid cols-2">
        ${metricPair("Where cyber happens", rankedList(curriculum, n, 5), rankedList(teaching, n, 5))}
        ${metricPair("Competition maturity", rankedList(competition, n, 5), `${quoteCard(quote(valueAnswers, ["resume", "belonging", "competition"]), "Coach value comment")}`)}
      </div>
    `),
    slide("green", "Program value", "Coaches see the cup as a motivator that turns cybersecurity into a lived experience.", `
      <div class="grid cols-2">
        ${quoteCard(quote(valueAnswers, ["metactf", "competition", "resume"]), "What coaches value")}
        ${quoteCard(quote(impact, ["csu", "competition", "ctf", "career"]), "Student impact")}
      </div>
    `),
    slide("standard", "Skills transfer", "The value proposition is broader than cyber facts.", `
      <div class="grid cols-2">
        ${rankedList(themeCounts(skills.concat(valueAnswers), [
          { label: "Teamwork and collaboration", keywords: ["team", "collaboration", "belonging"] },
          { label: "Problem solving", keywords: ["problem", "logic", "solve"] },
          { label: "Career readiness", keywords: ["resume", "job", "career", "industry"] },
          { label: "Hands-on cyber skills", keywords: ["cyber", "ctf", "pentest", "security"] },
        ]), n, 6)}
        ${quoteCard(quote(skills, ["team", "problem", "time"]), "Skills coaches name")}
      </div>
    `),
    slide("teal", "Coach dashboard", "The dashboard is usable and better received than prior systems, with communication volume as the remaining watch item.", `
      <div class="grid cols-2">
        ${quoteCard(quote(dashboardAnswers, ["better", "fantastic", "simple"]), "Coach dashboard")}
        ${noteCard("Design implication", "Keep the dashboard as the operating hub, but add a next-action layer so messages, deadlines, and resources are easier to triage.")}
      </div>
    `),
    slide("standard", "Training during school", "Daytime delivery is not equally feasible across programs.", `
      <div class="grid cols-2">
        ${rankedList(themeCounts(trainingAnswers, [
          { label: "Tutorials and walkthroughs", keywords: ["tutorial", "walkthrough", "specific", "beginner"] },
          { label: "Schedule constraints", keywords: ["not an option", "school day", "club", "ctso", "after"] },
          { label: "More practice", keywords: ["practice", "training", "recording"] },
          { label: "Curriculum alignment", keywords: ["course", "curriculum", "class"] },
        ]), n, 6)}
        ${quoteCard(quote(trainingAnswers, ["school day", "walkthrough", "tutorial"]), "Training constraint")}
      </div>
    `),
    slide("standard", "Game-day improvements", "The new scoring model should stay; the event arc needs tighter pacing.", `
      <div class="grid cols-2">
        ${quoteCard(quote(improvements, ["point system", "game day", "fireside"]), "Coach improvement comment")}
        ${noteCard("Operating move", "Keep the revised point system, shorten the gap after competition, and give finalists/non-finalists a parallel structured activity.")}
      </div>
    `),
    slide("orange", "Curriculum gaps", "The unmet need is not enthusiasm. It is skill scaffolding.", `
      <div class="grid cols-2">
        ${rankedList(themeCounts(gaps.concat(support), [
          { label: "Hands-on labs and practice", keywords: ["practice", "lab", "tutorial"] },
          { label: "Pen testing and CTF logic", keywords: ["pen", "ctf", "logic", "figure"] },
          { label: "Certification alignment", keywords: ["certification", "comptia", "security+"] },
          { label: "Introductory curriculum", keywords: ["beginner", "basic", "ap"] },
        ]), n, 6)}
        ${quoteCard(quote(gaps.concat(support), ["pen", "tutorial", "certification"]), "Gap / support request")}
      </div>
    `),
    slide("standard", "Employer engagement", "Coaches ask for concrete exposure, not abstract partnership language.", `
      <div class="grid cols-2">
        ${rankedList(themeCounts(employer.concat(collaboration), [
          { label: "Internships and apprenticeships", keywords: ["internship", "apprentice"] },
          { label: "Guest speakers", keywords: ["guest", "speaker", "lecture"] },
          { label: "Career days and field trips", keywords: ["career", "field trip", "tour"] },
          { label: "Virtual access", keywords: ["virtual", "remote"] },
        ]), n, 6)}
        ${quoteCard(quote(employer.concat(collaboration), ["apprentice", "guest", "internship"]), "Employer engagement")}
      </div>
    `),
    slide("chapter", "The coach ask", `<span class="accent">Three</span><br/>moves for next year`, `
      <div class="grid cols-3">
        ${noteCard("Practice ladder", "Publish beginner-to-advanced tracks with walkthroughs, labs, and recorded explanations.")}
        ${noteCard("Cleaner event rhythm", "Preserve the scoring model and redesign the post-competition wait period.")}
        ${noteCard("Work-based learning", "Turn employer interest into guest sessions, field trips, internships, and apprenticeships.")}
      </div>
    `),
    slide("standard", "Close", "Coaches are not asking for a different program. They are asking for a more operable version of this one.", `
      <div class="takeaway"><div class="chapter-num">13</div><div><h2>coach responses</h2><p>The program has coach credibility. The next gain comes from structure, timing, and employer pathways.</p></div></div>
    `),
  ];
  return buildHtml("CMCC Coach Survey 2026", slides);
}

function buildCompetitorDeck(rows) {
  const n = rows.length;
  const window = sourceWindow(rows);
  const ratings = [
    "Rate the Game",
    "Likely to Participate Next Year",
    "Inspires Me to Continue Learning",
    "Better Understanding of Cyber",
    "Interested in a Cyber Career",
    "Opportunities",
  ].map((question) => ratingSummary(rows, question));
  const game = ratings[0];
  const likely = ratings[1];
  const career = ratings[4];
  const trainingYes = choiceCounts(rows, "Attended Weekly Training and/or Office Hours").find((c) => c.label === "Yes")?.value ?? 0;
  const nuggetsYes = choiceCounts(rows, "CyberNugget Resources").find((c) => c.label === "Yes")?.value ?? 0;
  const additional = choiceCounts(rows, "Additional Training");
  const competitions = choiceCounts(rows, "Competitions");
  const favorite = freeAnswers(rows, "Favorite Parts");
  const practice = freeAnswers(rows, "Classroom Practice");
  const barriers = freeAnswers(rows, "Barriers");
  const engagement = freeAnswers(rows, "More Engagement");
  const better = freeAnswers(rows, "How can we make it better?");

  const slides = [
    slide("cover", "Competitor survey", `<span class="accent">Competitor</span><br/>post-event readout`, `
      <p class="lede">Students rated the experience highly and want the next version to translate that energy into more practice, clearer challenge expectations, and work-based pathways.</p>
      <div class="stats">${stat("competitor responses", n, window)}${stat("game rating", `${game.average?.toFixed(1)}/5`, `${pct(game.favorable, game.total)} rated 4-5`)}${stat("return intent", `${pct(likely.favorable, likely.total)}`, "rated 4-5 for next year")}</div>
    `),
    slide("standard", "Executive read", "The student readout is a strong conversion signal with clear activation needs.", `
      <div class="grid cols-3">
        ${noteCard("Event works", "Students describe learning, teamwork, challenge solving, and a memorable live event environment.")}
        ${noteCard("Practice drives confidence", "Classroom and weekly resources matter, but students want more hands-on labs and simulations.")}
        ${noteCard("Career bridge is visible", "Students repeatedly ask for internships, apprenticeships, workshops, and certification access.")}
      </div>
      <div class="stats">${stat("weekly training yes", pct(trainingYes, n), `${trainingYes} of ${n}`)}${stat("CyberNugget yes", pct(nuggetsYes, n), `${nuggetsYes} of ${n}`)}${stat("career interest", `${career.average?.toFixed(1)}/5`, `${pct(career.favorable, career.total)} rated 4-5`)}</div>
    `),
    slide("standard", "Stacked ratings", "The quantitative story stays favorable across satisfaction, learning, and career interest.", `
      ${scaleChart(ratings)}
    `),
    slide("teal", "Engagement touchpoints", "Weekly training and CyberNuggets reached a meaningful share of respondents.", `
      ${yesNoGrid([
        { label: "Attended weekly training / office hours", yes: trainingYes },
        { label: "Used CyberNugget resources", yes: nuggetsYes },
      ], n)}
    `),
    slide("standard", "What students want next", "The top asks are not vague motivation; they are concrete skill-building and career access.", `
      <div class="grid cols-2">
        ${rankedList(additional, n, 7)}
        ${quoteCard(quote(engagement, ["internship", "workshop", "apprentice"]), "More engagement")}
      </div>
    `),
    slide("standard", "Competition ecosystem", "Students already sit in a broader cyber competition pipeline.", `
      <div class="grid cols-2">
        ${rankedList(competitions, n, 7)}
        ${noteCard("Program implication", "CMCC can act as the regional connector across CTFs, school teams, practice platforms, and employer-facing opportunities.")}
      </div>
    `),
    slide("green", "Favorite parts", "Students remember learning with peers and solving real challenges.", `
      <div class="grid cols-2">
        ${quoteCard(quote(favorite, ["friend", "team", "learn"]), "Student favorite")}
        ${rankedList(themeCounts(favorite, [
          { label: "Learning new skills", keywords: ["learn", "learning", "understand"] },
          { label: "Friends and teamwork", keywords: ["friend", "team", "classmate"] },
          { label: "Challenge solving", keywords: ["challenge", "problem", "solve", "ctf"] },
          { label: "Physical recognition", keywords: ["coin", "prize", "medal"] },
        ]), n, 6)}
      </div>
    `),
    slide("standard", "Classroom practice", "Practice helped students convert coursework into applied understanding.", `
      <div class="grid cols-2">
        ${quoteCard(quote(practice, ["perspective", "coursework", "friday", "skills"]), "Classroom practice")}
        ${noteCard("Design implication", "Keep practice tied to classroom flow, but make the path clearer for students who are new to CTF-style problem solving.")}
      </div>
    `),
    slide("orange", "Barriers", "The largest barriers are confidence, clarity, access, and knowing where opportunity lives.", `
      <div class="grid cols-2">
        ${rankedList(themeCounts(barriers, [
          { label: "Awareness and direction", keywords: ["know", "didn't", "where", "how"] },
          { label: "Job availability", keywords: ["job", "availability", "career", "remote"] },
          { label: "Study space and peers", keywords: ["space", "peers", "study"] },
          { label: "Skill confidence", keywords: ["skill", "experience", "learn"] },
        ]), n, 6)}
        ${quoteCard(quote(barriers, ["job", "space", "know"]), "Student barrier")}
      </div>
    `),
    slide("standard", "Make it better", "Students ask for clearer rules, higher-stakes recognition, and more structured preparation.", `
      <div class="grid cols-2">
        ${quoteCard(quote(better, ["prize", "challenge", "clear", "practice"]), "Student improvement")}
        ${rankedList(themeCounts(better, [
          { label: "Clearer challenge instructions", keywords: ["clear", "challenge", "entered", "wants"] },
          { label: "Prizes and recognition", keywords: ["prize", "earn", "prestige", "coin"] },
          { label: "More preparation", keywords: ["practice", "training", "help"] },
          { label: "More time", keywords: ["time", "longer"] },
        ]), n, 6)}
      </div>
    `),
    slide("chapter", "The student ask", `<span class="accent">Turn</span><br/>interest into a pathway`, `
      <div class="grid cols-3">
        ${noteCard("More reps", "Hands-on labs, simulations, and walkthroughs before the competition.")}
        ${noteCard("Clearer game", "Challenge expectations, judging logic, and next-step guidance that reduce ambiguity.")}
        ${noteCard("Career bridge", "Internships, apprenticeships, certifications, and employer-led workshops.")}
      </div>
    `),
    slide("standard", "Close", "The experience is strong enough to convert. The next version should make the path easier to follow.", `
      <div class="takeaway"><div class="chapter-num">82</div><div><h2>competitor responses</h2><p>Students are engaged. They need structure, practice, and visible routes from competition to career.</p></div></div>
    `),
  ];
  return buildHtml("CMCC Competitor Survey 2026", slides);
}

function buildIntersectionDeck(coachRows, competitorRows) {
  const coachN = coachRows.length;
  const competitorN = competitorRows.length;
  const coachWindow = sourceWindow(coachRows);
  const competitorWindow = sourceWindow(competitorRows);
  const coachStudents = coachRows.reduce((sum, row) => sum + (numeric(row, "Number of Students") ?? 0), 0);
  const game = ratingSummary(competitorRows, "Rate the Game");
  const coachExp = ratingSummary(coachRows, "Mayors Cup Experience");
  const trainingYes = choiceCounts(competitorRows, "Attended Weekly Training and/or Office Hours").find((c) => c.label === "Yes")?.value ?? 0;
  const nuggetsYes = choiceCounts(competitorRows, "CyberNugget Resources").find((c) => c.label === "Yes")?.value ?? 0;
  const studentTraining = choiceCounts(competitorRows, "Additional Training");
  const coachSupportThemes = themeCounts(
    freeAnswers(coachRows, "Training During School Day").concat(freeAnswers(coachRows, "Support"), freeAnswers(coachRows, "Gaps")),
    [
      { label: "Walkthroughs and tutorials", keywords: ["tutorial", "walkthrough", "practice"] },
      { label: "Certification alignment", keywords: ["certification", "comptia", "security+"] },
      { label: "CTF logic and pen testing", keywords: ["ctf", "pen", "logic"] },
      { label: "School schedule fit", keywords: ["school day", "club", "class"] },
    ],
  );
  const studentEngagement = themeCounts(
    freeAnswers(competitorRows, "More Engagement").concat(freeAnswers(competitorRows, "Barriers")),
    [
      { label: "Internships and apprenticeships", keywords: ["internship", "apprentice"] },
      { label: "Workshops", keywords: ["workshop"] },
      { label: "Job/career visibility", keywords: ["job", "career", "remote"] },
      { label: "Study peers and access", keywords: ["peer", "space", "study"] },
    ],
  );

  const slides = [
    slide("cover", "Intersection readout", `<span class="accent">Where coach</span><br/>and student signals meet`, `
      <p class="lede">The live data now includes ${coachN} coach responses and ${competitorN} competitor responses. Both groups point to the same operating model: more structured practice, clearer game design, and visible career pathways.</p>
      <div class="stats">${stat("coach responses", coachN, coachWindow)}${stat("competitor responses", competitorN, competitorWindow)}${stat("students represented", numberFmt(coachStudents), "coach self-report")}</div>
    `),
    slide("standard", "Thesis", "CMCC has earned attention. The next job is to build a pathway around it.", `
      <div class="grid cols-2">
        ${noteCard("The event is the spark", `${pct(game.favorable, game.total)} of competitors rated the game 4-5; coaches average ${coachExp.average?.toFixed(1)}/5 on overall experience.`)}
        ${noteCard("The pathway is the work", "Both audiences ask for practice scaffolds, career exposure, and cleaner guidance from training to competition to opportunity.")}
      </div>
    `),
    slide("chapter", "Convergence 01", `<span class="accent">Practice</span><br/>before performance`, `
      <div class="grid cols-2">
        ${rankedList(studentTraining, competitorN, 6)}
        ${rankedList(coachSupportThemes, coachN, 6)}
      </div>
    `),
    slide("chapter", "Convergence 02", `<span class="accent">Make</span><br/>the game legible`, `
      <div class="grid cols-3">
        ${noteCard("Students", "Clearer challenge instructions and expectations lower friction for new competitors.")}
        ${noteCard("Coaches", "The new point model is a keeper, but day-of pacing needs another pass.")}
        ${noteCard("Move", "Publish a challenge-readiness primer, scoring explainer, and event-day flow map before kickoff.")}
      </div>
    `),
    slide("chapter", "Convergence 03", `<span class="accent">Career</span><br/>bridges beat slogans`, `
      <div class="grid cols-2">
        ${rankedList(studentEngagement, competitorN, 6)}
        ${quoteCard(quote(freeAnswers(coachRows, "Employer Engagement").concat(freeAnswers(coachRows, "Improve Collaboration")), ["apprentice", "guest", "internship"]), "Coach employer signal")}
      </div>
    `),
    slide("chapter", "Convergence 04", `<span class="accent">Use</span><br/>the weekly engine`, `
      <div class="stats">${stat("weekly training reach", pct(trainingYes, competitorN), `${trainingYes} of ${competitorN} competitors`)}${stat("CyberNugget reach", pct(nuggetsYes, competitorN), `${nuggetsYes} of ${competitorN} competitors`)}${stat("opportunity", "always-on", "turn resources into a pathway")}</div>
    `),
    slide("chapter", "Convergence 05", `<span class="accent">Coach</span><br/>enablement scales student outcomes`, `
      <div class="grid cols-2">
        ${noteCard("Coach constraint", "School-day training does not fit every program, so resources must work asynchronously and in clubs.")}
        ${noteCard("Student constraint", "Students want more labs, simulations, and practice with clearer ramp-up expectations.")}
      </div>
    `),
    slide("chapter", "Convergence 06", `<span class="accent">Recognition</span><br/>matters`, `
      <div class="grid cols-2">
        ${quoteCard(quote(freeAnswers(competitorRows, "How can we make it better?"), ["prize", "coin", "prestige"]), "Student recognition signal")}
        ${noteCard("Move", "Layer meaningful recognition into the experience: badges, certificates, team callouts, employer visibility, and tangible awards where feasible.")}
      </div>
    `),
    slide("chapter", "Convergence 07", `<span class="accent">Regional</span><br/>connector role`, `
      <div class="grid cols-2">
        ${rankedList(choiceCounts(competitorRows, "Competitions"), competitorN, 7)}
        ${noteCard("Strategic role", "CMCC can connect classrooms, CTFs, employers, community colleges, and regional cyber careers into one visible ecosystem.")}
      </div>
    `),
    slide("standard", "Operating model", "The next deck of work is simple to name and hard to execute.", `
      <div class="grid cols-3">
        ${noteCard("Practice ladder", "Beginner-to-advanced labs, recordings, walkthroughs, and certification-aligned resources.")}
        ${noteCard("Event clarity", "Scoring, challenge expectations, event-day pacing, and recognition designed before the day starts.")}
        ${noteCard("Opportunity bridge", "Employer workshops, guest talks, internships, apprenticeships, and field experiences.")}
      </div>
    `),
    slide("standard", "Close", "The surveys now read less like feedback and more like a roadmap.", `
      <div class="takeaway"><div class="chapter-num">${coachN + competitorN}</div><div><h2>combined responses</h2><p>Keep the event energy. Build the pathway around it.</p></div></div>
    `),
  ];
  return buildHtml("CMCC Survey Intersection 2026", slides);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("survey_results")
    .select("id,type,submitted_at,results_jsonb")
    .order("submitted_at", { ascending: true });
  if (error) throw error;

  const rows = parseRows(data ?? []);
  const coachRows = rows.filter((row) => row.type === "coach");
  const competitorRows = rows.filter((row) => row.type === "competitor");
  if (!coachRows.length || !competitorRows.length) {
    throw new Error(`Expected coach and competitor rows, got coach=${coachRows.length}, competitor=${competitorRows.length}`);
  }

  const outputs = [
    ["coach-survey-deck-2026.html", buildCoachDeck(coachRows)],
    ["competitor-survey-deck-2026.html", buildCompetitorDeck(competitorRows)],
    ["intersection-deck-2026.html", buildIntersectionDeck(coachRows, competitorRows)],
  ];

  for (const [filename, html] of outputs) {
    await fs.writeFile(path.join(SURVEY_DIR, filename), html, "utf8");
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    source: "survey_results",
    brandGuide: "CMCC - brandguide.pdf",
    colors: BRAND,
    rows: {
      coach: coachRows.length,
      competitor: competitorRows.length,
      coachWindow: sourceWindow(coachRows),
      competitorWindow: sourceWindow(competitorRows),
    },
  };
  await fs.writeFile(path.join(SURVEY_DIR, "survey-slide-deck-data-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
