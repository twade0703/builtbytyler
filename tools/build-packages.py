#!/usr/bin/env python3
"""Render 03 Clients/PACKAGES.md as builtbytyler.com/packages.html.

PACKAGES.md is expressly part of the client agreement -- TERMS.md names it as the
document that describes the package bought, and the terms page says which wins if
they disagree -- and until this page it was published nowhere. A document incorporated
by reference that the other party cannot find fails the incorporation the moment they
go looking (Shaw v. Regents), and losing it loses "up to five pages" and all three
no-promise disclaimers. So: one source, one page, same rule as terms.html. Never
hand-edit packages.html; edit PACKAGES.md and run this again.

    python builtbytyler/tools/build-packages.py

Reuses build-terms.py's renderer so the two agreement pages cannot drift in how they
read markdown. Tables (PACKAGES.md has one) are rendered here. The page is created
from terms.html's chrome the first time, so head, nav and footer match; after that only
the content region is regenerated.
"""
import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
ROOT = os.path.dirname(SITE)
SRC = os.path.join(ROOT, "03 Clients", "PACKAGES.md")
OUT = os.path.join(SITE, "packages.html")
TERMS = os.path.join(SITE, "terms.html")

sys.path.insert(0, HERE)
bt = __import__("build-terms")

OPEN_MARK = bt.OPEN_MARK
CLOSE_MARK = bt.CLOSE_MARK


def render_with_tables(md):
    """build-terms' render, with pipe tables lifted out first and put back as <table>."""
    lines = md.splitlines()
    out, i = [], 0
    slot = 0
    tables = []
    while i < len(lines):
        if lines[i].strip().startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            head = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            rows = []
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            t = ["<table>"]
            if any(head):
                t.append("<thead><tr>%s</tr></thead>" % "".join("<th>%s</th>" % bt.inline(c) for c in head))
            t.append("<tbody>")
            for r in rows:
                t.append("<tr>%s</tr>" % "".join("<td>%s</td>" % bt.inline(c) for c in r))
            t.append("</tbody></table>")
            tables.append("\n".join(t))
            # Blank lines either side: the placeholder must be its own paragraph. Without
            # them a table written straight under a sentence (PACKAGES.md, 2026-09-21: "No
            # hourly rates." then "| | |" on the next line) was joined into that sentence,
            # the put-back below never matched, and the page printed "@@TABLE0@@" where the
            # add-on prices should be.
            out.extend(["", "@@TABLE%d@@" % slot, ""])
            slot += 1
            continue
        out.append(lines[i])
        i += 1
    body = bt.render("\n".join(out))
    for n, t in enumerate(tables):
        body = body.replace("<p>@@TABLE%d@@</p>" % n, t)
    return body


def main():
    if not os.path.exists(SRC):
        raise SystemExit("no PACKAGES.md at %s" % SRC)
    md = open(SRC, encoding="utf-8").read()
    # Written for the repo; two lines need to read for the web. Same rule as
    # build-terms.py: the page may not say anything that is not true where it is served.
    md = md.replace("Full terms in `TERMS.md`, in the same plain language.",
                    "Full terms are on the [terms page](terms.html), in the same plain language.")
    md = md.replace("**Client-facing. Send this, print it, or read it down the phone.**",
                    "**What the three packages are, what the monthly covers, what costs "
                    "extra, and what is deliberately not promised. This page is part of "
                    "the agreement you accept at checkout.**")
    body = render_with_tables(md)
    # Markdown links: the renderer does not do them and the page needs exactly one.
    body = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', body)

    if os.path.exists(OUT):
        cur = open(OUT, encoding="utf-8").read()
    else:
        if not os.path.exists(TERMS):
            raise SystemExit("neither packages.html nor terms.html exists to take the chrome from")
        cur = open(TERMS, encoding="utf-8").read()
        cur = cur.replace("<title>Website terms &middot; BuiltByTyler</title>",
                          "<title>Packages &middot; BuiltByTyler</title>")
        cur = re.sub(r'(<meta name="description" content=")[^"]*(")',
                     r"\1What a BuiltByTyler website package includes, what the monthly "
                     r"covers, what costs extra, and what is not promised.\2", cur)
        cur = cur.replace("builtbytyler.com/terms", "builtbytyler.com/packages")
        cur = cur.replace('"name": "Website terms"', '"name": "Packages"')
    # The share card is taken from terms.html, so it said "Website terms" on the packages
    # page. Re-set on every run, not only the first, so an existing page is corrected too.
    cur = re.sub(r'(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*(")',
                 r"\1Packages &middot; BuiltByTyler\2", cur)
    cur = re.sub(r'(<meta (?:property="og:description"|name="twitter:description") content=")[^"]*(")',
                 r"\1What a BuiltByTyler website package includes, what the monthly covers, "
                 r"what costs extra, and what is not promised.\2", cur)
    a = cur.find(OPEN_MARK)
    b = cur.find(CLOSE_MARK, a)
    if a == -1 or b == -1:
        raise SystemExit("cannot find the content region in %s" % os.path.relpath(OUT, ROOT))
    page = cur[:a + len(OPEN_MARK)] + "\n" + body + "\n" + cur[b:]
    open(OUT, "w", encoding="utf-8", newline="\n").write(page)
    print("wrote %s  (%d lines, %d paragraphs, %d headings, %d tables)"
          % (os.path.relpath(OUT, ROOT), len(page.splitlines()), page.count("<p>"),
             len(re.findall(r"<h[1-4]>", page)), page.count("<table>")))
    return 0 if page.count("<p>") == page.count("</p>") else 1


if __name__ == "__main__":
    sys.exit(main())
