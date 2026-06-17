from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = Path(
    "/Users/scottyoung/.codex/generated_images/019dd5b1-8a77-7de1-92e8-47d5b84e72ba/"
    "ig_07e841bcb18f11af0169f1140496b081908941e3d68827f562.png"
)
OUT = ROOT / "docs" / "mayors-cyber-cup-inland-empire-infographic.png"
PDF_OUT = ROOT / "docs" / "mayors-cyber-cup-inland-empire-infographic.pdf"

W, H = 2550, 3300
M = 135

FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"


def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    path = FONT_REGULAR
    if weight == "bold":
        path = FONT_BOLD
    elif weight == "black":
        path = FONT_BLACK
    return ImageFont.truetype(path, size)


def rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, int, int, int] | tuple[int, int, int],
    outline: tuple[int, int, int, int] | tuple[int, int, int] | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def fit_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_width: int,
    start_size: int,
    weight: str = "regular",
    min_size: int = 18,
) -> ImageFont.FreeTypeFont:
    size = start_size
    while size >= min_size:
        fnt = font(size, weight)
        if text_size(draw, text, fnt)[0] <= max_width:
            return fnt
        size -= 2
    return font(min_size, weight)


def draw_label_value(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    label: str,
    value: str,
    max_width: int,
    color: tuple[int, int, int],
    value_color: tuple[int, int, int],
) -> int:
    label_font = fit_text(draw, label.upper(), max_width, 31, "bold", 22)
    value_font = fit_text(draw, value, max_width, 92, "black", 44)
    draw.text((x, y), value, font=value_font, fill=value_color)
    _, value_h = text_size(draw, value, value_font)
    draw.text((x, y + value_h + 8), label.upper(), font=label_font, fill=color)
    _, label_h = text_size(draw, label.upper(), label_font)
    return value_h + label_h + 8


def wrap_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    fnt: ImageFont.FreeTypeFont,
    max_width: int,
) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        test = f"{line} {word}".strip()
        if text_size(draw, test, fnt)[0] <= max_width:
            line = test
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def draw_section_title(draw: ImageDraw.ImageDraw, x: int, y: int, title: str, accent: tuple[int, int, int]) -> None:
    rounded_rect(draw, (x, y + 8, x + 20, y + 56), 8, accent)
    draw.text((x + 36, y), title.upper(), font=font(42, "black"), fill=(35, 38, 45))


def draw_percent_bar(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    width: int,
    label: str,
    value: int,
    accent: tuple[int, int, int],
    label_size: int = 25,
) -> int:
    label_font = fit_text(draw, label, width - 100, label_size, "bold", 18)
    draw.text((x, y), label, font=label_font, fill=(38, 42, 50))
    val = f"{value}%"
    val_font = font(label_size + 2, "black")
    val_w, _ = text_size(draw, val, val_font)
    draw.text((x + width - val_w, y - 2), val, font=val_font, fill=(35, 38, 45))
    bar_y = y + 42
    rounded_rect(draw, (x, bar_y, x + width, bar_y + 26), 13, (225, 230, 224))
    filled = max(8, int(width * value / 100))
    rounded_rect(draw, (x, bar_y, x + filled, bar_y + 26), 13, accent)
    return 84


def draw_value_bar(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    width: int,
    label: str,
    value: int,
    max_value: int,
    accent: tuple[int, int, int],
) -> int:
    row_font = fit_text(draw, label, width - 220, 27, "bold", 19)
    value_text = f"{value:,}"
    val_font = font(30, "black")
    draw.text((x, y), label, font=row_font, fill=(39, 42, 48))
    val_w, _ = text_size(draw, value_text, val_font)
    draw.text((x + width - val_w, y - 2), value_text, font=val_font, fill=(36, 40, 46))
    bar_y = y + 42
    rounded_rect(draw, (x, bar_y, x + width, bar_y + 26), 13, (224, 228, 226))
    filled = max(8, int(width * value / max_value)) if max_value else 8
    rounded_rect(draw, (x, bar_y, x + filled, bar_y + 26), 13, accent)
    return 82


def draw_card(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    title: str,
    fill: tuple[int, int, int, int],
    accent: tuple[int, int, int],
    title_color: tuple[int, int, int] = (35, 38, 45),
) -> tuple[int, int, int, int]:
    rounded_rect(draw, box, 28, fill, (255, 255, 255, 150), 2)
    x1, y1, x2, _ = box
    rounded_rect(draw, (x1 + 38, y1 + 38, x1 + 58, y1 + 86), 8, accent)
    draw.text((x1 + 74, y1 + 30), title.upper(), font=font(42, "black"), fill=title_color)
    return x1 + 42, y1 + 108, x2 - 42, box[3] - 34


def draw_compact_value_bar(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    width: int,
    label: str,
    value: int,
    max_value: int,
    accent: tuple[int, int, int],
) -> int:
    row_font = fit_text(draw, label, width - 145, 25, "bold", 17)
    value_text = f"{value:,}"
    val_font = font(28, "black")
    draw.text((x, y), label, font=row_font, fill=(39, 42, 48))
    val_w, _ = text_size(draw, value_text, val_font)
    draw.text((x + width - val_w, y - 2), value_text, font=val_font, fill=(36, 40, 46))
    bar_y = y + 36
    rounded_rect(draw, (x, bar_y, x + width, bar_y + 22), 11, (224, 228, 226))
    filled = max(6, int(width * value / max_value)) if max_value else 6
    if value == 0:
        filled = 6
    rounded_rect(draw, (x, bar_y, x + filled, bar_y + 22), 11, accent)
    return 70


def draw_stacked_breakout_bar(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    width: int,
    segments: list[tuple[str, int, tuple[int, int, int]]],
) -> int:
    total = sum(value for _, value, _ in segments)
    bar_h = 58
    label_font = font(22, "black")
    value_font = font(28, "black")
    note_font = font(18, "regular")
    draw.text((x, y), "Outside school day breakout", font=note_font, fill=(201, 208, 199))
    bar_y = y + 30

    cursor = x
    for idx, (label, value, accent) in enumerate(segments):
        if idx == len(segments) - 1:
            seg_w = x + width - cursor
        else:
            seg_w = round(width * value / total)
        pct = round(value / total * 100)
        radius = 22
        if idx == 0:
            draw.rounded_rectangle((cursor, bar_y, cursor + seg_w, bar_y + bar_h), radius=radius, fill=accent)
            if seg_w > radius:
                draw.rectangle((cursor + radius, bar_y, cursor + seg_w, bar_y + bar_h), fill=accent)
        elif idx == len(segments) - 1:
            draw.rounded_rectangle((cursor, bar_y, cursor + seg_w, bar_y + bar_h), radius=radius, fill=accent)
            if seg_w > radius:
                draw.rectangle((cursor, bar_y, cursor + seg_w - radius, bar_y + bar_h), fill=accent)
        else:
            draw.rectangle((cursor, bar_y, cursor + seg_w, bar_y + bar_h), fill=accent)

        text = f"{label} {pct}%"
        segment_font = fit_text(draw, text, max(24, seg_w - 22), 22, "black", 15)
        text_w, text_h = text_size(draw, text, segment_font)
        draw.text((cursor + (seg_w - text_w) // 2, bar_y + (bar_h - text_h) // 2 - 2), text, font=segment_font, fill=(255, 252, 242))

        value_text = f"{value:,}"
        value_w, _ = text_size(draw, value_text, value_font)
        draw.text((cursor + (seg_w - value_w) // 2, bar_y + bar_h + 12), value_text, font=value_font, fill=(245, 240, 223))
        cursor += seg_w

    return 132


def cover_resize(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    src_w, src_h = img.size
    dst_w, dst_h = size
    scale = max(dst_w / src_w, dst_h / src_h)
    new_size = (math.ceil(src_w * scale), math.ceil(src_h * scale))
    resized = img.resize(new_size, Image.Resampling.LANCZOS)
    left = (new_size[0] - dst_w) // 2
    top = (new_size[1] - dst_h) // 2
    return resized.crop((left, top, left + dst_w, top + dst_h))


def add_overlay(base: Image.Image) -> Image.Image:
    overlay = Image.new("RGBA", (W, H), (246, 239, 224, 0))
    od = ImageDraw.Draw(overlay, "RGBA")
    od.rectangle((0, 0, W, H), fill=(247, 239, 219, 214))
    od.rectangle((0, 0, W, 1040), fill=(26, 31, 40, 74))
    od.rectangle((0, 1040, W, H), fill=(248, 242, 230, 226))
    for i in range(0, W, 28):
        alpha = 16 if i % 56 == 0 else 8
        od.line((i, 0, i + H // 2, H), fill=(56, 66, 78, alpha), width=2)
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def main() -> None:
    bg = cover_resize(Image.open(BACKGROUND).convert("RGB"), (W, H))
    bg = bg.filter(ImageFilter.GaussianBlur(1.1))
    canvas = add_overlay(bg)
    draw = ImageDraw.Draw(canvas, "RGBA")

    ink = (29, 34, 42)
    slate = (66, 72, 82)
    gold = (230, 169, 54)
    orange = (211, 91, 52)
    teal = (43, 142, 142)
    blue = (58, 101, 172)
    green = (86, 141, 87)
    plum = (137, 82, 128)
    panel = (255, 252, 242, 224)
    panel_dark = (31, 38, 49, 220)

    # Top title block.
    rounded_rect(draw, (M, 112, W - M, 475), 36, panel_dark, (255, 255, 255, 110), 2)
    draw.text((M + 62, 150), "INLAND EMPIRE", font=font(48, "black"), fill=gold)
    title = "Mayors Cyber Cup"
    title_font = fit_text(draw, title, W - 2 * M - 124, 132, "black", 76)
    title_xy = (M + 62, 205)
    draw.text(title_xy, title, font=title_font, fill=(255, 251, 236))
    subtitle = "A one-page story of school reach, access, and student cyber momentum"
    sub_font = fit_text(draw, subtitle, W - 2 * M - 124, 42, "bold", 28)
    title_box = draw.textbbox(title_xy, title, font=title_font)
    sub_w, sub_h = text_size(draw, subtitle, sub_font)
    sub_y = title_box[3] + (475 - title_box[3] - sub_h) // 2
    draw.text((M + 66, sub_y), subtitle, font=sub_font, fill=(233, 229, 214))

    # Hero metrics.
    metric_y = 542
    gap = 34
    metric_w = (W - 2 * M - 2 * gap) // 3
    metrics = [("Participating Coaches", "34", teal), ("Competitors", "510", orange), ("Teams", "51", blue)]
    for i, (label, value, accent) in enumerate(metrics):
        x = M + i * (metric_w + gap)
        rounded_rect(draw, (x, metric_y, x + metric_w, metric_y + 285), 30, (255, 250, 232, 232), accent, 5)
        label_font = fit_text(draw, label.upper(), metric_w - 88, 31, "bold", 22)
        value_font = fit_text(draw, value, metric_w - 88, 106, "black", 52)
        draw.text((x + 44, metric_y + 52), label.upper(), font=label_font, fill=slate)
        draw.text((x + 44, metric_y + 106), value, font=value_font, fill=accent)

    # Story statement.
    story_y = 875
    rounded_rect(draw, (M, story_y, W - M, story_y + 180), 28, (255, 251, 236, 230), (225, 210, 175, 180), 2)
    story_font = font(39, "bold")
    story = (
        "Students across Riverside and San Bernardino counties showed up in teams, solved real "
        "cyber challenges, and kept learning before school, after school, and on weekends."
    )
    lines = wrap_text(draw, story, story_font, W - 2 * M - 120)
    for idx, line in enumerate(lines[:3]):
        draw.text((M + 60, story_y + 36 + idx * 48), line, font=story_font, fill=ink)

    # Middle cards.
    card_y = 1110
    card_h = 575
    left_w = 720
    mid_w = 630
    right_w = W - 2 * M - left_w - mid_w - 2 * gap

    x1, y1, x2, _ = draw_card(draw, (M, card_y, M + left_w, card_y + card_h), "Enrollment Mix", panel, teal)
    enrollment = [("High School", 58, teal), ("Traditional College", 21, blue), ("Middle School", 19, orange), ("ROP College", 2, plum)]
    y = y1
    for label, pct, accent in enrollment:
        y += draw_percent_bar(draw, x1, y, x2 - x1, label, pct, accent)

    cx = M + left_w + gap
    x1, y1, x2, _ = draw_card(draw, (cx, card_y, cx + mid_w, card_y + card_h), "County Reach", panel, orange)
    county_w = x2 - x1
    pill_h = 168
    for idx, (label, pct, accent) in enumerate([("Riverside", 64, orange), ("San Bernardino", 36, blue)]):
        py = y1 + idx * (pill_h + 34)
        rounded_rect(draw, (x1, py, x2, py + pill_h), 24, (245, 239, 224, 230), accent, 4)
        draw.text((x1 + 34, py + 34), label, font=fit_text(draw, label, county_w - 205, 39, "black"), fill=ink)
        pct_font = font(66, "black")
        pct_text = f"{pct}%"
        pct_w, _ = text_size(draw, pct_text, pct_font)
        draw.text((x2 - pct_w - 34, py + 45), pct_text, font=pct_font, fill=accent)
    note = "County percentages include records with county values."
    note_font = font(24, "regular")
    draw.text((x1, card_y + card_h - 66), note, font=note_font, fill=(91, 83, 73))

    rx = cx + mid_w + gap
    x1, y1, x2, _ = draw_card(draw, (rx, card_y, W - M, card_y + card_h), "Years In Program", panel, green)
    years = [("Less than 1 year", 67, green), ("1 to 2 years", 24, teal), ("3 to 4 years", 6, orange), ("5 or more years", 3, plum)]
    y = y1
    for label, pct, accent in years:
        y += draw_percent_bar(draw, x1, y, x2 - x1, label, pct, accent, 24)

    # Demographics and access.
    low_y = 1735
    low_h = 650
    demo_w = 1120
    access_w = W - 2 * M - demo_w - gap
    x1, y1, x2, _ = draw_card(draw, (M, low_y, M + demo_w, low_y + low_h), "Demographics", panel, plum)

    col_gap = 36
    col_w = (x2 - x1 - col_gap) // 2
    gender = [("Male", 78, blue), ("Female", 20, orange), ("Prefer Not To Say", 2, plum), ("Other", 1, teal)]
    ethnicity = [("Not Hispanic", 53, green), ("Hispanic", 47, orange)]
    race = [("Hispanic", 34, orange), ("White", 30, blue), ("Asian", 19, teal), ("Black", 9, plum), ("Other", 6, green), ("Pacific", 1, gold), ("Native", 1, (125, 92, 62))]
    draw.text((x1, y1), "Gender Identity", font=font(30, "black"), fill=ink)
    y = y1 + 48
    for label, pct, accent in gender:
        y += draw_percent_bar(draw, x1, y, col_w, label, pct, accent, 21)
    draw.text((x1 + col_w + col_gap, y1), "Ethnicity", font=font(30, "black"), fill=ink)
    y = y1 + 48
    for label, pct, accent in ethnicity:
        y += draw_percent_bar(draw, x1 + col_w + col_gap, y, col_w, label, pct, accent, 23)
    race_y = low_y + 462
    draw.text((x1, race_y), "Race", font=font(30, "black"), fill=ink)
    chip_x = x1
    chip_y = race_y + 48
    for label, pct, accent in race:
        chip = f"{label} {pct}%"
        chip_font = fit_text(draw, chip, 260, 24, "bold", 18)
        chip_w = text_size(draw, chip, chip_font)[0] + 34
        if chip_x + chip_w > x2:
            chip_x = x1
            chip_y += 58
        rounded_rect(draw, (chip_x, chip_y, chip_x + chip_w, chip_y + 42), 21, accent)
        draw.text((chip_x + 17, chip_y + 8), chip, font=chip_font, fill=(255, 252, 242))
        chip_x += chip_w + 16

    ax = M + demo_w + gap
    x1, y1, x2, _ = draw_card(draw, (ax, low_y, W - M, low_y + low_h), "Technology Access", panel, blue)
    access = [("PC", 65, blue), ("Chromebook", 16, green), ("Mac", 8, plum), ("Linux", 7, teal), ("Other", 4, orange), ("Intermediate", 0, gold)]
    y = y1
    for label, pct, accent in access:
        y += draw_percent_bar(draw, x1, y, x2 - x1, label, pct, accent, 24)

    # Engagement and challenge solves.
    bottom_y = 2435
    bottom_h = 720
    engage_w = 1045
    x1, y1, x2, _ = draw_card(
        draw,
        (M, bottom_y, M + engage_w, bottom_y + bottom_h),
        "Game Platform Engagement",
        (31, 38, 49, 228),
        gold,
        (245, 240, 223),
    )
    engagement = [
        ("Total Challenges Solved", "7,840"),
        ("Linked Competitors", "390"),
        ("Outside School Day Activity", "4,325"),
    ]
    y = y1 - 8
    for label, value in engagement:
        row_font = fit_text(draw, label, x2 - x1 - 210, 31, "bold", 21)
        value_font = font(37, "black")
        draw.text((x1, y), label, font=row_font, fill=(245, 240, 223))
        val_w, _ = text_size(draw, value, value_font)
        draw.text((x2 - val_w, y - 4), value, font=value_font, fill=gold)
        y += 58

    y += draw_stacked_breakout_bar(
        draw,
        x1,
        y - 4,
        x2 - x1,
        [
            ("Before", 893, teal),
            ("After", 2306, orange),
            ("Weekend", 1126, blue),
        ],
    )

    for label, value in [("Flash CTF Participants", "103"), ("Flash CTF Entries", "155")]:
        row_font = fit_text(draw, label, x2 - x1 - 210, 31, "bold", 21)
        value_font = font(37, "black")
        draw.text((x1, y), label, font=row_font, fill=(245, 240, 223))
        val_w, _ = text_size(draw, value, value_font)
        draw.text((x2 - val_w, y - 4), value, font=value_font, fill=gold)
        y += 58

    charts_x = M + engage_w + gap
    x1, y1, x2, _ = draw_card(draw, (charts_x, bottom_y, W - M, bottom_y + bottom_h), "Division Results", panel, orange)
    solves = [("High School", 4085, orange), ("Traditional College", 2739, blue), ("Middle School", 976, teal), ("ROP College", 70, plum)]
    draw.text((x1, y1 - 2), "Challenge Solves", font=font(31, "black"), fill=ink)
    y = y1 + 44
    for label, value, accent in solves:
        y += draw_compact_value_bar(draw, x1, y, x2 - x1, label, value, 4085, accent)

    flash_y = y + 28
    draw.text((x1, flash_y), "Flash CTF By Division", font=font(31, "black"), fill=ink)
    flash = [("High School", 55, orange), ("Traditional College", 38, blue), ("Middle School", 10, teal), ("ROP College", 0, plum)]
    y = flash_y + 46
    for label, value, accent in flash:
        y += draw_compact_value_bar(draw, x1, y, x2 - x1, label, value, 55, accent)

    # Footer note.
    footer = "Source data summarized from the two Mayors Cyber Cup image-generation prompt files in docs/."
    footer_font = font(22, "regular")
    footer_w, _ = text_size(draw, footer, footer_font)
    draw.text(((W - footer_w) // 2, H - 76), footer, font=footer_font, fill=(82, 78, 70))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    final = canvas.convert("RGB")
    final.save(OUT, "PNG", optimize=True, dpi=(300, 300))
    final.save(PDF_OUT, "PDF", resolution=300.0)
    print(OUT)
    print(PDF_OUT)


if __name__ == "__main__":
    main()
