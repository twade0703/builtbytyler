#!/usr/bin/env python3
"""Render 03 Clients/TERMS.md as builtbytyler.com/terms.html.

The agreement has to be readable at a URL before anyone pays, because that is what
the Stripe checkbox links to and what the checkout consent records acceptance of
(04 Legal AGR-TERMS, AGR-ASSENT). A contract nobody could read before paying is not
much of a contract.

One source, two outputs: the markdown is the document, this page is the copy the
client reads. Never hand-edit terms.html — edit TERMS.md and run this again, or the
page and the agreement drift and the version recorded against a payment stops
meaning anything.

    python builtbytyler/tools/build-terms.py

Stdlib only, same as the rest of this repo. It handles the markdown TERMS.md
actually uses: headings, bullets, bold, italic, inline code, rules, and the
signature block.
"""
import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
ROOT = os.path.dirname(SITE)
SRC = os.path.join(ROOT, "03 Clients", "TERMS.md")
OUT = os.path.join(SITE, "terms.html")

HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Website terms &middot; BuiltByTyler</title>
  <meta name="description" content="The whole agreement for a BuiltByTyler website \
build and its monthly care plan, in plain language.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&\
family=Space+Grotesk:wght@300;400;500;600&family=Instrument+Serif:ital@0;1&\
family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/css/styles.css">
  <link rel="stylesheet" href="assets/css/motion.css">
  <style>
    /* A line to sign on. The one rule this page needs that the site stylesheet
       does not already carry. Inline styles are allowed by the CSP in _headers. */
    .sig-line { display:inline-block; min-width:15rem; max-width:100%;
                border-bottom:1px solid currentColor; opacity:.5;
                vertical-align:baseline; }
  </style>
</head>
<body>
  <header id="site-nav"></header>

  <main>
    <section class="section">
      <div class="container policy">
"""

TAIL = """      </div>
    </section>
  </main>

  <footer id="site-footer" data-year="2026">
    <div class="container site-footer__inner">
      <address>
        <strong>BuiltByTyler LLC</strong><br>
        770 Madison St, Monterey, CA 93940<br>
        <a href="tel:+12817398942">(281) 739-8942</a> &middot;
        <a href="mailto:twade@builtbytyler.com">twade@builtbytyler.com</a>
      </address>
    </div>
  </footer>

  <script src="assets/js/products.js"></script>
  <script src="assets/js/components.js"></script>
  <script src="assets/js/main.js"></script>
</body>
</html>
"""

SIG = re.compile(r"_{3,}")


def inline(s):
    """Bold, italic, inline code, bare emails, signature rules. Escaped first."""
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", s)
    s = re.sub(r"(?<![\w.@-])([\w.+-]+@[\w-]+\.[\w.]+)",
               r'<a href="mailto:\1">\1</a>', s)
    # A run of underscores is a line to sign on, not emphasis.
    s = SIG.sub('<span class="sig-line"></span>', s)
    return s


def render(md):
    """Markdown to page. Two rules here are not generic markdown, and both are
    about what this document is: bullets separated by a blank line are one list,
    not five (TERMS.md writes its ownership bullets that way), and a paragraph
    containing a line to sign on keeps its line breaks rather than being reflowed
    into prose."""
    out, para, bullets = [], [], []

    def flush():
        if bullets:
            out.append("<ul>")
            out.extend("  <li>%s</li>" % inline(b) for b in bullets)
            out.append("</ul>")
            del bullets[:]
        if para:
            # Inline markup is resolved over the whole paragraph, not line by line,
            # so an italic or a bold that wraps across two source lines survives.
            sep = "<br>" if any(SIG.search(l) for l in para) else " "
            out.append("<p>%s</p>" % inline("\n".join(para)).replace("\n", sep))
            del para[:]

    for raw in md.splitlines():
        line = raw.rstrip()
        s = line.strip()

        if not s:
            # A blank line ends a paragraph. It does not end a list — the next
            # non-blank line decides that, once we can see whether it is a bullet.
            if para:
                flush()
            continue

        if s.startswith("- "):
            if para:
                flush()
            bullets.append(s[2:])
            continue

        if bullets and raw.startswith("  "):          # continuation of that bullet
            bullets[-1] += " " + s
            continue

        if bullets:
            flush()

        if s.startswith("---"):
            flush()
            out.append("<hr>")
            continue

        m = re.match(r"^(#{1,4})\s+(.*)$", s)
        if m:
            flush()
            n = len(m.group(1))
            out.append("<h%d>%s</h%d>" % (n, inline(m.group(2)), n))
            continue

        para.append(s)

    flush()
    return "\n".join("        " + l for l in out)


def main():
    if not os.path.exists(SRC):
        raise SystemExit("no TERMS.md at %s" % SRC)
    md = open(SRC, encoding="utf-8").read()

    # The markdown is written for someone reading the repo, so two of its lines need
    # rewriting for the web. Both replacements are constrained by the same rule: this
    # page may not say anything that is not true on the day it is served.
    #
    # PACKAGES.md is expressly part of the agreement and is published nowhere. Calling
    # it "the packages page" invents a page and fails the incorporation-by-reference
    # test the moment a buyer goes looking for it (Shaw v. Regents). Until the staged
    # 04 Legal/proposed/PACKAGES.md is approved and published, name it as the thing it
    # actually is - a sheet that arrives with the quote - and say how to get it.
    md = md.replace("`PACKAGES.md`", "the packages sheet")
    md = md.replace(
        "**Client-facing. This is the whole agreement for a website package.**",
        "**This is the whole agreement for a website build and its monthly care "
        "plan. Read it before you pay. The packages sheet it refers to comes with "
        "your quote — ask for it first if you would rather read both together.**")

    page = HEAD + render(md) + "\n" + TAIL
    open(OUT, "w", encoding="utf-8", newline="\n").write(page)

    o, c = page.count("<p>"), page.count("</p>")
    print("wrote %s  (%d lines, %d paragraphs, %d headings, %d lists)"
          % (os.path.relpath(OUT, ROOT), len(page.splitlines()), o,
             len(re.findall(r"<h[1-4]>", page)), page.count("<ul>")))
    if o != c:
        print("WARNING: unbalanced paragraphs", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
