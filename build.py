#!/usr/bin/env python3
"""
Global Coffee Board — build step.

Reads the page templates in src/ and inlines the local CSS and JS from
assets/ directly into the HTML, writing self-contained pages to the repo
root. Remote resources (Google Fonts, the Three.js CDN) are left as
external references.

Why: self-contained pages render correctly everywhere — opened directly
from disk (file://), inside sandboxed IDE preview panes that ignore
external <link> stylesheets, and on Netlify. assets/ + src/ stay as the
single source of truth; the root *.html files are generated artifacts.

Usage:  python3 build.py
"""
import re
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
PAGES = ["index.html", "knowledge.html", "admin.html"]

CSS_LINK = re.compile(
    r'<link[^>]*rel=["\']stylesheet["\'][^>]*href=["\']assets/css/([^"\']+)["\'][^>]*/?>'
)
LOCAL_SCRIPT = re.compile(
    r'<script[^>]*\ssrc=["\']assets/js/([^"\']+)["\'][^>]*>\s*</script>'
)


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def inline_css(match):
    css = read("assets/css/" + match.group(1))
    return "<style>\n" + css + "\n</style>"


def inline_script(match):
    js = read("assets/js/" + match.group(1))
    return "<script>\n" + js + "\n</script>"


def build_page(name):
    html = (SRC / name).read_text(encoding="utf-8")
    html = CSS_LINK.sub(inline_css, html)
    html = LOCAL_SCRIPT.sub(inline_script, html)
    banner = "<!-- Built by build.py from src/{} — do not edit directly; edit src/ + assets/ then run: python3 build.py -->\n".format(name)
    html = html.replace("<!DOCTYPE html>", "<!DOCTYPE html>\n" + banner, 1)
    (ROOT / name).write_text(html, encoding="utf-8")
    return len(html)


if __name__ == "__main__":
    for p in PAGES:
        size = build_page(p)
        print("built {:<16} {:>7,} bytes".format(p, size))
    print("done — self-contained pages written to repo root.")
