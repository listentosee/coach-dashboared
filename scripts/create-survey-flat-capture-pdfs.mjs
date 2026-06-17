#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SURVEY_DIR = path.join(ROOT, "docs", "Surveys");
const OUT_ROOT = path.join(SURVEY_DIR, "flat-captures");

const DECKS = [
  "coach-survey-deck-2026",
  "competitor-survey-deck-2026",
  "intersection-deck-2026",
];

const CHROME_EXECUTABLE = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORT = { width: 1280, height: 720 };
const DEVICE_SCALE_FACTOR = 2;

async function ensureCleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function captureDeck(browser, deck) {
  const htmlPath = path.join(SURVEY_DIR, `${deck}.html`);
  const frameDir = path.join(OUT_ROOT, deck);
  await ensureCleanDir(frameDir);

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });
  const page = await context.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts?.ready);
  await page.addStyleTag({
    content: `
      html, body { width: 100vw !important; height: 100vh !important; overflow: hidden !important; }
      .deck-chrome, .nav, .progress, .print-nav { display: none !important; }
      .slide, .slide * { transition: none !important; animation: none !important; }
    `,
  });

  const slideCount = await page.evaluate(() => document.querySelectorAll(".slide").length);
  const framePaths = [];

  for (let i = 0; i < slideCount; i += 1) {
    await page.evaluate((index) => {
      const slides = Array.from(document.querySelectorAll(".slide"));
      slides.forEach((slide, slideIndex) => {
        slide.classList.toggle("active", slideIndex === index);
        slide.style.display = slideIndex === index ? "flex" : "none";
        slide.style.opacity = "1";
        slide.style.position = "absolute";
        slide.style.inset = "0";
      });
    }, i);
    await page.waitForTimeout(80);
    const framePath = path.join(frameDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
    await page.screenshot({ path: framePath, fullPage: false });
    framePaths.push(framePath);
  }

  await context.close();
  return framePaths;
}

async function buildPdf(deck, framePaths) {
  const pdf = await PDFDocument.create();
  for (const framePath of framePaths) {
    const bytes = await fs.readFile(framePath);
    const png = await pdf.embedPng(bytes);
    const page = pdf.addPage([VIEWPORT.width, VIEWPORT.height]);
    page.drawImage(png, {
      x: 0,
      y: 0,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
    });
  }
  const outPath = path.join(SURVEY_DIR, `${deck}-flat-capture.pdf`);
  await fs.writeFile(outPath, await pdf.save());
  return outPath;
}

async function main() {
  await fs.mkdir(OUT_ROOT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_EXECUTABLE,
  });
  const results = [];
  try {
    for (const deck of DECKS) {
      const frames = await captureDeck(browser, deck);
      const pdf = await buildPdf(deck, frames);
      results.push({ deck, frames: frames.length, frameDir: path.dirname(frames[0]), pdf });
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
