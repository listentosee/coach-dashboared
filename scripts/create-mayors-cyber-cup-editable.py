from __future__ import annotations

import base64
import html
import math
from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = Path(
    "/Users/scottyoung/.codex/generated_images/019dd5b1-8a77-7de1-92e8-47d5b84e72ba/"
    "ig_07e841bcb18f11af0169f1140496b081908941e3d68827f562.png"
)
SVG_OUT = ROOT / "docs" / "mayors-cyber-cup-inland-empire-infographic-editable.svg"
PDF_OUT = ROOT / "docs" / "mayors-cyber-cup-inland-empire-infographic-editable.pdf"

W, H = 2550, 3300
M = 135


INK = "#1d222a"
SLATE = "#424852"
GOLD = "#e6a936"
ORANGE = "#d35b34"
TEAL = "#2b8e8e"
BLUE = "#3a65ac"
GREEN = "#568d57"
PLUM = "#895280"
PANEL = "#fffaf0"
PANEL_DARK = "#1f2631"
TRACK = "#e0e4df"


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def svg_text(
    x: float,
    y: float,
    text: str,
    size: int,
    weight: int = 700,
    fill: str = INK,
    anchor: str = "start",
    opacity: float | None = None,
) -> str:
    op = f' opacity="{opacity}"' if opacity is not None else ""
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" font-family="Arial, Helvetica, sans-serif" '
        f'font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="{fill}"{op}>'
        f"{esc(text)}</text>"
    )


def svg_rect(
    x: float,
    y: float,
    w: float,
    h: float,
    fill: str,
    rx: float = 0,
    stroke: str | None = None,
    sw: float = 1,
    opacity: float | None = None,
) -> str:
    stroke_attr = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    op = f' opacity="{opacity}"' if opacity is not None else ""
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx:.1f}" fill="{fill}"{stroke_attr}{op}/>'


def svg_section_title(x: int, y: int, title: str, accent: str, color: str = INK) -> list[str]:
    return [
        svg_rect(x, y + 8, 20, 48, accent, 8),
        svg_text(x + 36, y + 48, title.upper(), 42, 900, color),
    ]


def svg_percent_bar(x: int, y: int, width: int, label: str, value: int, accent: str, label_size: int = 25) -> list[str]:
    return [
        svg_text(x, y + label_size, label, label_size, 700, INK),
        svg_text(x + width, y + label_size, f"{value}%", label_size + 2, 900, INK, "end"),
        svg_rect(x, y + 42, width, 26, TRACK, 13),
        svg_rect(x, y + 42, max(8, width * value / 100), 26, accent, 13),
    ]


def svg_value_bar(x: int, y: int, width: int, label: str, value: int, max_value: int, accent: str) -> list[str]:
    filled = max(6, width * value / max_value) if max_value else 6
    if value == 0:
        filled = 6
    return [
        svg_text(x, y + 25, label, 25, 700, INK),
        svg_text(x + width, y + 25, f"{value:,}", 28, 900, INK, "end"),
        svg_rect(x, y + 36, width, 22, TRACK, 11),
        svg_rect(x, y + 36, filled, 22, accent, 11),
    ]


def svg_card(x: int, y: int, w: int, h: int, title: str, accent: str, fill: str = PANEL, title_color: str = INK) -> list[str]:
    return [
        svg_rect(x, y, w, h, fill, 28, "#ffffff", 2, 0.92 if fill == PANEL else 0.9),
        svg_rect(x + 38, y + 38, 20, 48, accent, 8),
        svg_text(x + 74, y + 78, title.upper(), 42, 900, title_color),
    ]


def svg_stacked_breakout(x: int, y: int, width: int) -> list[str]:
    segments = [("Before", 893, TEAL), ("After", 2306, ORANGE), ("Weekend", 1126, BLUE)]
    total = sum(v for _, v, _ in segments)
    items = [svg_text(x, y + 18, "Outside school day breakout", 18, 400, "#c9d0c7")]
    bar_y = y + 30
    cursor = x
    for idx, (label, value, accent) in enumerate(segments):
        seg_w = width * value / total if idx < len(segments) - 1 else x + width - cursor
        pct = round(value / total * 100)
        items.append(svg_rect(cursor, bar_y, seg_w, 58, accent, 0))
        items.append(svg_text(cursor + seg_w / 2, bar_y + 40, f"{label} {pct}%", 22, 900, "#fffcf2", "middle"))
        items.append(svg_text(cursor + seg_w / 2, bar_y + 104, f"{value:,}", 28, 900, "#f5f0df", "middle"))
        cursor += seg_w
    items.append(svg_rect(x, bar_y, width, 58, "none", 22, "#000000", 0, 0))
    return items


def build_svg() -> str:
    with BACKGROUND.open("rb") as f:
        encoded_bg = base64.b64encode(f.read()).decode("ascii")

    parts: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="8.5in" height="11in" viewBox="0 0 {W} {H}">',
        "<title>Inland Empire Mayors Cyber Cup Infographic</title>",
        "<desc>Editable infographic source. Text, cards, and chart shapes are SVG elements.</desc>",
        f'<image href="data:image/png;base64,{encoded_bg}" x="0" y="0" width="{W}" height="{H}" preserveAspectRatio="xMidYMid slice" opacity="0.82"/>',
        svg_rect(0, 0, W, H, "#f7efdb", 0, opacity=0.72),
        svg_rect(0, 0, W, 1040, "#1a1f28", 0, opacity=0.18),
        svg_rect(0, 1040, W, H - 1040, "#f8f2e6", 0, opacity=0.9),
    ]
    for i in range(0, W, 28):
        alpha = 0.12 if i % 56 == 0 else 0.06
        parts.append(f'<line x1="{i}" y1="0" x2="{i + H // 2}" y2="{H}" stroke="#38424e" stroke-width="2" opacity="{alpha}"/>')

    parts.extend(
        [
            "<g id=\"title-block\">",
            svg_rect(M, 112, W - 2 * M, 363, PANEL_DARK, 36, "#ffffff", 2, 0.94),
            svg_text(M + 62, 205, "INLAND EMPIRE", 48, 900, GOLD),
            svg_text(M + 62, 350, "Mayors Cyber Cup", 132, 900, "#fffbec"),
            svg_text(M + 66, 445, "A one-page story of school reach, access, and student cyber momentum", 42, 700, "#e9e5d6"),
            "</g>",
        ]
    )

    metric_y = 542
    gap = 34
    metric_w = (W - 2 * M - 2 * gap) // 3
    for i, (label, value, accent) in enumerate([("Participating Coaches", "34", TEAL), ("Competitors", "510", ORANGE), ("Teams", "51", BLUE)]):
        x = M + i * (metric_w + gap)
        parts.extend(
            [
                f'<g id="hero-metric-{i + 1}">',
                svg_rect(x, metric_y, metric_w, 285, "#fffae8", 30, accent, 5, 0.93),
                svg_text(x + 44, metric_y + 81, label.upper(), 31, 700, SLATE),
                svg_text(x + 44, metric_y + 220, value, 106, 900, accent),
                "</g>",
            ]
        )

    parts.extend(
        [
            svg_rect(M, 875, W - 2 * M, 180, "#fffbec", 28, "#e1d2af", 2, 0.93),
            svg_text(M + 60, 947, "Students across Riverside and San Bernardino counties showed up in teams, solved real cyber challenges, and", 39, 700, INK),
            svg_text(M + 60, 995, "kept learning before school, after school, and on weekends.", 39, 700, INK),
        ]
    )

    card_y = 1110
    card_h = 575
    left_w = 720
    mid_w = 630
    right_w = W - 2 * M - left_w - mid_w - 2 * gap
    parts.extend(svg_card(M, card_y, left_w, card_h, "Enrollment Mix", TEAL))
    x1, y1, x2 = M + 42, card_y + 108, M + left_w - 42
    y = y1
    for label, pct, accent in [("High School", 58, TEAL), ("Traditional College", 21, BLUE), ("Middle School", 19, ORANGE), ("ROP College", 2, PLUM)]:
        parts.extend(svg_percent_bar(x1, y, x2 - x1, label, pct, accent))
        y += 84

    cx = M + left_w + gap
    parts.extend(svg_card(cx, card_y, mid_w, card_h, "County Reach", ORANGE))
    x1, y1, x2 = cx + 42, card_y + 108, cx + mid_w - 42
    for idx, (label, pct, accent) in enumerate([("Riverside", 64, ORANGE), ("San Bernardino", 36, BLUE)]):
        py = y1 + idx * 202
        parts.extend([svg_rect(x1, py, x2 - x1, 168, "#f5efe0", 24, accent, 4, 0.95), svg_text(x1 + 34, py + 93, label, 39, 900, INK), svg_text(x2 - 34, py + 105, f"{pct}%", 66, 900, accent, "end")])
    parts.append(svg_text(x1, card_y + card_h - 45, "County percentages include records with county values.", 24, 400, "#5b5349"))

    rx = cx + mid_w + gap
    parts.extend(svg_card(rx, card_y, right_w, card_h, "Years In Program", GREEN))
    x1, y1, x2 = rx + 42, card_y + 108, rx + right_w - 42
    y = y1
    for label, pct, accent in [("Less than 1 year", 67, GREEN), ("1 to 2 years", 24, TEAL), ("3 to 4 years", 6, ORANGE), ("5 or more years", 3, PLUM)]:
        parts.extend(svg_percent_bar(x1, y, x2 - x1, label, pct, accent, 24))
        y += 84

    low_y = 1735
    low_h = 650
    demo_w = 1120
    parts.extend(svg_card(M, low_y, demo_w, low_h, "Demographics", PLUM))
    x1, y1, x2 = M + 42, low_y + 108, M + demo_w - 42
    col_gap = 36
    col_w = (x2 - x1 - col_gap) // 2
    parts.append(svg_text(x1, y1 + 30, "Gender Identity", 30, 900, INK))
    y = y1 + 48
    for label, pct, accent in [("Male", 78, BLUE), ("Female", 20, ORANGE), ("Prefer Not To Say", 2, PLUM), ("Other", 1, TEAL)]:
        parts.extend(svg_percent_bar(x1, y, col_w, label, pct, accent, 21))
        y += 84
    parts.append(svg_text(x1 + col_w + col_gap, y1 + 30, "Ethnicity", 30, 900, INK))
    y = y1 + 48
    for label, pct, accent in [("Not Hispanic", 53, GREEN), ("Hispanic", 47, ORANGE)]:
        parts.extend(svg_percent_bar(x1 + col_w + col_gap, y, col_w, label, pct, accent, 23))
        y += 84
    race_y = low_y + 462
    parts.append(svg_text(x1, race_y + 30, "Race", 30, 900, INK))
    chip_x, chip_y = x1, race_y + 48
    for label, pct, accent, chip_w in [
        ("Hispanic", 34, ORANGE, 190),
        ("White", 30, BLUE, 154),
        ("Asian", 19, TEAL, 154),
        ("Black", 9, PLUM, 138),
        ("Other", 6, GREEN, 138),
        ("Pacific", 1, GOLD, 154),
        ("Native", 1, "#7d5c3e", 146),
    ]:
        if chip_x + chip_w > x2:
            chip_x = x1
            chip_y += 58
        parts.append(svg_rect(chip_x, chip_y, chip_w, 42, accent, 21))
        parts.append(svg_text(chip_x + 17, chip_y + 30, f"{label} {pct}%", 24, 700, "#fffcf2"))
        chip_x += chip_w + 16

    ax = M + demo_w + gap
    access_w = W - 2 * M - demo_w - gap
    parts.extend(svg_card(ax, low_y, access_w, low_h, "Technology Access", BLUE))
    x1, y1, x2 = ax + 42, low_y + 108, ax + access_w - 42
    y = y1
    for label, pct, accent in [("PC", 65, BLUE), ("Chromebook", 16, GREEN), ("Mac", 8, PLUM), ("Linux", 7, TEAL), ("Other", 4, ORANGE), ("Intermediate", 0, GOLD)]:
        parts.extend(svg_percent_bar(x1, y, x2 - x1, label, pct, accent, 24))
        y += 84

    bottom_y = 2435
    bottom_h = 720
    engage_w = 1045
    parts.extend(svg_card(M, bottom_y, engage_w, bottom_h, "Game Platform Engagement", GOLD, PANEL_DARK, "#f5f0df"))
    x1, y1, x2 = M + 42, bottom_y + 108, M + engage_w - 42
    y = y1
    for label, value in [("Total Challenges Solved", "7,840"), ("Linked Competitors", "390"), ("Outside School Day Activity", "4,325")]:
        parts.append(svg_text(x1, y + 31, label, 31, 700, "#f5f0df"))
        parts.append(svg_text(x2, y + 31, value, 37, 900, GOLD, "end"))
        y += 58
    parts.extend(svg_stacked_breakout(x1, y - 4, x2 - x1))
    y += 128
    for label, value in [("Flash CTF Participants", "103"), ("Flash CTF Entries", "155")]:
        parts.append(svg_text(x1, y + 31, label, 31, 700, "#f5f0df"))
        parts.append(svg_text(x2, y + 31, value, 37, 900, GOLD, "end"))
        y += 58

    charts_x = M + engage_w + gap
    parts.extend(svg_card(charts_x, bottom_y, W - M - charts_x, bottom_h, "Division Results", ORANGE))
    x1, y1, x2 = charts_x + 42, bottom_y + 108, W - M - 42
    parts.append(svg_text(x1, y1 + 31, "Challenge Solves", 31, 900, INK))
    y = y1 + 44
    for label, value, accent in [("High School", 4085, ORANGE), ("Traditional College", 2739, BLUE), ("Middle School", 976, TEAL), ("ROP College", 70, PLUM)]:
        parts.extend(svg_value_bar(x1, y, x2 - x1, label, value, 4085, accent))
        y += 70
    y += 28
    parts.append(svg_text(x1, y + 31, "Flash CTF By Division", 31, 900, INK))
    y += 46
    for label, value, accent in [("High School", 55, ORANGE), ("Traditional College", 38, BLUE), ("Middle School", 10, TEAL), ("ROP College", 0, PLUM)]:
        parts.extend(svg_value_bar(x1, y, x2 - x1, label, value, 55, accent))
        y += 70

    parts.append(svg_text(W / 2, H - 54, "Source data summarized from the two Mayors Cyber Cup image-generation prompt files in docs/.", 22, 400, "#524e46", "middle"))
    parts.append("</svg>")
    return "\n".join(parts)


def hex_color(value: str) -> colors.Color:
    value = value.lstrip("#")
    return colors.HexColor(f"#{value}")


def pdf_text(c: canvas.Canvas, x: float, y: float, text: str, size: int, weight: int = 700, fill: str = INK, anchor: str = "start") -> None:
    font_name = "Helvetica-Bold" if weight >= 700 else "Helvetica"
    c.setFont(font_name, size * SCALE)
    c.setFillColor(hex_color(fill))
    px, py = x * SCALE, (H - y) * SCALE
    if anchor in {"end", "middle"}:
        width = stringWidth(text, font_name, size * SCALE)
        if anchor == "end":
            px -= width
        else:
            px -= width / 2
    c.drawString(px, py, text)


def pdf_rect(c: canvas.Canvas, x: float, y: float, w: float, h: float, fill: str, rx: float = 0, stroke: str | None = None, sw: float = 1, alpha: float = 1) -> None:
    c.saveState()
    c.setFillColor(hex_color(fill))
    c.setFillAlpha(alpha)
    if stroke:
        c.setStrokeColor(hex_color(stroke))
        c.setLineWidth(sw * SCALE)
    else:
        c.setStrokeColor(hex_color(fill))
        c.setLineWidth(0)
    c.roundRect(x * SCALE, (H - y - h) * SCALE, w * SCALE, h * SCALE, rx * SCALE, stroke=1 if stroke else 0, fill=1)
    c.restoreState()


SCALE = letter[0] / W


def build_pdf() -> None:
    c = canvas.Canvas(str(PDF_OUT), pagesize=letter)
    with Image.open(BACKGROUND) as img:
        bg_w, bg_h = img.size
    page_w, page_h = letter
    c.drawImage(str(BACKGROUND), 0, 0, width=page_w, height=page_h, preserveAspectRatio=True, mask=None)
    pdf_rect(c, 0, 0, W, H, "#f7efdb", alpha=0.72)
    pdf_rect(c, 0, 0, W, 1040, "#1a1f28", alpha=0.18)
    pdf_rect(c, 0, 1040, W, H - 1040, "#f8f2e6", alpha=0.9)

    # This PDF keeps text and vector shapes editable. It intentionally mirrors the SVG structure.
    # It omits the faint diagonal texture lines to keep object selection cleaner.
    pdf_rect(c, M, 112, W - 2 * M, 363, PANEL_DARK, 36, "#ffffff", 2, 0.94)
    pdf_text(c, M + 62, 205, "INLAND EMPIRE", 48, 900, GOLD)
    pdf_text(c, M + 62, 350, "Mayors Cyber Cup", 132, 900, "#fffbec")
    pdf_text(c, M + 66, 445, "A one-page story of school reach, access, and student cyber momentum", 42, 700, "#e9e5d6")

    def r(x, y, w, h, fill, rx=0, stroke=None, sw=1, alpha=1):
        pdf_rect(c, x, y, w, h, fill, rx, stroke, sw, alpha)

    def t(x, y, text, size, weight=700, fill=INK, anchor="start"):
        pdf_text(c, x, y, text, size, weight, fill, anchor)

    metric_y = 542
    gap = 34
    metric_w = (W - 2 * M - 2 * gap) // 3
    for i, (label, value, accent) in enumerate([("Participating Coaches", "34", TEAL), ("Competitors", "510", ORANGE), ("Teams", "51", BLUE)]):
        x = M + i * (metric_w + gap)
        r(x, metric_y, metric_w, 285, "#fffae8", 30, accent, 5, 0.93)
        t(x + 44, metric_y + 81, label.upper(), 31, 700, SLATE)
        t(x + 44, metric_y + 220, value, 106, 900, accent)

    r(M, 875, W - 2 * M, 180, "#fffbec", 28, "#e1d2af", 2, 0.93)
    t(M + 60, 947, "Students across Riverside and San Bernardino counties showed up in teams, solved real cyber challenges, and", 39)
    t(M + 60, 995, "kept learning before school, after school, and on weekends.", 39)

    def section(x, y, title, accent, title_color=INK):
        r(x + 38, y + 38, 20, 48, accent, 8)
        t(x + 74, y + 78, title.upper(), 42, 900, title_color)

    def card(x, y, w, h, title, accent, fill=PANEL, title_color=INK):
        r(x, y, w, h, fill, 28, "#ffffff", 2, 0.92 if fill == PANEL else 0.9)
        section(x, y, title, accent, title_color)

    def pct_bar(x, y, width, label, value, accent, size=25):
        t(x, y + size, label, size)
        t(x + width, y + size, f"{value}%", size + 2, 900, INK, "end")
        r(x, y + 42, width, 26, TRACK, 13)
        r(x, y + 42, max(8, width * value / 100), 26, accent, 13)

    card_y, card_h, left_w, mid_w = 1110, 575, 720, 630
    right_w = W - 2 * M - left_w - mid_w - 2 * gap
    card(M, card_y, left_w, card_h, "Enrollment Mix", TEAL)
    x1, y1, x2 = M + 42, card_y + 108, M + left_w - 42
    y = y1
    for label, pct, accent in [("High School", 58, TEAL), ("Traditional College", 21, BLUE), ("Middle School", 19, ORANGE), ("ROP College", 2, PLUM)]:
        pct_bar(x1, y, x2 - x1, label, pct, accent)
        y += 84

    cx = M + left_w + gap
    card(cx, card_y, mid_w, card_h, "County Reach", ORANGE)
    x1, y1, x2 = cx + 42, card_y + 108, cx + mid_w - 42
    for idx, (label, pct, accent) in enumerate([("Riverside", 64, ORANGE), ("San Bernardino", 36, BLUE)]):
        py = y1 + idx * 202
        r(x1, py, x2 - x1, 168, "#f5efe0", 24, accent, 4, 0.95)
        t(x1 + 34, py + 93, label, 39, 900)
        t(x2 - 34, py + 105, f"{pct}%", 66, 900, accent, "end")
    t(x1, card_y + card_h - 45, "County percentages include records with county values.", 24, 400, "#5b5349")

    rx = cx + mid_w + gap
    card(rx, card_y, right_w, card_h, "Years In Program", GREEN)
    x1, y1, x2 = rx + 42, card_y + 108, rx + right_w - 42
    y = y1
    for label, pct, accent in [("Less than 1 year", 67, GREEN), ("1 to 2 years", 24, TEAL), ("3 to 4 years", 6, ORANGE), ("5 or more years", 3, PLUM)]:
        pct_bar(x1, y, x2 - x1, label, pct, accent, 24)
        y += 84

    low_y, low_h, demo_w = 1735, 650, 1120
    card(M, low_y, demo_w, low_h, "Demographics", PLUM)
    x1, y1, x2 = M + 42, low_y + 108, M + demo_w - 42
    col_gap = 36
    col_w = (x2 - x1 - col_gap) // 2
    t(x1, y1 + 30, "Gender Identity", 30, 900)
    y = y1 + 48
    for label, pct, accent in [("Male", 78, BLUE), ("Female", 20, ORANGE), ("Prefer Not To Say", 2, PLUM), ("Other", 1, TEAL)]:
        pct_bar(x1, y, col_w, label, pct, accent, 21)
        y += 84
    t(x1 + col_w + col_gap, y1 + 30, "Ethnicity", 30, 900)
    y = y1 + 48
    for label, pct, accent in [("Not Hispanic", 53, GREEN), ("Hispanic", 47, ORANGE)]:
        pct_bar(x1 + col_w + col_gap, y, col_w, label, pct, accent, 23)
        y += 84
    race_y = low_y + 462
    t(x1, race_y + 30, "Race", 30, 900)
    chip_x, chip_y = x1, race_y + 48
    for label, pct, accent, chip_w in [("Hispanic", 34, ORANGE, 190), ("White", 30, BLUE, 154), ("Asian", 19, TEAL, 154), ("Black", 9, PLUM, 138), ("Other", 6, GREEN, 138), ("Pacific", 1, GOLD, 154), ("Native", 1, "#7d5c3e", 146)]:
        if chip_x + chip_w > x2:
            chip_x, chip_y = x1, chip_y + 58
        r(chip_x, chip_y, chip_w, 42, accent, 21)
        t(chip_x + 17, chip_y + 30, f"{label} {pct}%", 24, 700, "#fffcf2")
        chip_x += chip_w + 16

    ax = M + demo_w + gap
    access_w = W - 2 * M - demo_w - gap
    card(ax, low_y, access_w, low_h, "Technology Access", BLUE)
    x1, y1, x2 = ax + 42, low_y + 108, ax + access_w - 42
    y = y1
    for label, pct, accent in [("PC", 65, BLUE), ("Chromebook", 16, GREEN), ("Mac", 8, PLUM), ("Linux", 7, TEAL), ("Other", 4, ORANGE), ("Intermediate", 0, GOLD)]:
        pct_bar(x1, y, x2 - x1, label, pct, accent, 24)
        y += 84

    bottom_y, bottom_h, engage_w = 2435, 720, 1045
    card(M, bottom_y, engage_w, bottom_h, "Game Platform Engagement", GOLD, PANEL_DARK, "#f5f0df")
    x1, y1, x2 = M + 42, bottom_y + 108, M + engage_w - 42
    y = y1
    for label, value in [("Total Challenges Solved", "7,840"), ("Linked Competitors", "390"), ("Outside School Day Activity", "4,325")]:
        t(x1, y + 31, label, 31, 700, "#f5f0df")
        t(x2, y + 31, value, 37, 900, GOLD, "end")
        y += 58
    t(x1, y + 14, "Outside school day breakout", 18, 400, "#c9d0c7")
    bar_y = y + 30
    cursor = x1
    for idx, (label, value, accent) in enumerate([("Before", 893, TEAL), ("After", 2306, ORANGE), ("Weekend", 1126, BLUE)]):
        seg_w = (x2 - x1) * value / 4325 if idx < 2 else x2 - cursor
        r(cursor, bar_y, seg_w, 58, accent, 0)
        t(cursor + seg_w / 2, bar_y + 40, f"{label} {round(value / 4325 * 100)}%", 22, 900, "#fffcf2", "middle")
        t(cursor + seg_w / 2, bar_y + 104, f"{value:,}", 28, 900, "#f5f0df", "middle")
        cursor += seg_w
    y += 128
    for label, value in [("Flash CTF Participants", "103"), ("Flash CTF Entries", "155")]:
        t(x1, y + 31, label, 31, 700, "#f5f0df")
        t(x2, y + 31, value, 37, 900, GOLD, "end")
        y += 58

    charts_x = M + engage_w + gap
    card(charts_x, bottom_y, W - M - charts_x, bottom_h, "Division Results", ORANGE)
    x1, y1, x2 = charts_x + 42, bottom_y + 108, W - M - 42
    t(x1, y1 + 31, "Challenge Solves", 31, 900)
    y = y1 + 44
    for label, value, accent in [("High School", 4085, ORANGE), ("Traditional College", 2739, BLUE), ("Middle School", 976, TEAL), ("ROP College", 70, PLUM)]:
        t(x1, y + 25, label, 25)
        t(x2, y + 25, f"{value:,}", 28, 900, INK, "end")
        r(x1, y + 36, x2 - x1, 22, TRACK, 11)
        r(x1, y + 36, max(6, (x2 - x1) * value / 4085), 22, accent, 11)
        y += 70
    y += 28
    t(x1, y + 31, "Flash CTF By Division", 31, 900)
    y += 46
    for label, value, accent in [("High School", 55, ORANGE), ("Traditional College", 38, BLUE), ("Middle School", 10, TEAL), ("ROP College", 0, PLUM)]:
        t(x1, y + 25, label, 25)
        t(x2, y + 25, f"{value:,}", 28, 900, INK, "end")
        r(x1, y + 36, x2 - x1, 22, TRACK, 11)
        r(x1, y + 36, 6 if value == 0 else max(6, (x2 - x1) * value / 55), 22, accent, 11)
        y += 70

    t(W / 2, H - 54, "Source data summarized from the two Mayors Cyber Cup image-generation prompt files in docs/.", 22, 400, "#524e46", "middle")
    c.showPage()
    c.save()


def main() -> None:
    SVG_OUT.write_text(build_svg(), encoding="utf-8")
    build_pdf()
    print(SVG_OUT)
    print(PDF_OUT)


if __name__ == "__main__":
    main()
