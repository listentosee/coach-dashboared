#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
let pptxgen;
try {
  pptxgen = require("pptxgenjs");
} catch {
  pptxgen = require("/Users/scottyoung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pptxgenjs");
}
const SHAPE = new pptxgen().ShapeType;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SURVEY_DIR = path.join(ROOT, "docs", "Surveys");
const LOGO_PATH = path.join(SURVEY_DIR, "brand-assets", "cmcc-2026-logo-trimmed.png");
const ORIGINAL_LOGO = "/Users/scottyoung/Library/CloudStorage/OneDrive-SharedLibraries-SynED/CMCC - General/CMCC_2026/Logo/California mayors 2026 - logo.png";

const W = 13.333;
const H = 7.5;
const C = {
  cream: "F5F5F5",
  orange: "FF6B00",
  green: "00AB69",
  teal: "0092B3",
  ink: "2F2D2D",
  black: "151515",
  gray: "747474",
  pale: "E9E9E9",
  white: "FFFFFF",
};
const FONT_HEAD = "Rajdhani";
const FONT_BODY = "Aptos";

function answerToString(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(answerToString).filter(Boolean).join("|");
  if (typeof value === "object") return String(value.label ?? value.value ?? value.text ?? JSON.stringify(value));
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
    for (const q of extractQuestions(row.results_jsonb)) answers.set(q.name || q.id, answerToString(q.value));
    return { ...row, answers };
  });
}

function getAnswer(row, question) {
  return row.answers.get(question) ?? "";
}

function numeric(row, question) {
  const n = Number(getAnswer(row, question));
  return Number.isFinite(n) ? n : null;
}

function avg(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  return valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : null;
}

function pct(value, total) {
  return total ? `${Math.round((value / total) * 100)}%` : "0%";
}

function numberFmt(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function ratingSummary(rows, question) {
  const counts = new Map([[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
  for (const row of rows) {
    const value = numeric(row, question);
    if (value >= 1 && value <= 5) counts.set(value, counts.get(value) + 1);
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return {
    question,
    counts,
    total,
    average: avg(rows.map((row) => numeric(row, question))),
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
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function freeAnswers(rows, question) {
  return rows
    .map((row) => getAnswer(row, question).replace(/\s+/g, " ").trim())
    .filter((answer) => answer && !/^n[\/_ -]?a$/i.test(answer) && !/^none$/i.test(answer));
}

function themeCounts(answers, themes) {
  return themes
    .map((theme) => ({
      label: theme.label,
      value: answers.filter((answer) => {
        const text = answer.toLowerCase();
        return theme.keywords.some((keyword) => text.includes(keyword));
      }).length,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function quote(answers, keywords = []) {
  const clean = answers.filter((answer) => answer.length >= 18);
  const keyed = clean.find((answer) => keywords.some((keyword) => answer.toLowerCase().includes(keyword)));
  const selected = keyed ?? clean.sort((a, b) => b.length - a.length)[0] ?? "";
  return selected.length > 185 ? `${selected.slice(0, 182).trim()}...` : selected;
}

function sourceWindow(rows) {
  const dates = rows.map((row) => new Date(row.submitted_at)).filter((date) => !Number.isNaN(date.valueOf()));
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${format.format(min)} to ${format.format(max)}`;
}

function makeDeck(title) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Codex";
  pptx.subject = "CMCC survey readout";
  pptx.title = title;
  pptx.company = "CMCC";
  pptx.lang = "en-US";
  pptx.theme = {
    headFontFace: FONT_HEAD,
    bodyFontFace: FONT_BODY,
    lang: "en-US",
  };
  pptx.defineLayout({ name: "CMCC_WIDE", width: W, height: H });
  pptx.layout = "CMCC_WIDE";
  return pptx;
}

function cleanText(text) {
  return String(text ?? "").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

function addText(slide, text, x, y, w, h, options = {}) {
  const textOptions = {
    x, y, w, h,
    fontFace: options.fontFace ?? FONT_BODY,
    fontSize: options.fontSize ?? 16,
    color: options.color ?? C.ink,
    bold: options.bold ?? false,
    margin: options.margin ?? 0,
    breakLine: false,
    fit: options.fit ?? "shrink",
    valign: options.valign ?? "top",
    align: options.align ?? "left",
    rotate: options.rotate,
    lineSpacingMultiple: options.lineSpacingMultiple,
  };
  if (options.fit !== false) textOptions.fit = options.fit ?? "shrink";
  slide.addText(cleanText(text), textOptions);
}

function addTitle(slide, title, subtitle, dark = false) {
  addText(slide, title.toUpperCase(), 0.52, 1.25, 8.45, 1.75, {
    fontFace: FONT_HEAD,
    fontSize: 46,
    bold: true,
    color: dark ? C.white : C.ink,
    fit: "shrink",
  });
  if (subtitle) {
    addText(slide, subtitle, 0.56, 2.95, 7.6, 0.8, {
      fontSize: 20,
      bold: true,
      color: dark ? "E9E9E9" : C.ink,
      fit: "shrink",
    });
  }
}

function addLogo(slide, x = 0.52, y = 0.28, w = 1.78, dark = false) {
  const h = w / 1.866;
  if (dark) {
    slide.addShape(SHAPE.roundRect, {
      x: x - 0.06, y: y - 0.05, w: w + 0.12, h: h + 0.1,
      rectRadius: 0.04,
      fill: { color: C.white, transparency: 2 },
      line: { color: C.white, transparency: 100 },
    });
  }
  slide.addImage({ path: LOGO_PATH, x, y, w, h });
}

function addHeader(slide, label, dark = false) {
  addLogo(slide, 0.52, 0.28, 1.42, dark);
  addText(slide, label.toUpperCase(), 2.15, 0.43, 4.7, 0.28, {
    fontFace: FONT_HEAD,
    fontSize: 13,
    bold: true,
    color: C.orange,
  });
  addText(slide, "2026 POST-EVENT SURVEY", 9.7, 0.43, 2.75, 0.24, {
    fontFace: FONT_HEAD,
    fontSize: 11,
    bold: true,
    color: C.white,
    align: "right",
  });
}

function addFooter(slide, page, dark = false) {
  addText(slide, "LIVE SURVEY_RESULTS DATA", 0.52, 7.06, 3.2, 0.18, {
    fontFace: FONT_HEAD,
    fontSize: 8,
    bold: true,
    color: dark ? "C8C8C8" : C.gray,
  });
  addText(slide, page, 11.85, 7.06, 0.9, 0.18, {
    fontFace: FONT_HEAD,
    fontSize: 8,
    bold: true,
    color: dark ? "C8C8C8" : C.gray,
    align: "right",
  });
}

function addDecor(slide, dark = false) {
  slide.addShape(SHAPE.rect, { x: 0, y: 0, w: 0.08, h: H, fill: { color: C.teal }, line: { color: C.teal } });
  slide.addShape(SHAPE.arc, {
    x: 10.0, y: 3.05, w: 5.25, h: 5.25,
    adjustPoint: 0.55,
    line: { color: dark ? C.green : C.teal, transparency: dark ? 55 : 78, width: 18 },
    fill: { color: dark ? C.black : C.cream, transparency: 100 },
    rotate: 20,
  });
  slide.addShape(SHAPE.ellipse, {
    x: 9.65, y: -1.35, w: 4.8, h: 4.8,
    fill: { color: C.orange },
    line: { color: C.orange },
  });
}

function addBg(slide, dark = false) {
  slide.background = { color: dark ? C.black : C.cream };
  addDecor(slide, dark);
}

function addCard(slide, x, y, w, h, title, body, options = {}) {
  const fill = options.fill ?? C.white;
  slide.addShape(SHAPE.roundRect, {
    x, y, w, h,
    rectRadius: 0.06,
    fill: { color: fill, transparency: options.transparency ?? 0 },
    line: { color: options.line ?? "D4D4D4", transparency: options.lineTransparency ?? 10, width: 1 },
    shadow: options.shadow ?? { type: "outer", color: "A0A0A0", opacity: 0.13, blur: 2, angle: 45, distance: 1 },
  });
  if (title) {
    addText(slide, title.toUpperCase(), x + 0.18, y + 0.18, w - 0.36, 0.34, {
      fontFace: FONT_HEAD, fontSize: options.titleSize ?? 18, bold: true, color: options.titleColor ?? C.teal,
    });
  }
  if (body) {
    addText(slide, body, x + 0.18, y + (title ? 0.62 : 0.18), w - 0.36, h - (title ? 0.78 : 0.34), {
      fontSize: options.bodySize ?? 12.5,
      bold: options.bodyBold ?? false,
      color: options.bodyColor ?? C.ink,
      fit: "shrink",
    });
  }
}

function addStat(slide, x, y, w, h, value, label, note = "") {
  addCard(slide, x, y, w, h, "", "", { fill: "F0F0F0" });
  addText(slide, value, x + 0.18, y + 0.2, w - 0.36, 0.55, {
    fontFace: FONT_HEAD, fontSize: 32, bold: true, color: C.orange,
  });
  addText(slide, label.toUpperCase(), x + 0.18, y + 0.76, w - 0.36, 0.24, {
    fontFace: FONT_HEAD, fontSize: 13, bold: true, color: C.ink,
  });
  if (note) addText(slide, note, x + 0.18, y + 1.03, w - 0.36, 0.18, { fontSize: 9.6, color: C.gray, fit: "shrink" });
}

function addCover(pptx, section, title, subtitle, stats) {
  const slide = pptx.addSlide();
  addBg(slide, true);
  addLogo(slide, 0.52, 0.32, 2.15, true);
  addText(slide, section.toUpperCase(), 0.54, 1.55, 3.4, 0.28, { fontFace: FONT_HEAD, fontSize: 13, bold: true, color: C.orange });
  addText(slide, title.toUpperCase(), 0.5, 1.95, 8.2, 1.88, { fontFace: FONT_HEAD, fontSize: 54, bold: true, color: C.white, fit: "shrink" });
  addCard(slide, 0.54, 4.05, 7.55, 0.88, "", subtitle, {
    fill: C.white,
    bodySize: 13.5,
    bodyBold: true,
    bodyColor: C.ink,
    shadow: { type: "outer", color: "000000", opacity: 0.18, blur: 2, angle: 45, distance: 1 },
  });
  const sw = 3.92;
  stats.forEach((stat, i) => addStat(slide, 0.52 + i * (sw + 0.22), 5.45, sw, 1.2, stat.value, stat.label, stat.note));
}

function addStandardSlide(pptx, label, title, subtitle, page, contentFn, dark = false) {
  const slide = pptx.addSlide();
  addBg(slide, dark);
  addHeader(slide, label, dark);
  addTitle(slide, title, subtitle, dark);
  contentFn(slide);
  addFooter(slide, page, dark);
}

function addQuote(slide, x, y, w, h, text, label) {
  addCard(slide, x, y, w, h, "", "", { fill: C.white });
  slide.addShape(SHAPE.rect, { x, y, w: 0.08, h, fill: { color: C.orange }, line: { color: C.orange } });
  addText(slide, `"${text}"`, x + 0.25, y + 0.22, w - 0.48, h - 0.55, { fontSize: 15.5, bold: true, color: C.ink, fit: "shrink" });
  addText(slide, label.toUpperCase(), x + 0.25, y + h - 0.28, w - 0.48, 0.16, { fontFace: FONT_HEAD, fontSize: 8.5, bold: true, color: C.gray });
}

function addRankedBars(slide, items, total, x, y, w, h, limit = 6) {
  const rows = items.slice(0, limit);
  const max = Math.max(...rows.map((item) => item.value), 1);
  const gap = 0.12;
  const rowH = (h - gap * (rows.length - 1)) / rows.length;
  rows.forEach((item, i) => {
    const yy = y + i * (rowH + gap);
    addText(slide, String(i + 1).padStart(2, "0"), x, yy + 0.04, 0.34, 0.22, { fontFace: FONT_HEAD, fontSize: 12, bold: true, color: C.orange });
    addText(slide, item.label, x + 0.42, yy, w - 1.25, 0.23, { fontSize: 9.7, bold: true, color: C.ink, fit: "shrink" });
    slide.addShape(SHAPE.roundRect, { x: x + 0.42, y: yy + 0.31, w: w - 1.35, h: 0.1, rectRadius: 0.03, fill: { color: "D7D7D7" }, line: { color: "D7D7D7" } });
    slide.addShape(SHAPE.roundRect, { x: x + 0.42, y: yy + 0.31, w: Math.max(0.12, (w - 1.35) * item.value / max), h: 0.1, rectRadius: 0.03, fill: { color: i % 3 === 0 ? C.green : i % 3 === 1 ? C.teal : C.orange }, line: { color: i % 3 === 0 ? C.green : i % 3 === 1 ? C.teal : C.orange } });
    addText(slide, `${item.value} ${pct(item.value, total)}`, x + w - 0.72, yy + 0.12, 0.72, 0.18, { fontFace: FONT_HEAD, fontSize: 10, bold: true, color: C.gray, align: "right" });
  });
}

function addLegendList(slide, items, total, x, y, w, h, limit = 6) {
  const rows = items.slice(0, limit);
  const colors = [C.green, C.teal, C.orange, C.ink, "8F8F8F", "BDBDBD"];
  const gap = 0.08;
  const rowH = (h - gap * Math.max(0, rows.length - 1)) / Math.max(1, rows.length);
  rows.forEach((item, i) => {
    const yy = y + i * (rowH + gap);
    const color = colors[i % colors.length];
    slide.addShape(SHAPE.roundRect, {
      x,
      y: yy + 0.03,
      w: 0.16,
      h: 0.16,
      rectRadius: 0.03,
      fill: { color },
      line: { color },
    });
    addText(slide, item.label, x + 0.24, yy, w - 1.32, rowH, {
      fontSize: 9.7,
      bold: true,
      color: C.ink,
      fit: "shrink",
    });
    slide.addShape(SHAPE.roundRect, {
      x: x + w - 1.02,
      y: yy - 0.01,
      w: 0.42,
      h: 0.23,
      rectRadius: 0.04,
      fill: { color, transparency: 8 },
      line: { color, transparency: 100 },
    });
    addText(slide, String(item.value), x + w - 1.02, yy + 0.04, 0.42, 0.1, {
      fontFace: FONT_HEAD,
      fontSize: 8.3,
      bold: true,
      color: C.white,
      align: "center",
    });
    addText(slide, pct(item.value, total), x + w - 0.52, yy + 0.03, 0.52, 0.13, {
      fontFace: FONT_HEAD,
      fontSize: 8.5,
      bold: true,
      color: C.gray,
      align: "right",
    });
  });
}

function addRatingTiles(slide, summaries, x, y, w, h) {
  const segColors = { 1: C.ink, 2: "A0A0A0", 3: C.teal, 4: C.green, 5: C.orange };
  addText(slide, "Rating distribution: 1 low / 5 high", x + w - 2.18, y - 0.24, 1.28, 0.12, {
    fontFace: FONT_HEAD,
    fontSize: 7.5,
    bold: true,
    color: C.gray,
    align: "right",
  });
  [1, 2, 3, 4, 5].forEach((n, i) => {
    const xx = x + w - 0.86 + i * 0.17;
    slide.addShape(SHAPE.rect, { x: xx, y: y - 0.23, w: 0.08, h: 0.11, fill: { color: segColors[n] }, line: { color: segColors[n] } });
    addText(slide, String(n), xx + 0.1, y - 0.25, 0.08, 0.08, { fontFace: FONT_HEAD, fontSize: 6.2, bold: true, color: C.gray });
  });
  const cols = 3;
  const rows = Math.ceil(summaries.length / cols);
  const gapX = 0.18;
  const gapY = 0.16;
  const tileW = (w - gapX * (cols - 1)) / cols;
  const tileH = (h - gapY * (rows - 1)) / rows;
  summaries.forEach((summary, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const xx = x + col * (tileW + gapX);
    const yy = y + row * (tileH + gapY);
    const label = summary.question
      .replace("Likely to Participate Next Year", "Participate next year")
      .replace("Inspires Me to Continue Learning", "Continue learning")
      .replace("Better Understanding of Cyber", "Understanding cyber")
      .replace("Interested in a Cyber Career", "Cyber career interest");
    addCard(slide, xx, yy, tileW, tileH, "", "");
    addText(slide, label, xx + 0.18, yy + 0.16, tileW - 0.36, 0.22, {
      fontSize: 10,
      bold: true,
      color: C.ink,
      fit: "shrink",
    });
    addText(slide, `${summary.average?.toFixed(1) ?? "-"}`, xx + 0.18, yy + 0.5, 0.82, 0.45, {
      fontFace: FONT_HEAD,
      fontSize: 30,
      bold: true,
      color: C.orange,
    });
    addText(slide, "AVG", xx + 0.94, yy + 0.68, 0.35, 0.12, {
      fontFace: FONT_HEAD,
      fontSize: 7.2,
      bold: true,
      color: C.gray,
    });
    addText(slide, `${pct(summary.favorable, summary.total)} 4-5`, xx + tileW - 1.15, yy + 0.62, 0.94, 0.16, {
      fontFace: FONT_HEAD,
      fontSize: 9.5,
      bold: true,
      color: C.gray,
      align: "right",
    });
    const maxCount = Math.max(...[1, 2, 3, 4, 5].map((n) => summary.counts.get(n) ?? 0), 1);
    const chartX = xx + 1.55;
    const chartY = yy + 0.5;
    const chartW = tileW - 2.25;
    const chartH = 0.47;
    slide.addShape(SHAPE.line, {
      x: chartX - 0.04,
      y: chartY + chartH + 0.02,
      w: chartW + 0.18,
      h: 0,
      line: { color: "D7D7D7", width: 0.75 },
    });
    [1, 2, 3, 4, 5].forEach((n, idx) => {
      const value = summary.counts.get(n) ?? 0;
      const barW = 0.13;
      const barH = value ? Math.max(0.08, chartH * value / maxCount) : 0.04;
      const barX = chartX + idx * (chartW / 5) + 0.08;
      const barY = chartY + chartH - barH;
      slide.addShape(SHAPE.rect, {
        x: barX,
        y: barY,
        w: barW,
        h: barH,
        fill: { color: segColors[n] },
        line: { color: segColors[n] },
      });
      addText(slide, String(value), barX - 0.07, chartY + chartH + 0.05, 0.28, 0.1, {
        fontFace: FONT_HEAD,
        fontSize: 6.8,
        bold: true,
        color: C.gray,
        align: "center",
      });
    });
  });
}

function yesNoCards(slide, items, total, x, y, w) {
  items.forEach((item, i) => {
    const xx = x + i * (w / items.length + 0.15);
    const cw = w / items.length - 0.08;
    addCard(slide, xx, y, cw, 1.35, item.label, "", { fill: C.white });
    addText(slide, pct(item.yes, total), xx + 0.18, y + 0.53, cw - 0.36, 0.45, { fontFace: FONT_HEAD, fontSize: 30, bold: true, color: C.orange });
    slide.addShape(SHAPE.roundRect, { x: xx + 0.18, y: y + 1.04, w: cw - 0.36, h: 0.1, rectRadius: 0.03, fill: { color: "D7D7D7" }, line: { color: "D7D7D7" } });
    slide.addShape(SHAPE.roundRect, { x: xx + 0.18, y: y + 1.04, w: (cw - 0.36) * item.yes / total, h: 0.1, rectRadius: 0.03, fill: { color: i ? C.teal : C.green }, line: { color: i ? C.teal : C.green } });
    addText(slide, `${item.yes} yes / ${total - item.yes} no`, xx + 0.18, y + 1.18, cw - 0.36, 0.16, { fontSize: 8.5, bold: true, color: C.gray });
  });
}

function buildCoachDeck(coachRows) {
  const pptx = makeDeck("CMCC Coach Survey 2026");
  const n = coachRows.length;
  const window = sourceWindow(coachRows);
  const students = coachRows.reduce((sum, row) => sum + (numeric(row, "Number of Students") ?? 0), 0);
  const experience = ratingSummary(coachRows, "Mayors Cup Experience");
  const curriculum = choiceCounts(coachRows, "Cyber Curriculum");
  const teaching = choiceCounts(coachRows, "Teaching Cyber");
  const competition = choiceCounts(coachRows, "Competition Experience");
  const value = freeAnswers(coachRows, "Value to Your Students");
  const dashboard = freeAnswers(coachRows, "Coaches Dashboard");
  const training = freeAnswers(coachRows, "Training During School Day");
  const improvements = freeAnswers(coachRows, "Improvements");
  const gaps = freeAnswers(coachRows, "Gaps");
  const employer = freeAnswers(coachRows, "Employer Engagement").concat(freeAnswers(coachRows, "Improve Collaboration"));
  const support = freeAnswers(coachRows, "Support");

  addCover(pptx, "Coach survey", "Coach post-event readout", "Current live survey data shows strong program value, with coaches asking for structured practice pathways, cleaner game-day pacing, and clearer employer connections.", [
    { value: String(n), label: "coach responses", note: window },
    { value: numberFmt(students), label: "students represented", note: "coach self-report" },
    { value: `${experience.average?.toFixed(1)}/5`, label: "experience score", note: `${pct(experience.favorable, experience.total)} rated 4-5` },
  ]);
  addStandardSlide(pptx, "Coach survey", "Coach signal is positive, practical, and implementation-heavy.", "", "02", (slide) => {
    addCard(slide, 0.62, 4.15, 3.7, 1.35, "Value is real", "Coaches cite competition, belonging, resume value, and applied cyber work as clear student benefits.");
    addCard(slide, 4.82, 4.15, 3.7, 1.35, "Training wants structure", "Requests cluster around walkthroughs, tutorials, certifications, and practice that can fit school schedules.");
    addCard(slide, 9.02, 4.15, 3.7, 1.35, "Game day improved", "The new point system is praised, while pacing and post-competition downtime still need design work.");
  });
  addStandardSlide(pptx, "Coach context", "Coach base mixes classroom, club, and dedicated cyber delivery.", "", "03", (slide) => {
    addCard(slide, 0.62, 4.0, 3.8, 2.3, "Where cyber happens", "");
    addLegendList(slide, curriculum, n, 0.88, 4.62, 3.25, 1.25, 4);
    addCard(slide, 4.75, 4.0, 3.8, 2.3, "Teaching cyber", "");
    addLegendList(slide, teaching, n, 5.0, 4.62, 3.25, 1.25, 4);
    addCard(slide, 8.88, 4.0, 3.8, 2.3, "Competition maturity", "");
    addLegendList(slide, competition, n, 9.13, 4.62, 3.25, 1.25, 4);
  });
  addStandardSlide(pptx, "Program value", "Coaches see the cup as a motivator that turns cyber into lived experience.", "", "04", (slide) => {
    addQuote(slide, 0.72, 4.0, 5.65, 1.75, quote(value, ["metactf", "resume", "competition"]), "Coach value comment");
    addCard(slide, 6.75, 4.0, 5.35, 1.75, "Design implication", "Preserve the event's competitive identity, then make the practice path more visible before students arrive at game day.");
  }, true);
  addStandardSlide(pptx, "Dashboard", "The dashboard is usable; next-action clarity is the remaining opportunity.", "", "05", (slide) => {
    addQuote(slide, 0.72, 4.02, 5.65, 1.7, quote(dashboard, ["better", "fantastic", "simple"]), "Coach dashboard");
    addCard(slide, 6.75, 4.02, 5.35, 1.7, "Next version", "Keep the dashboard as the operating hub, but add a next-action layer for messages, deadlines, and resources.");
  });
  addStandardSlide(pptx, "Training", "Daytime delivery is not equally feasible across programs.", "", "06", (slide) => {
    const themes = themeCounts(training, [
      { label: "Tutorials and walkthroughs", keywords: ["tutorial", "walkthrough", "specific", "beginner"] },
      { label: "Schedule constraints", keywords: ["not an option", "school day", "club", "ctso", "after"] },
      { label: "More practice", keywords: ["practice", "training", "recording"] },
      { label: "Curriculum alignment", keywords: ["course", "curriculum", "class"] },
    ]);
    addCard(slide, 0.72, 4.0, 5.4, 1.9, "Theme count", "");
    addLegendList(slide, themes, n, 0.98, 4.55, 4.8, 1.05, 4);
    addQuote(slide, 6.55, 4.0, 5.65, 1.9, quote(training, ["school day", "walkthrough", "tutorial"]), "Training constraint");
  });
  addStandardSlide(pptx, "Game day", "Keep the new scoring model; tighten the event arc.", "", "07", (slide) => {
    addQuote(slide, 0.72, 4.0, 5.85, 1.72, quote(improvements, ["point system", "game day", "fireside"]), "Coach improvement comment");
    addCard(slide, 6.95, 4.0, 5.1, 1.72, "Operating move", "Preserve scoring, shorten the post-competition gap, and give non-finalists a structured parallel activity.");
  }, true);
  addStandardSlide(pptx, "Curriculum gaps", "The unmet need is skill scaffolding, not enthusiasm.", "", "08", (slide) => {
    const themes = themeCounts(gaps.concat(support), [
      { label: "Hands-on labs and practice", keywords: ["practice", "lab", "tutorial"] },
      { label: "Pen testing and CTF logic", keywords: ["pen", "ctf", "logic", "figure"] },
      { label: "Certification alignment", keywords: ["certification", "comptia", "security+"] },
      { label: "Introductory curriculum", keywords: ["beginner", "basic", "ap"] },
    ]);
    addCard(slide, 0.72, 4.0, 5.4, 1.9, "Top gaps", "");
    addLegendList(slide, themes, n, 0.98, 4.55, 4.8, 1.05, 4);
    addQuote(slide, 6.55, 4.0, 5.65, 1.9, quote(gaps.concat(support), ["pen", "tutorial", "certification"]), "Gap / support request");
  });
  addStandardSlide(pptx, "Employer engagement", "Coaches ask for concrete exposure, not abstract partnership language.", "", "09", (slide) => {
    const themes = themeCounts(employer, [
      { label: "Internships and apprenticeships", keywords: ["internship", "apprentice"] },
      { label: "Guest speakers", keywords: ["guest", "speaker", "lecture"] },
      { label: "Career days and field trips", keywords: ["career", "field trip", "tour"] },
      { label: "Virtual access", keywords: ["virtual", "remote"] },
    ]);
    addCard(slide, 0.72, 4.0, 5.4, 1.9, "Engagement requests", "");
    addLegendList(slide, themes, n, 0.98, 4.55, 4.8, 1.05, 4);
    addQuote(slide, 6.55, 4.0, 5.65, 1.9, quote(employer, ["apprentice", "guest", "internship"]), "Employer engagement");
  });
  addStandardSlide(pptx, "Close", "Coaches are asking for a more operable version of a program they value.", "", "10", (slide) => {
    addCard(slide, 0.82, 4.0, 3.55, 1.55, "Practice ladder", "Beginner-to-advanced labs, walkthroughs, recordings, and certification-aligned resources.");
    addCard(slide, 4.86, 4.0, 3.55, 1.55, "Cleaner event rhythm", "Keep the point model and redesign the post-competition waiting period.");
    addCard(slide, 8.9, 4.0, 3.55, 1.55, "Work-based learning", "Turn employer interest into guest sessions, field trips, internships, and apprenticeships.");
  }, true);
  return pptx;
}

function buildCompetitorDeck(rows) {
  const pptx = makeDeck("CMCC Competitor Survey 2026");
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
  const trainingYes = choiceCounts(rows, "Attended Weekly Training and/or Office Hours").find((c) => c.label === "Yes")?.value ?? 0;
  const nuggetsYes = choiceCounts(rows, "CyberNugget Resources").find((c) => c.label === "Yes")?.value ?? 0;
  const additional = choiceCounts(rows, "Additional Training");
  const competitions = choiceCounts(rows, "Competitions");
  const favorite = freeAnswers(rows, "Favorite Parts");
  const practice = freeAnswers(rows, "Classroom Practice");
  const barriers = freeAnswers(rows, "Barriers");
  const engagement = freeAnswers(rows, "More Engagement");
  const better = freeAnswers(rows, "How can we make it better?");

  addCover(pptx, "Competitor survey", "Competitor post-event readout", "Students rated the experience highly and want the next version to translate that energy into more practice, clearer challenge expectations, and work-based pathways.", [
    { value: String(n), label: "competitor responses", note: window },
    { value: `${ratings[0].average?.toFixed(1)}/5`, label: "game rating", note: `${pct(ratings[0].favorable, ratings[0].total)} rated 4-5` },
    { value: pct(ratings[1].favorable, ratings[1].total), label: "return intent", note: "rated 4-5 for next year" },
  ]);
  addStandardSlide(pptx, "Competitor survey", "Strong conversion signal with clear activation needs.", "", "02", (slide) => {
    addCard(slide, 0.62, 4.15, 3.7, 1.35, "Event works", "Students describe learning, teamwork, challenge solving, and a memorable live event environment.");
    addCard(slide, 4.82, 4.15, 3.7, 1.35, "Practice drives confidence", "Classroom and weekly resources matter, but students want more hands-on labs and simulations.");
    addCard(slide, 9.02, 4.15, 3.7, 1.35, "Career bridge is visible", "Students ask for internships, apprenticeships, workshops, and certification access.");
  });
  addStandardSlide(pptx, "Stacked ratings", "The quantitative story stays favorable across satisfaction, learning, and career interest.", "", "03", (slide) => {
    addCard(slide, 0.66, 3.52, 11.95, 3.02, "Rating summary", "");
    addRatingTiles(slide, ratings, 0.95, 4.0, 11.38, 2.25);
  });
  addStandardSlide(pptx, "Engagement", "Weekly training and CyberNuggets reached a meaningful share of respondents.", "", "04", (slide) => {
    yesNoCards(slide, [
      { label: "Attended weekly training / office hours", yes: trainingYes },
      { label: "Used CyberNugget resources", yes: nuggetsYes },
    ], n, 0.8, 4.08, 11.6);
  }, true);
  addStandardSlide(pptx, "Training asks", "The top asks are concrete skill-building and career access.", "", "05", (slide) => {
    addCard(slide, 0.72, 3.8, 5.5, 2.35, "Additional training requested", "");
    addLegendList(slide, additional, n, 1.0, 4.42, 4.95, 1.35, 5);
    addQuote(slide, 6.65, 3.8, 5.55, 2.35, quote(engagement, ["internship", "workshop", "apprentice"]), "More engagement");
  });
  addStandardSlide(pptx, "Competition ecosystem", "Students already sit in a broader cyber competition pipeline.", "", "06", (slide) => {
    addCard(slide, 0.72, 3.8, 5.5, 2.35, "Other competitions", "");
    addLegendList(slide, competitions, n, 1.0, 4.42, 4.95, 1.35, 5);
    addCard(slide, 6.65, 3.8, 5.55, 2.35, "Program implication", "CMCC can act as the regional connector across CTFs, school teams, practice platforms, and employer-facing opportunities.");
  });
  addStandardSlide(pptx, "Favorite parts", "Students remember learning with peers and solving real challenges.", "", "07", (slide) => {
    const themes = themeCounts(favorite, [
      { label: "Learning new skills", keywords: ["learn", "learning", "understand"] },
      { label: "Friends and teamwork", keywords: ["friend", "team", "classmate"] },
      { label: "Challenge solving", keywords: ["challenge", "problem", "solve", "ctf"] },
      { label: "Physical recognition", keywords: ["coin", "prize", "medal"] },
    ]);
    addQuote(slide, 0.72, 3.9, 5.7, 2.0, quote(favorite, ["friend", "team", "learn"]), "Student favorite");
    addCard(slide, 6.78, 3.9, 5.42, 2.0, "Theme count", "");
    addLegendList(slide, themes, n, 7.05, 4.5, 4.8, 1.05, 4);
  }, true);
  addStandardSlide(pptx, "Practice and barriers", "Practice helps; confidence and clarity still limit conversion.", "", "08", (slide) => {
    addQuote(slide, 0.72, 3.9, 5.7, 2.0, quote(practice, ["perspective", "coursework", "friday", "skills"]), "Classroom practice");
    const themes = themeCounts(barriers, [
      { label: "Awareness and direction", keywords: ["know", "didn't", "where", "how"] },
      { label: "Job availability", keywords: ["job", "availability", "career", "remote"] },
      { label: "Study space and peers", keywords: ["space", "peers", "study"] },
      { label: "Skill confidence", keywords: ["skill", "experience", "learn"] },
    ]);
    addCard(slide, 6.78, 3.9, 5.42, 2.0, "Barrier themes", "");
    addLegendList(slide, themes, n, 7.05, 4.5, 4.8, 1.05, 4);
  });
  addStandardSlide(pptx, "Make it better", "Students ask for clearer rules, higher-stakes recognition, and more structured prep.", "", "09", (slide) => {
    addQuote(slide, 0.72, 3.9, 5.7, 2.0, quote(better, ["prize", "challenge", "clear", "practice"]), "Student improvement");
    addCard(slide, 6.78, 3.9, 5.42, 2.0, "Next version", "More reps, clearer game expectations, and visible career bridges: internships, apprenticeships, certifications, and employer-led workshops.");
  });
  addStandardSlide(pptx, "Close", "The experience is strong enough to convert; the path should be easier to follow.", "", "10", (slide) => {
    addCard(slide, 0.82, 4.0, 3.55, 1.55, "More reps", "Hands-on labs, simulations, and walkthroughs before the competition.");
    addCard(slide, 4.86, 4.0, 3.55, 1.55, "Clearer game", "Challenge expectations, judging logic, and next-step guidance that reduce ambiguity.");
    addCard(slide, 8.9, 4.0, 3.55, 1.55, "Career bridge", "Internships, apprenticeships, certifications, and employer-led workshops.");
  }, true);
  return pptx;
}

function buildIntersectionDeck(coachRows, competitorRows) {
  const pptx = makeDeck("CMCC Survey Intersection 2026");
  const coachN = coachRows.length;
  const competitorN = competitorRows.length;
  const students = coachRows.reduce((sum, row) => sum + (numeric(row, "Number of Students") ?? 0), 0);
  const game = ratingSummary(competitorRows, "Rate the Game");
  const coachExp = ratingSummary(coachRows, "Mayors Cup Experience");
  const trainingYes = choiceCounts(competitorRows, "Attended Weekly Training and/or Office Hours").find((c) => c.label === "Yes")?.value ?? 0;
  const nuggetsYes = choiceCounts(competitorRows, "CyberNugget Resources").find((c) => c.label === "Yes")?.value ?? 0;
  const studentTraining = choiceCounts(competitorRows, "Additional Training");
  const coachSupport = themeCounts(freeAnswers(coachRows, "Training During School Day").concat(freeAnswers(coachRows, "Support"), freeAnswers(coachRows, "Gaps")), [
    { label: "Walkthroughs and tutorials", keywords: ["tutorial", "walkthrough", "practice"] },
    { label: "Certification alignment", keywords: ["certification", "comptia", "security+"] },
    { label: "CTF logic and pen testing", keywords: ["ctf", "pen", "logic"] },
    { label: "School schedule fit", keywords: ["school day", "club", "class"] },
  ]);
  const studentEngagement = themeCounts(freeAnswers(competitorRows, "More Engagement").concat(freeAnswers(competitorRows, "Barriers")), [
    { label: "Internships and apprenticeships", keywords: ["internship", "apprentice"] },
    { label: "Workshops", keywords: ["workshop"] },
    { label: "Job/career visibility", keywords: ["job", "career", "remote"] },
    { label: "Study peers and access", keywords: ["peer", "space", "study"] },
  ]);

  addCover(pptx, "Intersection readout", "Where coach and student signals meet", `The live data includes ${coachN} coach responses and ${competitorN} competitor responses. Both groups point to the same operating model: structured practice, clearer game design, and visible career pathways.`, [
    { value: String(coachN), label: "coach responses", note: sourceWindow(coachRows) },
    { value: String(competitorN), label: "competitor responses", note: sourceWindow(competitorRows) },
    { value: numberFmt(students), label: "students represented", note: "coach self-report" },
  ]);
  addStandardSlide(pptx, "Intersection", "CMCC has earned attention. The next job is to build a pathway around it.", "", "02", (slide) => {
    addStat(slide, 0.8, 4.0, 3.6, 1.25, `${game.average?.toFixed(1)}/5`, "student game rating", `${pct(game.favorable, game.total)} rated 4-5`);
    addStat(slide, 4.85, 4.0, 3.6, 1.25, `${coachExp.average?.toFixed(1)}/5`, "coach experience", `${pct(coachExp.favorable, coachExp.total)} rated 4-5`);
    addCard(slide, 8.9, 4.0, 3.55, 1.25, "The pathway is the work", "Both audiences ask for practice scaffolds, career exposure, and cleaner guidance from training to opportunity.");
  });
  addStandardSlide(pptx, "Convergence 01", "Practice before performance.", "", "03", (slide) => {
    addCard(slide, 0.72, 3.78, 5.5, 2.35, "Student training asks", "");
    addLegendList(slide, studentTraining, competitorN, 1.0, 4.42, 4.95, 1.35, 5);
    addCard(slide, 6.65, 3.78, 5.55, 2.35, "Coach support asks", "");
    addLegendList(slide, coachSupport, coachN, 6.95, 4.42, 4.9, 1.35, 5);
  }, true);
  addStandardSlide(pptx, "Convergence 02", "Make the game legible.", "", "04", (slide) => {
    addCard(slide, 0.82, 4.0, 3.55, 1.55, "Students", "Clearer challenge instructions and expectations lower friction for new competitors.");
    addCard(slide, 4.86, 4.0, 3.55, 1.55, "Coaches", "The new point model is a keeper, but day-of pacing needs another pass.");
    addCard(slide, 8.9, 4.0, 3.55, 1.55, "Move", "Publish a readiness primer, scoring explainer, and event-day flow map before kickoff.");
  });
  addStandardSlide(pptx, "Convergence 03", "Career bridges beat slogans.", "", "05", (slide) => {
    addCard(slide, 0.72, 3.78, 5.5, 2.35, "Student engagement asks", "");
    addLegendList(slide, studentEngagement, competitorN, 1.0, 4.42, 4.95, 1.35, 5);
    addQuote(slide, 6.65, 3.78, 5.55, 2.35, quote(freeAnswers(coachRows, "Employer Engagement").concat(freeAnswers(coachRows, "Improve Collaboration")), ["apprentice", "guest", "internship"]), "Coach employer signal");
  }, true);
  addStandardSlide(pptx, "Convergence 04", "Use the weekly engine.", "", "06", (slide) => {
    yesNoCards(slide, [
      { label: "Weekly training reach", yes: trainingYes },
      { label: "CyberNugget reach", yes: nuggetsYes },
    ], competitorN, 0.8, 4.05, 7.2);
    addCard(slide, 8.55, 4.05, 3.65, 1.35, "Opportunity", "Turn weekly resources into an always-on pathway rather than a pre-event reminder system.");
  });
  addStandardSlide(pptx, "Convergence 05", "Recognition matters.", "", "07", (slide) => {
    addQuote(slide, 0.72, 3.9, 5.7, 2.0, quote(freeAnswers(competitorRows, "How can we make it better?"), ["prize", "coin", "prestige"]), "Student recognition signal");
    addCard(slide, 6.78, 3.9, 5.42, 2.0, "Move", "Layer meaningful recognition into the experience: badges, certificates, team callouts, employer visibility, and tangible awards where feasible.");
  }, true);
  addStandardSlide(pptx, "Convergence 06", "CMCC can be the regional connector.", "", "08", (slide) => {
    const competitions = choiceCounts(competitorRows, "Competitions");
    addCard(slide, 0.72, 3.78, 5.5, 2.35, "Competition ecosystem", "");
    addLegendList(slide, competitions, competitorN, 1.0, 4.42, 4.95, 1.35, 5);
    addCard(slide, 6.65, 3.78, 5.55, 2.35, "Strategic role", "Connect classrooms, CTFs, employers, community colleges, and regional cyber careers into one visible ecosystem.");
  });
  addStandardSlide(pptx, "Close", "The surveys now read less like feedback and more like a roadmap.", "", "09", (slide) => {
    addCard(slide, 0.82, 4.0, 3.55, 1.55, "Practice ladder", "Beginner-to-advanced labs, recordings, walkthroughs, and certification-aligned resources.");
    addCard(slide, 4.86, 4.0, 3.55, 1.55, "Event clarity", "Scoring, challenge expectations, event-day pacing, and recognition designed before the day starts.");
    addCard(slide, 8.9, 4.0, 3.55, 1.55, "Opportunity bridge", "Employer workshops, guest talks, internships, apprenticeships, and field experiences.");
  }, true);
  return pptx;
}

async function fetchData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL or secret key in environment");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("survey_results")
    .select("id,type,submitted_at,results_jsonb")
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  const rows = parseRows(data ?? []);
  return {
    coach: rows.filter((row) => row.type === "coach"),
    competitor: rows.filter((row) => row.type === "competitor"),
  };
}

async function main() {
  if (!fs.existsSync(LOGO_PATH)) {
    if (!fs.existsSync(ORIGINAL_LOGO)) throw new Error(`Logo missing: ${LOGO_PATH}`);
    throw new Error(`Trimmed logo missing: ${LOGO_PATH}. Recreate it from ${ORIGINAL_LOGO}.`);
  }
  const { coach, competitor } = await fetchData();
  if (!coach.length || !competitor.length) throw new Error(`Expected survey rows, got coach=${coach.length}, competitor=${competitor.length}`);

  const decks = [
    { filename: "coach-survey-deck-2026.pptx", deck: buildCoachDeck(coach), slides: 10 },
    { filename: "competitor-survey-deck-2026.pptx", deck: buildCompetitorDeck(competitor), slides: 10 },
    { filename: "intersection-deck-2026.pptx", deck: buildIntersectionDeck(coach, competitor), slides: 9 },
  ];
  const results = [];
  for (const item of decks) {
    const out = path.join(SURVEY_DIR, item.filename);
    await item.deck.writeFile({ fileName: out });
    results.push({ file: out, slides: item.slides });
  }
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    rows: { coach: coach.length, competitor: competitor.length },
    outputs: results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
