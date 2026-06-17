#!/usr/bin/env node
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let pptxgen;
try {
  pptxgen = require("pptxgenjs");
} catch {
  pptxgen = require("/Users/scottyoung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pptxgenjs");
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "Operations-Analytics-CMCC-Branded.pptx");
const LOGO = path.join(ROOT, "docs", "Surveys", "brand-assets", "cmcc-2026-logo-trimmed.png");
const SHAPE = new pptxgen().ShapeType;
const CHART = new pptxgen().ChartType;
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
  pink: "F05FAE",
  purple: "A78BFA",
};
const FONT_HEAD = "Rajdhani";
const FONT_BODY = "Aptos";
const DATE = "Data as of May 18, 2026";

const data = {
  overview: [
    ["Active Coaches", 36],
    ["Registered Competitors", 545],
    ["Teams", 58],
    ["Schools on Map", 34],
  ],
  status: [
    ["In The Game", 264],
    ["In The Game (NC)", 166],
    ["Pending", 113],
    ["Profile", 2],
  ],
  compliance: [
    ["Not started", 180, "No agreement activity yet"],
    ["Sent", 96, "Awaiting signature / completion"],
    ["Complete", 269, "Digital or manual release on file"],
  ],
  division: [
    ["High School", 256],
    ["Traditional College", 85],
    ["Middle School", 83],
    ["ROP College", 8],
  ],
  gender: [
    ["Male", 337],
    ["Female", 84],
    ["Prefer not to say", 8],
    ["Other", 3],
  ],
  tech: [
    ["PC", 281],
    ["Chromebook", 72],
    ["Mac", 30],
    ["Linux", 29],
    ["Other", 20],
  ],
  race: [
    ["Hispanic", 152],
    ["White", 125],
    ["Asian", 79],
    ["Black", 46],
    ["Other", 23],
    ["Pacific", 5],
    ["Native", 2],
  ],
  ethnicity: [
    ["Not Hispanic", 222],
    ["Hispanic", 210],
  ],
  years: [
    ["< 1 year", 288],
    ["1-2 years", 109],
    ["3-4 years", 24],
    ["5+ years", 11],
  ],
  outside: {
    nonCtf: [["Before 9am", 947], ["School day", 3594], ["After 3pm", 2342], ["Weekend", 1279]],
    flash: [["Before 9am", 0], ["School day", 76], ["After 3pm", 372], ["Weekend", 4217]],
  },
  trend: {
    months: ["Nov 2025", "Dec 2025", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026"],
    nonCtf: [66, 3, 784, 2775, 2338, 1739, 131],
    flash: [0, 0, 37, 59, 41, 4244, 0],
  },
  topics: [
    ["Cryptography", 2832],
    ["Reconnaissance", 2626],
    ["Forensics", 1986],
    ["OSINT", 1123],
    ["Web Exploitation", 841],
    ["Social", 804],
    ["Reverse Eng.", 735],
    ["Operating Systems", 534],
    ["Miscellaneous", 280],
  ],
  divisionSolves: [
    ["High School", 6223],
    ["Traditional College", 4226],
    ["Middle School", 1473],
    ["ROP College", 125],
  ],
};

function pct(v, total) {
  return `${Math.round((v / total) * 100)}%`;
}

function fmt(v) {
  return new Intl.NumberFormat("en-US").format(v);
}

function makeDeck() {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "CMCC_WIDE", width: W, height: H });
  pptx.layout = "CMCC_WIDE";
  pptx.author = "Codex";
  pptx.company = "CMCC";
  pptx.subject = "Operations Analytics";
  pptx.title = "Operations Analytics CMCC Branded";
  pptx.theme = { headFontFace: FONT_HEAD, bodyFontFace: FONT_BODY, lang: "en-US" };
  return pptx;
}

function text(slide, s, x, y, w, h, o = {}) {
  const opts = {
    x, y, w, h,
    fontFace: o.fontFace ?? FONT_BODY,
    fontSize: o.fontSize ?? 14,
    bold: o.bold ?? false,
    color: o.color ?? C.ink,
    align: o.align ?? "left",
    valign: o.valign ?? "top",
    margin: o.margin ?? 0,
    fit: o.fit ?? "shrink",
  };
  slide.addText(String(s).replace(/[–—]/g, "-"), opts);
}

function bg(slide, dark = false) {
  slide.background = { color: dark ? C.black : C.cream };
  slide.addShape(SHAPE.rect, { x: 0, y: 0, w: 0.08, h: H, fill: { color: C.teal }, line: { color: C.teal } });
  slide.addShape(SHAPE.ellipse, { x: 9.72, y: -1.3, w: 4.7, h: 4.7, fill: { color: C.orange }, line: { color: C.orange } });
  slide.addShape(SHAPE.arc, {
    x: 9.85, y: 3.2, w: 5.2, h: 5.2,
    adjustPoint: 0.55,
    rotate: 20,
    line: { color: dark ? C.green : C.teal, transparency: dark ? 60 : 80, width: 18 },
    fill: { color: dark ? C.black : C.cream, transparency: 100 },
  });
}

function logo(slide, x = 0.52, y = 0.28, w = 1.42, dark = false) {
  const h = w / 1.866;
  if (dark) {
    slide.addShape(SHAPE.roundRect, { x: x - 0.06, y: y - 0.05, w: w + 0.12, h: h + 0.1, rectRadius: 0.04, fill: { color: C.white }, line: { color: C.white } });
  }
  slide.addImage({ path: LOGO, x, y, w, h });
}

function header(slide, section, dark = false) {
  logo(slide, 0.52, 0.28, 1.42, dark);
  text(slide, section.toUpperCase(), 2.15, 0.43, 4.8, 0.25, { fontFace: FONT_HEAD, fontSize: 12, bold: true, color: C.orange });
  text(slide, DATE.toUpperCase(), 9.75, 0.43, 2.7, 0.2, { fontFace: FONT_HEAD, fontSize: 9.5, bold: true, color: C.white, align: "right" });
}

function footer(slide, page, dark = false) {
  text(slide, "OPERATIONS ANALYTICS", 0.52, 7.07, 2.6, 0.16, { fontFace: FONT_HEAD, fontSize: 7.5, bold: true, color: dark ? "C8C8C8" : C.gray });
  text(slide, String(page).padStart(2, "0"), 12.0, 7.07, 0.45, 0.16, { fontFace: FONT_HEAD, fontSize: 7.5, bold: true, color: dark ? "C8C8C8" : C.gray, align: "right" });
}

function title(slide, t, sub, dark = false) {
  text(slide, t.toUpperCase(), 0.52, 1.35, 8.45, 1.45, { fontFace: FONT_HEAD, fontSize: 44, bold: true, color: dark ? C.white : C.ink });
  if (sub) text(slide, sub, 0.56, 3.02, 7.7, 0.55, { fontSize: 15.5, bold: true, color: dark ? "E8E8E8" : C.ink });
}

function card(slide, x, y, w, h, titleText, body = "", o = {}) {
  slide.addShape(SHAPE.roundRect, {
    x, y, w, h,
    rectRadius: 0.06,
    fill: { color: o.fill ?? C.white },
    line: { color: o.line ?? "D4D4D4", transparency: 8 },
    shadow: { type: "outer", color: "A0A0A0", opacity: 0.14, blur: 2, angle: 45, distance: 1 },
  });
  if (titleText) text(slide, titleText.toUpperCase(), x + 0.18, y + 0.16, w - 0.36, 0.28, { fontFace: FONT_HEAD, fontSize: o.titleSize ?? 17, bold: true, color: o.titleColor ?? C.teal });
  if (body) text(slide, body, x + 0.18, y + (titleText ? 0.55 : 0.18), w - 0.36, h - 0.65, { fontSize: o.bodySize ?? 11.5, bold: o.bodyBold ?? false, color: o.bodyColor ?? C.ink });
}

function stat(slide, x, y, w, h, value, label, note = "") {
  card(slide, x, y, w, h, "", "");
  text(slide, value, x + 0.18, y + 0.19, w - 0.36, 0.5, { fontFace: FONT_HEAD, fontSize: 31, bold: true, color: C.orange });
  text(slide, label.toUpperCase(), x + 0.18, y + 0.77, w - 0.36, 0.22, { fontFace: FONT_HEAD, fontSize: 11.5, bold: true, color: C.ink });
  if (note) text(slide, note, x + 0.18, y + 1.05, w - 0.36, 0.18, { fontSize: 9.5, color: C.gray });
}

function legendList(slide, items, total, x, y, w, h, limit = 8, colors = [C.green, C.teal, C.orange, C.pink, C.purple, C.ink, "8F8F8F", "BDBDBD"]) {
  const rows = items.slice(0, limit);
  const gap = 0.08;
  const rowH = (h - gap * Math.max(0, rows.length - 1)) / Math.max(1, rows.length);
  rows.forEach(([label, value], i) => {
    const yy = y + i * (rowH + gap);
    const color = colors[i % colors.length];
    slide.addShape(SHAPE.roundRect, { x, y: yy + 0.03, w: 0.16, h: 0.16, rectRadius: 0.03, fill: { color }, line: { color } });
    text(slide, label, x + 0.24, yy, w - 1.33, rowH, { fontSize: 9.5, bold: true, color: C.ink });
    slide.addShape(SHAPE.roundRect, { x: x + w - 1.02, y: yy - 0.01, w: 0.42, h: 0.23, rectRadius: 0.04, fill: { color }, line: { color } });
    text(slide, fmt(value), x + w - 1.12, yy + 0.045, 0.44, 0.1, { fontFace: FONT_HEAD, fontSize: 7.8, bold: true, color: C.white, align: "center" });
    text(slide, pct(value, total), x + w - 0.66, yy - 0.02, 0.66, 0.24, { fontFace: FONT_HEAD, fontSize: 16, bold: true, color: C.ink, align: "right" });
  });
}

function pieWithLegend(slide, titleText, items, total, x, y, w, h, colors = [C.green, C.teal, C.orange, C.pink, C.purple, C.gray, C.ink]) {
  card(slide, x, y, w, h, titleText, "");
  const chartW = w < 5.2 ? 1.75 : Math.min(2.75, w * 0.42);
  const chartH = Math.min(2.35, h - 0.55);
  const chartX = x + 0.2;
  const chartY = y + 0.55;
  slide.addChart(CHART.pie, [{
    name: titleText,
    labels: items.map(([label]) => label),
    values: items.map(([, value]) => value),
  }], {
    x: chartX,
    y: chartY,
    w: chartW,
    h: chartH,
    showLegend: false,
    showValue: false,
    showPercent: false,
    showTitle: false,
    firstSliceAng: 270,
    dataBorder: { color: C.white, pt: 1.2 },
    chartColors: colors,
    chartArea: { border: { color: C.white, pt: 0 }, roundedCorners: false },
    plotArea: { border: { color: C.white, pt: 0 }, fill: { color: C.white, transparency: 100 } },
  });
  legendList(slide, items, total, x + chartW + 0.45, y + 0.67, w - chartW - 0.72, h - 0.9, items.length, colors);
}

function horizontalBars(slide, items, total, x, y, w, h, limit = 8, colors = [C.green, C.teal, C.orange, C.pink, C.purple]) {
  const rows = items.slice(0, limit);
  const max = Math.max(...rows.map(([, v]) => v), 1);
  const rowH = h / rows.length;
  rows.forEach(([label, value], i) => {
    const yy = y + i * rowH;
    const color = colors[i % colors.length];
    text(slide, label, x, yy + 0.04, 1.65, 0.15, { fontSize: 8.8, bold: true, color: C.ink });
    slide.addShape(SHAPE.roundRect, { x: x + 1.75, y: yy + 0.05, w: w - 2.48, h: 0.16, rectRadius: 0.03, fill: { color: "D8D8D8" }, line: { color: "D8D8D8" } });
    slide.addShape(SHAPE.roundRect, { x: x + 1.75, y: yy + 0.05, w: Math.max(0.05, (w - 2.48) * value / max), h: 0.16, rectRadius: 0.03, fill: { color }, line: { color } });
    text(slide, fmt(value), x + w - 0.62, yy + 0.04, 0.6, 0.12, { fontFace: FONT_HEAD, fontSize: 8, bold: true, color: C.gray, align: "right" });
  });
}

function groupedHorizontalCompare(slide, categories, series, x, y, w, h) {
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const rowH = h / categories.length;
  const labelW = 1.55;
  const valueW = 0.55;
  const barW = w - labelW - valueW - 0.35;
  categories.forEach((cat, i) => {
    const yy = y + i * rowH;
    text(slide, cat, x, yy + 0.2, labelW, 0.2, { fontSize: 9, bold: true, color: C.ink });
    series.forEach((s, si) => {
      const by = yy + 0.12 + si * 0.24;
      slide.addShape(SHAPE.roundRect, { x: x + labelW + 0.12, y: by, w: barW, h: 0.14, rectRadius: 0.03, fill: { color: "D8D8D8" }, line: { color: "D8D8D8" } });
      slide.addShape(SHAPE.roundRect, { x: x + labelW + 0.12, y: by, w: Math.max(0.03, barW * s.values[i] / max), h: 0.14, rectRadius: 0.03, fill: { color: s.color }, line: { color: s.color } });
      text(slide, fmt(s.values[i]), x + labelW + 0.18 + barW, by - 0.01, valueW, 0.13, { fontFace: FONT_HEAD, fontSize: 8.4, bold: true, color: C.gray, align: "right" });
    });
  });
  series.forEach((s, i) => {
    const lx = x + labelW + 0.12 + i * 1.0;
    slide.addShape(SHAPE.roundRect, { x: lx, y: y + h + 0.12, w: 0.16, h: 0.16, rectRadius: 0.03, fill: { color: s.color }, line: { color: s.color } });
    text(slide, s.name, lx + 0.22, y + h + 0.1, 0.75, 0.16, { fontFace: FONT_HEAD, fontSize: 8.2, bold: true, color: C.ink });
  });
}

function groupedVertical(slide, categories, series, x, y, w, h) {
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const groupW = w / categories.length;
  categories.forEach((cat, i) => {
    text(slide, cat, x + i * groupW, y + h + 0.1, groupW, 0.16, { fontSize: 7.5, bold: true, color: C.gray, align: "center" });
    series.forEach((s, si) => {
      const bw = 0.18;
      const bh = h * s.values[i] / max;
      const bx = x + i * groupW + groupW / 2 - (series.length * bw + 0.04) / 2 + si * (bw + 0.04);
      const by = y + h - bh;
      slide.addShape(SHAPE.rect, { x: bx, y: by, w: bw, h: Math.max(0.02, bh), fill: { color: s.color }, line: { color: s.color } });
      if (s.values[i] > 0) text(slide, fmt(s.values[i]), bx - 0.06, by - 0.13, 0.32, 0.1, { fontFace: FONT_HEAD, fontSize: 6.4, bold: true, color: C.gray, align: "center" });
    });
  });
}

function lineChart(slide, labels, series, x, y, w, h) {
  slide.addChart(CHART.line, series.map((s) => ({
    name: s.name,
    labels,
    values: s.values,
  })), {
    x,
    y,
    w,
    h,
    showLegend: true,
    legendPos: "b",
    showValue: false,
    showTitle: false,
    chartColors: series.map((s) => s.color),
    lineSize: 2.5,
    lineSmooth: true,
    lineDataSymbol: "circle",
    lineDataSymbolSize: 5,
    catAxisLabelFontFace: FONT_HEAD,
    catAxisLabelFontSize: 8,
    catAxisLabelColor: C.gray,
    valAxisLabelFontFace: FONT_HEAD,
    valAxisLabelFontSize: 8,
    valAxisLabelColor: C.gray,
    valGridLine: { color: "D8D8D8", transparency: 20, size: 0.5 },
    catGridLine: { style: "none" },
    catAxisLineShow: false,
    valAxisLineShow: false,
    chartArea: { border: { color: C.white, pt: 0 }, roundedCorners: false },
    plotArea: { border: { color: C.white, pt: 0 }, fill: { color: C.white, transparency: 100 } },
  });
}

function takeawayChip(slide, n, label, body, x, y, w, h, color) {
  slide.addShape(SHAPE.roundRect, {
    x, y, w, h,
    rectRadius: 0.06,
    fill: { color: C.white },
    line: { color: "D6D6D6", transparency: 8 },
    shadow: { type: "outer", color: "000000", opacity: 0.18, blur: 2, angle: 45, distance: 1 },
  });
  slide.addShape(SHAPE.roundRect, { x: x + 0.18, y: y + 0.18, w: 0.42, h: 0.42, rectRadius: 0.05, fill: { color }, line: { color } });
  text(slide, String(n), x + 0.18, y + 0.245, 0.42, 0.14, { fontFace: FONT_HEAD, fontSize: 14, bold: true, color: C.white, align: "center" });
  text(slide, label.toUpperCase(), x + 0.75, y + 0.18, w - 0.95, 0.22, { fontFace: FONT_HEAD, fontSize: 14.5, bold: true, color });
  text(slide, body, x + 0.75, y + 0.52, w - 0.95, h - 0.62, { fontSize: 10.6, bold: true, color: C.ink });
}

function cover(pptx) {
  const slide = pptx.addSlide();
  bg(slide, true);
  logo(slide, 0.52, 0.32, 2.18, true);
  text(slide, "OPERATIONS ANALYTICS", 0.54, 1.55, 3.4, 0.26, { fontFace: FONT_HEAD, fontSize: 13, bold: true, color: C.orange });
  text(slide, "Coaches, competitors and game-platform engagement".toUpperCase(), 0.52, 2.05, 8.1, 1.35, { fontFace: FONT_HEAD, fontSize: 45, bold: true, color: C.white });
  card(slide, 0.54, 4.0, 7.5, 0.82, "", "A program-wide snapshot of enrollment, demographics, compliance, and cyber-challenge activity across all coaches.", { bodyBold: true, bodySize: 12.5 });
  stat(slide, 0.54, 5.35, 3.45, 1.1, "545", "competitors");
  stat(slide, 4.25, 5.35, 3.45, 1.1, "36", "coaches");
  stat(slide, 7.96, 5.35, 3.45, 1.1, "12,827", "challenges solved");
  footer(slide, 1, true);
}

function slideBase(pptx, section, page, t, sub, dark = false) {
  const slide = pptx.addSlide();
  bg(slide, dark);
  header(slide, section, dark);
  title(slide, t, sub, dark);
  footer(slide, page, dark);
  return slide;
}

function build() {
  const pptx = makeDeck();
  cover(pptx);

  let s = slideBase(pptx, "Overview", 2, "Program at a glance", "545 competitors across 36 coaches and 58 teams; 264 are fully in the game.");
  data.overview.forEach(([label, value], i) => stat(s, 0.7 + i * 3.05, 3.85, 2.7, 1.2, fmt(value), label));
  card(s, 0.7, 5.3, 11.35, 1.02, "Snapshot", "545 competitors across 36 coaches and 58 teams. 264 are fully \"in the game,\" and cyber engagement totals 12,827 solved challenges - 8,162 non-CTF and 4,665 Flash CTF.", { bodyBold: true, bodySize: 11.5 });

  s = slideBase(pptx, "Pipeline", 3, "Competitor status distribution", "The pipeline is split between fully active competitors, non-compliant in-game participants, and pending onboarding.");
  card(s, 0.75, 3.65, 7.0, 2.65, "Status mix", "");
  horizontalBars(s, data.status, 545, 1.05, 4.18, 6.45, 1.45, 4, [C.green, C.teal, C.orange, C.gray]);
  stat(s, 8.2, 3.65, 3.8, 0.74, "545", "Total competitors");
  stat(s, 8.2, 4.63, 3.8, 0.74, "264", "Fully compliant");
  stat(s, 8.2, 5.61, 3.8, 0.74, "113", "Pending onboarding");

  s = slideBase(pptx, "Compliance", 4, "Release and agreement pipeline", "Of 545 competitors, 269 have a completed release on file; 96 are in flight and 180 have not started.");
  data.compliance.forEach(([label, value, note], i) => stat(s, 0.75 + i * 4.1, 4.05, 3.6, 1.35, fmt(value), label, note));

  s = slideBase(pptx, "Enrollment", 5, "Division and college-track mix", "432 eligible competitors are concentrated in high school, with college and middle-school segments still material.");
  stat(s, 0.75, 3.75, 2.35, 1.25, "432", "Eligible competitors");
  pieWithLegend(s, "Division mix", data.division, 432, 3.35, 3.75, 8.55, 2.7, [C.green, C.teal, C.orange, C.gray]);

  s = slideBase(pptx, "Demographics", 6, "Gender and technology access", "The competitor base is heavily PC-oriented, with Chromebook, Mac, and Linux access also present.");
  pieWithLegend(s, "Gender identity", data.gender, 432, 0.75, 3.75, 5.55, 2.7, [C.teal, C.green, C.orange, C.gray]);
  pieWithLegend(s, "Technology access", data.tech, 432, 6.55, 3.75, 5.55, 2.7, [C.green, C.teal, C.orange, C.pink, C.gray]);

  s = slideBase(pptx, "Demographics", 7, "Race and ethnicity", "Race and ethnicity fields show a broad mix, with Hispanic identity represented both in race and ethnicity reporting.");
  pieWithLegend(s, "Race", data.race, 432, 0.75, 3.75, 6.35, 2.75, [C.pink, C.orange, C.teal, C.green, C.purple, C.ink, C.gray]);
  pieWithLegend(s, "Ethnicity", data.ethnicity, 432, 7.35, 3.75, 4.8, 2.75, [C.teal, C.orange]);

  s = slideBase(pptx, "Experience", 8, "Years participating", "92% of competitors are in their first two years, so onboarding and beginner pathways matter most.");
  card(s, 0.75, 3.75, 6.3, 2.55, "Participation history", "");
  legendList(s, data.years, 432, 1.05, 4.35, 5.55, 1.35, 4);
  stat(s, 7.55, 4.0, 3.9, 1.4, "92%", "first two years", "397 of 432 competitors");

  s = slideBase(pptx, "Engagement", 9, "Challenges solved: non-CTF vs CTF", "Self-paced labs and timed Flash CTF events show different after-hours patterns.");
  pieWithLegend(s, "Solve type mix", [["Non-CTF", 8162], ["Flash CTF", 4665]], 12827, 0.75, 3.75, 5.55, 2.7, [C.teal, C.pink]);
  pieWithLegend(s, "Outside-school solve mix", [["Non-CTF outside", 4568], ["Flash CTF outside", 4589]], 9157, 6.55, 3.75, 5.55, 2.7, [C.green, C.orange]);

  s = slideBase(pptx, "When learning happens", 10, "Outside-school-day engagement", "Nearly all Flash CTF activity, and a majority of non-CTF activity, happens on students' own time.");
  card(s, 0.75, 3.75, 11.25, 2.7, "Volume by time window", "");
  groupedHorizontalCompare(s, ["Before 9am", "School day", "After 3pm", "Weekend"], [
    { name: "Non-CTF", values: data.outside.nonCtf.map(([, v]) => v), color: C.teal },
    { name: "Flash CTF", values: data.outside.flash.map(([, v]) => v), color: C.pink },
  ], 1.1, 4.28, 10.45, 1.6);

  s = slideBase(pptx, "Trend", 11, "Challenge activity over time", "Flash CTF peaks at 4,244 solves in April during a major timed event.");
  card(s, 0.75, 3.45, 11.25, 3.0, "Monthly solves", "");
  lineChart(s, data.trend.months, [
    { name: "Non-CTF", values: data.trend.nonCtf, color: C.teal },
    { name: "Flash CTF", values: data.trend.flash, color: C.pink },
  ], 1.15, 4.0, 10.3, 1.75);

  s = slideBase(pptx, "What students solve", 12, "Challenge topic clustering", "Cryptography and reconnaissance lead the solved-topic mix across 12,827 total solves.");
  card(s, 0.75, 3.78, 11.25, 2.72, "Topic clusters", "");
  horizontalBars(s, data.topics, 12827, 1.08, 4.28, 10.35, 1.88, 9, [C.green, C.teal, C.orange, C.pink, C.purple]);

  s = slideBase(pptx, "Engagement detail", 13, "Solves by division and Flash CTF reach", "High school drives the largest share of solves; Flash CTF reach includes 271 unique participants.");
  card(s, 0.75, 3.7, 5.6, 2.55, "Challenges solved by division", "");
  horizontalBars(s, data.divisionSolves, 12047, 1.05, 4.35, 5.05, 1.35, 4, [C.green, C.teal, C.orange, C.gray]);
  stat(s, 6.8, 3.75, 4.6, 0.72, "271", "Unique Flash CTF participants");
  stat(s, 6.8, 4.75, 4.6, 0.72, "573", "Total Flash CTF event entries");
  stat(s, 6.8, 5.75, 4.6, 0.72, "2,446", "Non-CTF solves by non-CTF-only students");

  s = slideBase(pptx, "Key takeaways", 14, "What the data tells us", "", true);
  [
    ["Scale", "545 competitors and 36 coaches; 264 fully compliant and in the game."],
    ["Early-career base", "92% of competitors are in their first two years - beginner pathways are critical."],
    ["Compliance gap", "Only 49% have a completed release; 180 have not started."],
    ["Learning is after-hours", "56% of non-CTF and 98% of CTF solving happens outside school hours."],
    ["CTF is event-driven", "Flash CTF solves peak at 4,244 in April; 271 unique students have participated."],
  ].forEach(([label, body], i) => {
    const color = [C.teal, C.green, C.orange, C.pink, C.purple][i];
    const x = i < 4 ? 0.75 + (i % 2) * 5.75 : 3.62;
    const y = i < 4 ? 3.25 + Math.floor(i / 2) * 1.15 : 5.55;
    const w = i < 4 ? 5.25 : 6.1;
    takeawayChip(s, i + 1, label, body, x, y, w, 0.88, color);
  });

  return pptx;
}

build().writeFile({ fileName: OUT }).then(() => {
  console.log(JSON.stringify({ output: OUT }, null, 2));
}).catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
