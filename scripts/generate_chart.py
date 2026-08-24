#!/usr/bin/env python3
"""
Generate the "bugs by driver" trend chart as a standalone dark-theme SVG for
embedding in README.md. Dark-only because GitHub's file viewer renders
README images on a dark surface for the vast majority of viewers (default
GitHub theme), so a light variant added complexity without real benefit.

This script is read-only with respect to docs/data.json: it never edits
driver/bug data, it only reads it to draw a chart. Colors below mirror the
CSS custom properties in docs/style.css so the static README image matches
the live, interactive chart on the site.

Usage:
    python scripts/generate_chart.py
"""
import json
import math
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
DATA_PATH = REPO_ROOT / "docs" / "data.json"
OUTPUT_DIR = REPO_ROOT / "docs" / "assets"
SITE_URL = "https://independent-arg.github.io/NvidiaWatch/#trends"

# Design tokens mirrored from docs/style.css :root (dark theme)
THEMES = {
    "dark": {
        "bg": "#1e1c21",
        "border": "#3a3740",
        "text_primary": "#f2f2f2",
        "text_secondary": "#a3a0a8",
        "accent": "#c99aff",
        "fixed": "#8fc7ab",
        "pending": "#e08276",
        "grid": "#332f38",
    },
}

FONT_DISPLAY = "'Space Grotesk', 'Segoe UI', sans-serif"
FONT_MONO = "'DM Mono', 'SFMono-Regular', Consolas, monospace"

WIDTH, HEIGHT = 1200, 400
PAD_LEFT, PAD_RIGHT = 44, 24
PAD_TOP, PAD_BOTTOM = 68, 60


def version_key(v):
    return tuple(int(p) for p in v.split("."))


def nice_ceil(value):
    """Round up to a visually clean axis maximum (1/2/5 * 10^k)."""
    if value <= 0:
        return 1
    exp = math.floor(math.log10(value))
    frac = value / (10 ** exp)
    nice = 1 if frac <= 1 else 2 if frac <= 2 else 5 if frac <= 5 else 10
    return nice * (10 ** exp)


def load_series():
    with open(DATA_PATH, encoding="utf-8") as f:
        drivers = json.load(f)
    drivers = sorted(drivers, key=lambda d: version_key(d["version"]))
    series = []
    for d in drivers:
        total = len(d["bugs"])
        fixed = sum(1 for b in d["bugs"] if b.get("fixed_in") is not None)
        series.append({
            "version": d["version"],
            "total": total,
            "fixed": fixed,
            "pending": total - fixed,
        })
    return series


def esc(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def build_svg(series, theme_name):
    t = THEMES[theme_name]
    n = len(series)
    plot_x0, plot_x1 = PAD_LEFT, WIDTH - PAD_RIGHT
    plot_y0, plot_y1 = PAD_TOP, HEIGHT - PAD_BOTTOM
    plot_w = plot_x1 - plot_x0
    plot_h = plot_y1 - plot_y0

    max_total = max(item["total"] for item in series)
    y_max = nice_ceil(max_total * 1.15)

    gap = 1.5
    bar_w = max(1.5, (plot_w - gap * (n - 1)) / n)

    def bar_x(i):
        return plot_x0 + i * (bar_w + gap)

    def y_for(count):
        return plot_y1 - (count / y_max) * plot_h

    parts = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" '
        f'width="{WIDTH}" height="{HEIGHT}" role="img" '
        f'aria-label="Bugs by driver, fixed vs pending">'
    )
    parts.append(f'<rect x="0" y="0" width="{WIDTH}" height="{HEIGHT}" rx="14" fill="{t["bg"]}" stroke="{t["border"]}"/>')

    # Title + subtitle
    first_v, last_v = series[0]["version"], series[-1]["version"]
    parts.append(
        f'<text x="{PAD_LEFT}" y="34" font-family="{FONT_DISPLAY}" font-weight="700" '
        f'font-size="20" fill="{t["text_primary"]}">Bugs by driver</text>'
    )
    parts.append(
        f'<text x="{PAD_LEFT}" y="54" font-family="{FONT_MONO}" font-size="12" '
        f'fill="{t["text_secondary"]}">{n} driver versions &#183; {esc(first_v)} &#8594; {esc(last_v)} &#183; auto-generated from data.json</text>'
    )

    # Legend, top-right
    legend_y = 34
    parts.append(
        f'<text x="{WIDTH - PAD_RIGHT}" y="{legend_y}" text-anchor="end" '
        f'font-family="{FONT_MONO}" font-size="12" fill="{t["text_secondary"]}">'
        f'<tspan fill="{t["fixed"]}">&#9679;</tspan> Fixed &#160;&#160;'
        f'<tspan fill="{t["pending"]}">&#9679;</tspan> Pending</text>'
    )

    # Gridlines + y-axis labels (0, half, max)
    for frac in (0, 0.5, 1.0):
        gy = y_for(y_max * frac)
        parts.append(f'<line x1="{plot_x0}" y1="{gy:.1f}" x2="{plot_x1}" y2="{gy:.1f}" stroke="{t["grid"]}" stroke-width="1"/>')
        label = int(round(y_max * frac))
        parts.append(
            f'<text x="{plot_x0 - 8}" y="{gy + 3:.1f}" text-anchor="end" font-family="{FONT_MONO}" '
            f'font-size="10" fill="{t["text_secondary"]}">{label}</text>'
        )

    # Bars (stacked: fixed at the base, pending on top)
    peak_idx = max(range(n), key=lambda i: series[i]["total"])
    for i, item in enumerate(series):
        x = bar_x(i)
        fixed_y = y_for(item["fixed"])
        total_y = y_for(item["total"])
        if item["fixed"] > 0:
            parts.append(f'<rect x="{x:.2f}" y="{fixed_y:.1f}" width="{bar_w:.2f}" height="{(plot_y1 - fixed_y):.1f}" fill="{t["fixed"]}"/>')
        if item["pending"] > 0:
            parts.append(f'<rect x="{x:.2f}" y="{total_y:.1f}" width="{bar_w:.2f}" height="{(fixed_y - total_y):.1f}" fill="{t["pending"]}"/>')
        title = f'{item["version"]}: {item["total"]} bugs ({item["fixed"]} fixed, {item["pending"]} pending)'
        parts.append(f'<title>{esc(title)}</title>')

    # Axis baseline
    parts.append(f'<line x1="{plot_x0}" y1="{plot_y1}" x2="{plot_x1}" y2="{plot_y1}" stroke="{t["border"]}" stroke-width="1"/>')

    # Start / end version labels
    first_x = bar_x(0) + bar_w / 2
    last_x = bar_x(n - 1) + bar_w / 2
    parts.append(
        f'<text x="{first_x:.1f}" y="{plot_y1 + 20}" text-anchor="start" font-family="{FONT_MONO}" '
        f'font-size="11" fill="{t["text_secondary"]}">{esc(first_v)}</text>'
    )
    parts.append(
        f'<text x="{last_x:.1f}" y="{plot_y1 + 20}" text-anchor="end" font-family="{FONT_MONO}" '
        f'font-size="11" fill="{t["text_secondary"]}">{esc(last_v)}</text>'
    )

    # Peak callout: the worst driver branch gets called out explicitly
    peak = series[peak_idx]
    peak_x = bar_x(peak_idx) + bar_w / 2
    peak_top = y_for(peak["total"])
    marker_y = max(PAD_TOP + 10, peak_top - 14)
    anchor = "start" if peak_x < plot_x0 + plot_w * 0.33 else "end" if peak_x > plot_x0 + plot_w * 0.66 else "middle"
    label_dx = 6 if anchor == "start" else -6 if anchor == "end" else 0
    parts.append(f'<line x1="{peak_x:.1f}" y1="{marker_y:.1f}" x2="{peak_x:.1f}" y2="{peak_top:.1f}" stroke="{t["accent"]}" stroke-width="1" stroke-dasharray="2,2"/>')
    parts.append(f'<circle cx="{peak_x:.1f}" cy="{marker_y:.1f}" r="3" fill="{t["accent"]}"/>')
    parts.append(
        f'<text x="{peak_x + label_dx:.1f}" y="{marker_y - 8:.1f}" text-anchor="{anchor}" font-family="{FONT_MONO}" '
        f'font-weight="500" font-size="11" fill="{t["accent"]}">{esc(peak["version"])} &#183; {peak["total"]} bugs, worst branch</text>'
    )

    # Footer caption pointing to the live, interactive version
    parts.append(
        f'<text x="{WIDTH / 2:.1f}" y="{HEIGHT - 18}" text-anchor="middle" font-family="{FONT_MONO}" '
        f'font-size="11" fill="{t["text_secondary"]}">Live &amp; interactive: {esc(SITE_URL)}</text>'
    )

    parts.append("</svg>")
    return "\n".join(parts)


def main():
    series = load_series()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = []
    for theme_name in THEMES:
        svg = build_svg(series, theme_name)
        out_path = OUTPUT_DIR / f"bugs-chart-{theme_name}.svg"
        out_path.write_text(svg, encoding="utf-8")
        written.append(out_path)
    for p in written:
        print(f"Wrote {p.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
