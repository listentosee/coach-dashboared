#!/usr/bin/env python3
"""Create rational editable survey deck PDFs from the HTML slide sources.

The browser-generated PDFs are visually close to the HTML, but Adobe editing
tools tend to fragment the text into tiny word-level objects. This script reads
the same slide content and redraws it as a simpler page layout with intentional
text blocks using Adobe Standard 14 fonts.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from lxml import html
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
SURVEY_DIR = ROOT / "docs" / "Surveys"
PAGE_W = 1280
PAGE_H = 720
MARGIN = 56

BG = colors.HexColor("#060b1a")
PANEL = colors.HexColor("#0d1530")
PANEL_2 = colors.HexColor("#131c3a")
LINE = colors.Color(1, 1, 1, alpha=0.18)
TEXT = colors.HexColor("#f2f5f7")
MUTED = colors.HexColor("#aab5c8")
DIM = colors.HexColor("#6f7c91")
ORANGE = colors.HexColor("#ff6b00")
GREEN = colors.HexColor("#01ab69")
MAGENTA = colors.HexColor("#c10fff")
YELLOW = colors.HexColor("#ffcd57")

FONT_BODY = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_MONO = "Courier"


DECKS = [
    "competitor-survey-deck-2026",
    "coach-survey-deck-2026",
    "intersection-deck-2026",
]


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    replacements = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2026": "...",
        "\u00a0": " ",
        "\u00b7": ".",
        "\u2265": ">=",
        "\u2192": "->",
        "\u25c2": "<",
        "\u25b8": ">",
        "\u27f7": "<->",
        "\u21ba": "Home",
    }
    for src, dest in replacements.items():
        value = value.replace(src, dest)
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\s+([.,;:!?])", r"\1", value)
    return value


def node_text(node) -> str:
    parts: list[str] = []

    def walk(el) -> None:
        if el.text:
            parts.append(el.text)
        for child in el:
            if getattr(child, "tag", "").lower() == "br":
                parts.append(" ")
            else:
                walk(child)
            if child.tail:
                parts.append(child.tail)

    walk(node)
    return clean_text(" ".join(parts))


def select(node, selector: str) -> list:
    """Tiny selector helper for the static selectors used in these files."""
    results = []
    for part in selector.split(","):
        part = part.strip()
        if not part:
            continue
        current = [node]
        for token in part.split():
            next_nodes = []
            for parent in current:
                if token.startswith("."):
                    cls = token[1:]
                    xpath = (
                        ".//*[contains(concat(' ', normalize-space(@class), ' '), "
                        f"' {cls} ')]"
                    )
                elif "." in token:
                    tag, cls = token.split(".", 1)
                    xpath = (
                        f".//{tag}[contains(concat(' ', normalize-space(@class), ' '), "
                        f"' {cls} ')]"
                    )
                else:
                    xpath = f".//{token}"
                next_nodes.extend(parent.xpath(xpath))
            current = next_nodes
        results.extend(current)
    return results


def first_text(node, selector: str) -> str:
    found = select(node, selector)
    return node_text(found[0]) if found else ""


def all_texts(node, selector: str) -> list[str]:
    return [node_text(item) for item in select(node, selector) if node_text(item)]


def safe_int(value: str, default: int = 0) -> int:
    match = re.search(r"\d+", value or "")
    return int(match.group(0)) if match else default


def wrap_lines(text: str, font: str, size: float, width: float) -> list[str]:
    words = clean_text(text).split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if pdfmetrics.stringWidth(candidate, font, size) <= width:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word
    if current:
        lines.append(current)
    return lines


def draw_text_block(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    width: float,
    *,
    font: str = FONT_BODY,
    size: float = 17,
    leading: float | None = None,
    fill=TEXT,
    max_lines: int | None = None,
) -> float:
    lines = wrap_lines(text, font, size, width)
    if max_lines is not None and len(lines) > max_lines:
        lines = lines[:max_lines]
        if lines:
            lines[-1] = lines[-1].rstrip(". ") + "..."
    if not lines:
        return y
    leading = leading or size * 1.28
    c.setFillColor(fill)
    t = c.beginText(x, y)
    t.setFont(font, size)
    t.setLeading(leading)
    for line in lines:
        t.textLine(line)
    c.drawText(t)
    return y - leading * len(lines)


def draw_label(c: canvas.Canvas, text: str, x: float, y: float, color=ORANGE) -> float:
    return draw_text_block(
        c,
        text.upper(),
        x,
        y,
        PAGE_W - (2 * MARGIN),
        font=FONT_MONO,
        size=11,
        leading=15,
        fill=color,
        max_lines=1,
    )


def draw_title(c: canvas.Canvas, text: str, x: float, y: float, width: float, *, size=44) -> float:
    return draw_text_block(
        c,
        text.upper(),
        x,
        y,
        width,
        font=FONT_BOLD,
        size=size,
        leading=size * 0.95,
        fill=TEXT,
        max_lines=4,
    )


def panel(c: canvas.Canvas, x: float, y: float, w: float, h: float, accent=ORANGE, fill=PANEL) -> None:
    c.setFillColor(fill)
    c.setStrokeColor(LINE)
    c.setLineWidth(1)
    c.rect(x, y, w, h, fill=1, stroke=1)
    c.setFillColor(accent)
    c.rect(x, y, 5, h, fill=1, stroke=0)


@dataclass
class Stat:
    label: str
    value: str
    sub: str


@dataclass
class Item:
    title: str
    body: str = ""
    value: str = ""


@dataclass
class Slide:
    eyebrow: str
    title: str
    ledes: list[str]
    straps: list[Item]
    stats: list[Stat]
    rows: list[Item]
    quotes: list[Item]
    takeaways: list[Item]
    action: Item | None
    stack: list[Item]


def parse_slides(path: Path) -> list[Slide]:
    doc = html.fromstring(path.read_text(encoding="utf-8"))
    slides = []
    for section in select(doc, "section.slide"):
        title = first_text(section, "h1") or first_text(section, "h2")
        eyebrow = first_text(section, ".eyebrow")

        ledes = []
        for selector in [".lede", ".title-block .sub", ".narrative p", ".pulled"]:
            ledes.extend(all_texts(section, selector))

        straps = []
        for cell in select(section, ".strap .cell"):
            straps.append(Item(first_text(cell, ".k"), value=first_text(cell, ".v")))

        stats = []
        for stat in select(section, ".stat"):
            stats.append(Stat(first_text(stat, ".label"), first_text(stat, ".figure"), first_text(stat, ".sub")))

        rows = []
        for row in select(section, ".ranked-row"):
            rows.append(Item(first_text(row, ".label"), value=first_text(row, ".n") or first_text(row, ".rank")))
        for row in select(section, ".chip"):
            rows.append(Item(first_text(row, ".lab"), value=first_text(row, ".nx")))
        for row in select(section, ".bar-row"):
            rows.append(Item(first_text(row, ".q"), body=first_text(row, ".n"), value=first_text(row, ".avg")))
        for row in select(section, ".yn"):
            rows.append(Item(first_text(row, ".q"), body=first_text(row, ".det"), value=first_text(row, ".pct")))

        quotes = []
        for quote in select(section, ".quote, .quote-mini"):
            who_nodes = select(quote, ".who")
            who = node_text(who_nodes[0]) if who_nodes else ""
            for who_node in who_nodes:
                who_node.drop_tree()
            quotes.append(Item(node_text(quote), value=who))

        takeaways = []
        for card in select(section, ".takeaway"):
            number = first_text(card, ".num")
            heading = first_text(card, "h3")
            body = first_text(card, "p")
            takeaways.append(Item(f"{number} {heading}".strip(), body=body))

        action = None
        action_nodes = select(section, ".axn-action")
        if action_nodes:
            action = Item(first_text(action_nodes[0], ".lab"), body=first_text(action_nodes[0], ".move"))

        stack = []
        for row in select(section, ".stack-row"):
            stack.append(Item(first_text(row, ".title"), body=first_text(row, ".desc"), value=first_text(row, ".num")))

        slides.append(Slide(eyebrow, title, ledes, straps, stats, rows, quotes, takeaways, action, stack))
    return slides


def draw_background(c: canvas.Canvas, deck_name: str, page_num: int, total: int) -> None:
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setStrokeColor(colors.Color(1, 1, 1, alpha=0.05))
    c.setLineWidth(0.5)
    for x in range(0, PAGE_W, 64):
        c.line(x, 0, x, PAGE_H)
    for y in range(0, PAGE_H, 64):
        c.line(0, y, PAGE_W, y)
    c.setFillColor(DIM)
    c.setFont(FONT_MONO, 9)
    c.drawString(MARGIN, 24, clean_text(deck_name).upper())
    c.drawRightString(PAGE_W - MARGIN, 24, f"{page_num:02d} / {total:02d}")


def draw_cover(c: canvas.Canvas, slide: Slide) -> None:
    y = PAGE_H - 70
    y = draw_label(c, slide.eyebrow, MARGIN, y)
    y -= 58
    y = draw_title(c, slide.title, MARGIN, y, 820, size=78)
    y -= 22
    if slide.ledes:
        draw_text_block(c, slide.ledes[0], MARGIN, y, 760, font=FONT_BODY, size=22, leading=30, fill=MUTED, max_lines=4)
    if slide.straps:
        card_w = (PAGE_W - 2 * MARGIN - 36) / 4
        y0 = 88
        for i, item in enumerate(slide.straps):
            x = MARGIN + i * (card_w + 12)
            panel(c, x, y0, card_w, 92, accent=[GREEN, ORANGE, MAGENTA, YELLOW][i % 4], fill=PANEL_2)
            draw_text_block(c, item.title.upper(), x + 18, y0 + 64, card_w - 36, font=FONT_MONO, size=9, fill=DIM, max_lines=1)
            draw_text_block(c, item.value, x + 18, y0 + 38, card_w - 36, font=FONT_BOLD, size=23, fill=TEXT, max_lines=1)


def draw_stats_slide(c: canvas.Canvas, slide: Slide) -> None:
    y = PAGE_H - 72
    y = draw_label(c, slide.eyebrow, MARGIN, y)
    y -= 18
    y = draw_title(c, slide.title, MARGIN, y, 520, size=43)
    y -= 18
    for lede in slide.ledes[:2]:
        y = draw_text_block(c, lede, MARGIN, y, 540, size=17, leading=23, fill=MUTED, max_lines=5) - 10

    card_w = 275
    card_h = 205
    start_x = PAGE_W - MARGIN - (card_w * 2 + 18)
    start_y = PAGE_H - 128
    for i, stat in enumerate(slide.stats[:4]):
        x = start_x + (i % 2) * (card_w + 18)
        y0 = start_y - (i // 2) * (card_h + 18) - card_h
        panel(c, x, y0, card_w, card_h, accent=[GREEN, ORANGE, MAGENTA, YELLOW][i % 4])
        draw_text_block(c, stat.label.upper(), x + 20, y0 + card_h - 28, card_w - 38, font=FONT_MONO, size=9, fill=DIM, max_lines=2)
        draw_text_block(c, stat.value, x + 20, y0 + card_h - 72, card_w - 38, font=FONT_BOLD, size=34, leading=35, fill=TEXT, max_lines=3)
        draw_text_block(c, stat.sub, x + 20, y0 + 52, card_w - 38, size=13, leading=17, fill=MUTED, max_lines=3)


def draw_rows_slide(c: canvas.Canvas, slide: Slide) -> None:
    y = PAGE_H - 72
    y = draw_label(c, slide.eyebrow, MARGIN, y)
    y -= 18
    y = draw_title(c, slide.title, MARGIN, y, PAGE_W - 2 * MARGIN, size=42)
    y -= 12
    for lede in slide.ledes[:2]:
        y = draw_text_block(c, lede, MARGIN, y, 900, size=16, leading=22, fill=MUTED, max_lines=3) - 8

    rows = slide.rows[:12]
    max_value = max([safe_int(r.value) for r in rows] or [1])
    y0 = y - 8
    row_h = min(42, max(28, (y0 - 78) / max(1, len(rows))))
    for i, row in enumerate(rows):
        yy = y0 - i * row_h
        c.setFillColor(colors.Color(1, 1, 1, alpha=0.06 if i % 2 == 0 else 0.03))
        c.rect(MARGIN, yy - row_h + 7, PAGE_W - 2 * MARGIN, row_h - 3, fill=1, stroke=0)
        draw_text_block(c, f"{i + 1:02d}", MARGIN + 14, yy - 8, 40, font=FONT_MONO, size=12, fill=DIM, max_lines=1)
        draw_text_block(c, row.title, MARGIN + 70, yy - 8, 620, size=15, fill=TEXT, max_lines=1)
        bar_x = MARGIN + 720
        bar_w = 310
        val = safe_int(row.value)
        if val:
            c.setFillColor(colors.Color(1, 1, 1, alpha=0.08))
            c.rect(bar_x, yy - 20, bar_w, 9, fill=1, stroke=0)
            c.setFillColor(ORANGE)
            c.rect(bar_x, yy - 20, bar_w * (val / max_value), 9, fill=1, stroke=0)
        draw_text_block(c, row.value, PAGE_W - MARGIN - 90, yy - 8, 90, font=FONT_BOLD, size=18, fill=ORANGE, max_lines=1)
        if row.body:
            draw_text_block(c, row.body, PAGE_W - MARGIN - 190, yy - 8, 100, font=FONT_MONO, size=9, fill=DIM, max_lines=1)


def draw_sentiment_slide(c: canvas.Canvas, slide: Slide) -> None:
    y = PAGE_H - 72
    y = draw_label(c, slide.eyebrow, MARGIN, y)
    y -= 18
    y = draw_title(c, slide.title, MARGIN, y, 520, size=40)
    y -= 16
    for lede in slide.ledes[:4]:
        y = draw_text_block(c, lede, MARGIN, y, 535, size=14.5, leading=19, fill=MUTED) - 9

    x = 670
    card_w = PAGE_W - MARGIN - x
    quote_y = PAGE_H - 118
    available_h = quote_y - 70
    q_count = max(1, len(slide.quotes[:4]))
    card_h = min(118, (available_h - (q_count - 1) * 14) / q_count)
    for i, quote in enumerate(slide.quotes[:4]):
        y0 = quote_y - (i + 1) * card_h - i * 14
        panel(c, x, y0, card_w, card_h, accent=[ORANGE, MAGENTA, YELLOW, GREEN][i % 4], fill=PANEL)
        draw_text_block(c, quote.title, x + 22, y0 + card_h - 24, card_w - 44, size=12.2, leading=15.5, fill=TEXT)
        if quote.value:
            draw_text_block(c, quote.value.upper(), x + 22, y0 + 21, card_w - 44, font=FONT_MONO, size=8.5, fill=DIM, max_lines=1)


def draw_takeaways_slide(c: canvas.Canvas, slide: Slide) -> None:
    y = PAGE_H - 72
    y = draw_label(c, slide.eyebrow, MARGIN, y)
    y -= 18
    draw_title(c, slide.title, MARGIN, y, PAGE_W - 2 * MARGIN, size=40)
    cards = slide.takeaways or slide.stack
    cols = 3 if len(cards) <= 6 else 2
    card_w = (PAGE_W - 2 * MARGIN - (cols - 1) * 18) / cols
    card_h = 176 if cols == 3 else 70
    start_y = PAGE_H - 214
    for i, item in enumerate(cards[:8]):
        col = i % cols
        row = i // cols
        x = MARGIN + col * (card_w + 18)
        y0 = start_y - row * (card_h + 18) - card_h
        panel(c, x, y0, card_w, card_h, accent=[ORANGE, GREEN, MAGENTA, YELLOW][i % 4], fill=PANEL)
        number = item.value or item.title.split(" ", 1)[0]
        title = item.title if item.value else item.title.split(" ", 1)[-1]
        draw_text_block(c, number, x + 18, y0 + card_h - 24, 42, font=FONT_BOLD, size=18, fill=ORANGE, max_lines=1)
        draw_text_block(c, title.upper(), x + 62, y0 + card_h - 22, card_w - 80, font=FONT_BOLD, size=15, leading=17, fill=TEXT, max_lines=2)
        draw_text_block(c, item.body, x + 18, y0 + card_h - 72, card_w - 36, size=12.5, leading=16.5, fill=MUTED, max_lines=5 if cols == 3 else 2)


def draw_action_slide(c: canvas.Canvas, slide: Slide) -> None:
    y = PAGE_H - 72
    y = draw_label(c, slide.eyebrow, MARGIN, y, color=MAGENTA)
    y -= 18
    y = draw_title(c, slide.title, MARGIN, y, PAGE_W - 2 * MARGIN, size=39)
    y -= 12
    if slide.ledes:
        y = draw_text_block(c, slide.ledes[0], MARGIN, y, PAGE_W - 2 * MARGIN, size=16, fill=MUTED, max_lines=2) - 12

    col_w = (PAGE_W - 2 * MARGIN - 34) / 2
    top = y
    for i, label in enumerate(["COACHES SAID", "STUDENTS SAID"]):
        x = MARGIN + i * (col_w + 34)
        panel(c, x, 210, col_w, top - 210, accent=GREEN if i == 0 else ORANGE, fill=PANEL)
        draw_text_block(c, label, x + 22, top - 30, col_w - 44, font=FONT_MONO, size=10, fill=GREEN if i == 0 else ORANGE, max_lines=1)
        texts = slide.ledes[1 + i : 2 + i]
        if texts:
            draw_text_block(c, texts[0], x + 22, top - 60, col_w - 44, size=15, leading=21, fill=TEXT, max_lines=5)
        if i < len(slide.quotes):
            draw_text_block(c, f'"{slide.quotes[i].title}"', x + 22, 295, col_w - 44, size=13, leading=18, fill=MUTED, max_lines=4)

    if slide.action:
        panel(c, MARGIN, 76, PAGE_W - 2 * MARGIN, 104, accent=MAGENTA, fill=PANEL_2)
        draw_text_block(c, slide.action.title.upper(), MARGIN + 22, 150, 130, font=FONT_MONO, size=10, fill=MAGENTA, max_lines=1)
        draw_text_block(c, slide.action.body, MARGIN + 166, 150, PAGE_W - 2 * MARGIN - 190, font=FONT_BOLD, size=15.5, leading=19, fill=TEXT)


def draw_generic_slide(c: canvas.Canvas, slide: Slide) -> None:
    if slide.straps:
        draw_cover(c, slide)
    elif slide.stats:
        draw_stats_slide(c, slide)
    elif slide.action:
        draw_action_slide(c, slide)
    elif slide.takeaways or slide.stack:
        draw_takeaways_slide(c, slide)
    elif slide.rows and len(slide.rows) >= 3:
        draw_rows_slide(c, slide)
    elif slide.quotes:
        draw_sentiment_slide(c, slide)
    else:
        y = PAGE_H - 72
        y = draw_label(c, slide.eyebrow, MARGIN, y)
        y -= 22
        y = draw_title(c, slide.title, MARGIN, y, PAGE_W - 2 * MARGIN, size=48) - 20
        for lede in slide.ledes[:6]:
            y = draw_text_block(c, lede, MARGIN, y, PAGE_W - 2 * MARGIN, size=18, leading=25, fill=MUTED, max_lines=5) - 14


def make_pdf(deck: str) -> Path:
    src = SURVEY_DIR / f"{deck}.html"
    out = SURVEY_DIR / f"{deck}-rational-editable.pdf"
    slides = parse_slides(src)
    c = canvas.Canvas(str(out), pagesize=(PAGE_W, PAGE_H), pageCompression=0)
    c.setTitle(f"{deck} - rational editable")
    c.setAuthor("Mayors Cyber Cup")
    c.setSubject("Rational editable PDF export using Adobe Standard 14 fonts")
    total = len(slides)
    for i, slide in enumerate(slides, start=1):
        draw_background(c, deck, i, total)
        draw_generic_slide(c, slide)
        c.showPage()
    c.save()
    return out


def main(argv: Iterable[str]) -> int:
    decks = list(argv) or DECKS
    for deck in decks:
        out = make_pdf(deck)
        print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
