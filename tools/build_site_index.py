#!/usr/bin/env python3
"""
FILE / ROOT:   tools/build_site_index.py  (mYa Solutions website)
DESCRIPTION:   Builds assets/jean/site-index.json — the only material Jean may
               answer website questions from. Every <section> and <article> on
               every public page becomes one entry: page path, section id,
               heading, a short summary and the visible text.

               Sections without an id get a stable one derived from their
               heading, written back into the HTML so "Show me" can scroll to
               them. Run it after editing any page:

                   python3 tools/build_site_index.py

               The GitHub Action in .github/workflows/site-index.yml runs it on
               every push to main, so the index never drifts from the pages.
               Standard library only.
"""
import html
import json
import os
import re
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://myasolutions.org"
OUT = os.path.join(ROOT, "assets", "jean", "site-index.json")

# Pages Jean may answer from. Redirect stubs, the template, 404 and archive are excluded.
PAGES = [
    "index.html",
    "products/bethanyshell.html", "products/education.html", "products/defense.html",
    "products/physical.html", "products/robotics.html", "products/marine.html",
    "products/ground.html", "products/air.html", "products/pricing.html",
    "evidence/reports.html", "evidence/become-a-believer.html",
    "impact/giving.html", "impact/b-corp.html",
    "company/about.html", "company/team.html", "company/careers.html", "company/contact.html",
    "investor.html", "login.html",
]

SKIP_TAGS = {"script", "style", "noscript", "svg", "template"}
INLINE_TAGS = {"em", "strong", "b", "i", "small", "sup", "sub", "abbr", "code", "u", "mark"}
BLOCK_TAGS = {"p", "li", "h1", "h2", "h3", "h4", "td", "th", "dt", "dd", "blockquote", "figcaption", "caption", "pre", "div", "a", "button"}


def slug(s, n=48):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return (s[:n].rstrip("-")) or "section"


class SectionParser(HTMLParser):
    """Collects top-level <section>/<article> blocks with their text and byte offsets."""

    def __init__(self, src):
        super().__init__(convert_charrefs=True)
        self.src = src
        self.line_offsets = [0]
        for line in src.splitlines(keepends=True):
            self.line_offsets.append(self.line_offsets[-1] + len(line))
        self.stack = []          # open section/article frames
        self.sections = []
        self.skip = 0
        self.title = ""
        self.in_title = False
        self.desc = ""
        self.main_depth = 0

    def char_offset(self):
        line, col = self.getpos()
        return self.line_offsets[line - 1] + col

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title":
            self.in_title = True
        if tag == "meta" and a.get("name") == "description":
            self.desc = a.get("content", "")
        if tag in SKIP_TAGS:
            self.skip += 1
            return
        if tag in ("section", "article"):
            frame = {
                "tag": tag, "id": a.get("id"), "start": self.char_offset(),
                "start_text": self.get_starttag_text(), "heading": "", "hlevel": 9,
                "parts": [], "summary": a.get("data-summary", ""),
                "label": a.get("aria-label", ""), "nested": bool(self.stack),
            }
            self.stack.append(frame)
            return
        if self.stack and tag in BLOCK_TAGS:
            for f in self.stack:
                f["parts"].append("\n")
        elif self.stack and tag not in INLINE_TAGS:
            for f in self.stack:
                f["parts"].append(" ")
        if self.stack and re.fullmatch(r"h[1-4]", tag):
            lvl = int(tag[1])
            f = self.stack[-1]
            if lvl < f["hlevel"]:
                f["hlevel"] = lvl
                f["heading"] = ""
                f["capture_heading"] = True
        if tag == "img" and self.stack and a.get("alt"):
            for f in self.stack:
                f["parts"].append(" " + a["alt"] + " ")

    def handle_endtag(self, tag):
        if self.stack and tag in BLOCK_TAGS:
            for f in self.stack:
                f["parts"].append("\n")
        if tag == "title":
            self.in_title = False
        if tag in SKIP_TAGS:
            self.skip = max(0, self.skip - 1)
            return
        if re.fullmatch(r"h[1-4]", tag) and self.stack:
            self.stack[-1]["capture_heading"] = False
        if tag in ("section", "article") and self.stack:
            f = self.stack.pop()
            self.sections.append(f)

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.skip or not self.stack:
            return
        for f in self.stack:
            f["parts"].append(data)
        f = self.stack[-1]
        if f.get("capture_heading"):
            f["heading"] += data


def clean(s):
    s = html.unescape(s)
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    s = re.sub(r"\s*\n\s*", "\n", s)
    return s.strip()


def summarise(text, heading, limit=240):
    body = text.replace(heading, "", 1).strip() if heading else text
    first = re.split(r"(?<=[.!?])\s", body.replace("\n", " "), maxsplit=2)
    s = " ".join(first[:2]).strip()
    return (s[: limit - 1] + "…") if len(s) > limit else s


def process(path):
    full = os.path.join(ROOT, path)
    src = open(full, encoding="utf-8").read()
    p = SectionParser(src)
    p.feed(src)
    page_title = clean(p.title).split(" | ")[0]
    used = set(re.findall(r'\bid="([^"]+)"', src))
    inserts = []   # (offset, text) to add ids
    entries = []
    for f in sorted(p.sections, key=lambda x: x["start"]):
        text = clean("".join(f["parts"]))
        if len(text) < 20:
            continue
        first_line = text.split("\n", 1)[0][:80]
        heading = clean(f["heading"]) or f["label"] or first_line or page_title
        sid = f["id"]
        if not sid:
            base = slug(heading)
            sid, n = base, 2
            while sid in used:
                sid, n = f"{base}-{n}", n + 1
            used.add(sid)
            tag_text = f["start_text"]
            inserts.append((f["start"] + len("<" + f["tag"]), f' id="{sid}"', tag_text))
        entries.append({
            "id": sid,
            "path": path,
            "page": page_title,
            "heading": heading,
            "summary": f["summary"] or summarise(text, heading),
            "text": text[:4000],
        })
    if inserts:
        for off, ins, tag_text in sorted(inserts, reverse=True):
            opener = tag_text.split()[0].rstrip(">")
            assert src[off - len(opener):off] == opener, (path, off, opener)
            src = src[:off] + ins + src[off:]
        open(full, "w", encoding="utf-8").write(src)
    return {"path": path, "title": page_title, "description": clean(p.desc)}, entries


def main():
    pages, sections = [], []
    for path in PAGES:
        if not os.path.exists(os.path.join(ROOT, path)):
            print("missing page:", path, file=sys.stderr)
            continue
        meta, entries = process(path)
        pages.append(meta)
        sections.extend(entries)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    data = {
        "version": 1,
        "site": SITE,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pages": pages,
        "sections": sections,
    }
    # Keep the file stable when nothing changed (avoid churn from the timestamp).
    if os.path.exists(OUT):
        old = json.load(open(OUT, encoding="utf-8"))
        if old.get("pages") == pages and old.get("sections") == sections:
            print(f"index unchanged: {len(sections)} sections across {len(pages)} pages")
            return
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {len(sections)} sections across {len(pages)} pages")


if __name__ == "__main__":
    main()
