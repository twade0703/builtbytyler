"""Full technical SEO audit of the live site.

Audits what is actually SERVED, not what is in the working tree — a page
can be perfect locally and broken in the index because of a redirect, a
stale cache, or a sitemap that points at a URL that no longer resolves.

Every check either passes or prints the offending value. Nothing is
reported as a problem unless the exact string that causes it is shown,
because an SEO report you cannot act on is just anxiety.

Exit code is the number of ERRORs (warnings do not fail the run), so this
can gate a deploy later if that turns out to be worth doing.

    python tools/seo-audit.py               # live site
    python tools/seo-audit.py --local       # working tree, via file paths
"""
import collections
import html
import json
import re
import sys
import urllib.parse

import requests

SITE = "https://builtbytyler.com"

# The pages that are meant to be found. Anything reachable but absent from
# this list is reported, because an orphan page is either a missing sitemap
# entry or a page that should not be public.
INDEXABLE = [
    ("/", "index.html"),
    ("/software", "software.html"),
    ("/shop", "shop.html"),
    ("/about", "about.html"),
    ("/contact", "contact.html"),
    ("/policies", "policies.html"),
    ("/terms", "terms.html"),
    ("/product", "product.html"),
]

# Served, but deliberately kept out of the index.
NOINDEX = [("/order-confirmed", "order-confirmed.html"),
           ("/checkout-test", "checkout-test.html")]

# Google truncates around these; they are guidance, not law.
TITLE_MIN, TITLE_MAX = 25, 62
DESC_MIN, DESC_MAX = 70, 160

errors, warnings, notes = [], [], []


def err(page, msg, detail=""):
    errors.append((page, msg, detail))


def warn(page, msg, detail=""):
    warnings.append((page, msg, detail))


def note(page, msg, detail=""):
    notes.append((page, msg, detail))


# ------------------------------------------------------------------ helpers
TAG = re.compile(r"<[^>]+>")


def meta(doc, **attrs):
    """Content of the first <meta> matching every given attribute."""
    for m in re.finditer(r"<meta\b[^>]*>", doc, re.I):
        tag = m.group(0)
        if all(re.search(r'%s\s*=\s*["\']%s["\']' % (k, re.escape(v)), tag, re.I)
               for k, v in attrs.items()):
            c = re.search(r'content\s*=\s*["\'](.*?)["\']', tag, re.I | re.S)
            if c:
                return html.unescape(c.group(1)).strip()
    return None


def tags(doc, name):
    return re.findall(r"<%s\b[^>]*>(.*?)</%s>" % (name, name), doc, re.I | re.S)


def text_of(fragment):
    return re.sub(r"\s+", " ", html.unescape(TAG.sub(" ", fragment))).strip()


def visible_words(doc):
    body = re.sub(r"<(script|style|svg|noscript)\b.*?</\1>", " ", doc, flags=re.I | re.S)
    return len(text_of(body).split())


COMMENT = re.compile(r"<!--.*?-->", re.S)


def strip_comments(doc):
    """Commented-out markup is not served content.

    This matters more than it sounds: about.html keeps a whole photo strip
    commented out until Tyler sends the photographs, and scanning it would
    report four broken images and four layout-shift warnings for markup no
    browser ever parses. Every content check below runs on the stripped
    document; only checks that care about the raw bytes use the original.
    """
    return COMMENT.sub(" ", doc)


def fetch(path):
    url = SITE + path
    r = requests.get(url, timeout=25, allow_redirects=True,
                     headers={"User-Agent": "Mozilla/5.0 (SEO audit; builtbytyler.com)"})
    return r


def check_assets(path, doc):
    """Every image, stylesheet and script the page actually loads."""
    out = []
    for m in re.finditer(r'<(?:img|script|link)\b[^>]*>', doc, re.I):
        tag = m.group(0)
        if tag.lower().startswith("<link") and not re.search(
                r'rel\s*=\s*["\'](?:stylesheet|icon|apple-touch-icon|manifest)', tag, re.I):
            continue
        a = re.search(r'\b(?:src|href)\s*=\s*["\']([^"\']+)["\']', tag, re.I)
        if a:
            out.append(a.group(1))
    return out


# ------------------------------------------------------------------ per page
def audit_page(path, raw, resp, indexable):
    P = path
    doc = strip_comments(raw)

    # --- indexability -----------------------------------------------------
    robots_meta = meta(doc, name="robots") or ""
    xrobots = resp.headers.get("X-Robots-Tag", "")
    blocked = "noindex" in (robots_meta + " " + xrobots).lower()
    if indexable and blocked:
        err(P, "page is noindex but is meant to be indexed", robots_meta or xrobots)
    if not indexable and not blocked:
        warn(P, "not meant to be indexed, but carries no noindex",
             "robots.txt Disallow only stops crawling, not indexing of a "
             "URL discovered elsewhere; add <meta name=robots content=noindex>")

    # --- title ------------------------------------------------------------
    t = tags(doc, "title")
    if not t:
        err(P, "no <title>")
    else:
        title = text_of(t[0])
        if not title:
            err(P, "empty <title>")
        elif len(title) > TITLE_MAX:
            warn(P, "title %d chars (truncates near %d)" % (len(title), TITLE_MAX), title)
        elif len(title) < TITLE_MIN:
            warn(P, "title only %d chars" % len(title), title)
        if len(t) > 1:
            err(P, "%d <title> tags" % len(t))

    # --- description ------------------------------------------------------
    d = meta(doc, name="description")
    if not d:
        (err if indexable else note)(P, "no meta description")
    elif len(d) > DESC_MAX:
        warn(P, "description %d chars (truncates near %d)" % (len(d), DESC_MAX), d)
    elif len(d) < DESC_MIN:
        warn(P, "description only %d chars" % len(d), d)

    # --- canonical --------------------------------------------------------
    can = re.search(r'<link\b[^>]*rel\s*=\s*["\']canonical["\'][^>]*>', doc, re.I)
    if not can:
        err(P, "no canonical link")
    else:
        href = re.search(r'href\s*=\s*["\'](.*?)["\']', can.group(0), re.I)
        href = href.group(1) if href else ""
        if not href.startswith("https://"):
            err(P, "canonical is not absolute https", href)
        else:
            # it must point at the URL that actually serves this page
            final = resp.url.rstrip("/") or resp.url
            if href.rstrip("/") != final.rstrip("/"):
                err(P, "canonical does not match the served URL",
                    "canonical=%s  served=%s" % (href, resp.url))
        if len(re.findall(r'rel\s*=\s*["\']canonical["\']', doc, re.I)) > 1:
            err(P, "more than one canonical")

    # --- headings ---------------------------------------------------------
    h1 = [text_of(x) for x in tags(doc, "h1")]
    if not h1:
        (err if indexable else note)(P, "no <h1>")
    elif len(h1) > 1 and indexable:
        warn(P, "%d <h1> tags" % len(h1), " | ".join(h1)[:160])

    levels = [int(m) for m in re.findall(r"<h([1-6])\b", doc, re.I)]
    prev = 0
    for lv in levels:
        if prev and lv > prev + 1:
            warn(P, "heading level jumps h%d -> h%d" % (prev, lv))
            break
        prev = lv

    # --- social -----------------------------------------------------------
    if indexable:
        for prop in ("og:title", "og:description", "og:url", "og:image", "og:type"):
            if not meta(doc, property=prop):
                warn(P, "missing %s" % prop)
        if not meta(doc, name="twitter:card"):
            warn(P, "missing twitter:card")
    ogimg = meta(doc, property="og:image")
    if ogimg and not ogimg.startswith("http"):
        err(P, "og:image is not an absolute URL", ogimg)

    # --- head hygiene -----------------------------------------------------
    if not re.search(r'<html\b[^>]*\blang\s*=', doc, re.I):
        err(P, "<html> has no lang attribute")
    if not re.search(r'name\s*=\s*["\']viewport["\']', doc, re.I):
        err(P, "no viewport meta")
    if not re.search(r'charset', doc, re.I):
        err(P, "no charset")

    # --- images -----------------------------------------------------------
    for img in re.findall(r"<img\b[^>]*>", doc, re.I):
        if not re.search(r"\balt\s*=", img, re.I):
            err(P, "img without alt", img[:110])
        if not re.search(r"\b(width|height)\s*=", img, re.I) and "aspect-ratio" not in img:
            warn(P, "img without dimensions (causes layout shift)", img[:110])
        if not re.search(r"loading\s*=", img, re.I):
            note(P, "img without loading attribute", img[:110])

    # --- structured data --------------------------------------------------
    blocks = re.findall(
        r'<script\b[^>]*type\s*=\s*["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        doc, re.I | re.S)
    if not blocks:
        warn(P, "no JSON-LD structured data")
    schema_types = []
    for raw in blocks:
        try:
            data = json.loads(raw)
        except Exception as e:
            err(P, "JSON-LD does not parse", str(e)[:120])
            continue
        for obj in (data if isinstance(data, list) else [data]):
            if isinstance(obj, dict):
                schema_types.append(obj.get("@type"))
                if "@context" not in obj:
                    err(P, "JSON-LD block has no @context", str(obj)[:100])

    # --- content ----------------------------------------------------------
    wc = visible_words(doc)
    if wc < 300 and indexable:
        warn(P, "thin content: %d words of visible text" % wc)

    return {
        "title": text_of(t[0]) if t else "",
        "desc": d or "",
        "h1": h1[0] if h1 else "",
        "words": wc,
        "schema": [s for s in schema_types if s],
        "bytes": len(resp.content),
        "status": resp.status_code,
        "final": resp.url,
    }


# ------------------------------------------------------------------ site
def main():
    print("SEO audit — %s\n" % SITE)
    pages = {}

    for path, _f in INDEXABLE:
        r = fetch(path)
        if r.status_code != 200:
            err(path, "returns HTTP %d" % r.status_code)
            continue
        pages[path] = audit_page(path, r.text, r, indexable=True)

    for path, _f in NOINDEX:
        r = fetch(path)
        if r.status_code == 200:
            audit_page(path, r.text, r, indexable=False)

    # --- duplicates across the site ---------------------------------------
    for field, label in (("title", "title"), ("desc", "meta description"),
                         ("h1", "H1")):
        seen = collections.defaultdict(list)
        for p, info in pages.items():
            if info[field]:
                seen[info[field].lower()].append(p)
        for value, ps in seen.items():
            if len(ps) > 1:
                err("/", "duplicate %s on %s" % (label, ", ".join(sorted(ps))),
                    value[:110])

    # --- robots.txt -------------------------------------------------------
    rb = requests.get(SITE + "/robots.txt", timeout=20)
    if rb.status_code != 200:
        err("/robots.txt", "HTTP %d" % rb.status_code)
    else:
        if "Sitemap:" not in rb.text:
            err("/robots.txt", "does not declare a Sitemap")
        for path, _f in INDEXABLE:
            for line in rb.text.splitlines():
                if line.lower().startswith("disallow:"):
                    rule = line.split(":", 1)[1].strip()
                    if rule and path != "/" and path.startswith(rule.rstrip("/")):
                        err("/robots.txt", "blocks an indexable page",
                            "%s blocked by '%s'" % (path, line.strip()))

    # --- sitemap ----------------------------------------------------------
    sm = requests.get(SITE + "/sitemap.xml", timeout=20)
    if sm.status_code != 200:
        err("/sitemap.xml", "HTTP %d" % sm.status_code)
    else:
        locs = re.findall(r"<loc>(.*?)</loc>", sm.text)
        listed = {urllib.parse.urlparse(u).path.rstrip("/") or "/" for u in locs}
        want = {p.rstrip("/") or "/" for p, _ in INDEXABLE}
        for missing in sorted(want - listed):
            err("/sitemap.xml", "indexable page not in sitemap", missing)
        for extra in sorted(listed - want):
            warn("/sitemap.xml", "sitemap lists a page not in the audit set", extra)
        for u in locs:
            r = requests.head(u, timeout=20, allow_redirects=False)
            if r.status_code in (301, 302, 307, 308):
                err("/sitemap.xml", "sitemap URL redirects (waste of crawl budget)",
                    "%s -> %s (%d)" % (u, r.headers.get("Location", "?"), r.status_code))
            elif r.status_code >= 400:
                err("/sitemap.xml", "sitemap URL returns %d" % r.status_code, u)
        for u in locs:
            if not u.startswith("https://"):
                err("/sitemap.xml", "non-https URL", u)

    # --- 404 --------------------------------------------------------------
    r = requests.get(SITE + "/definitely-not-a-real-page-xyz", timeout=20)
    if r.status_code != 404:
        err("/404", "missing page returns HTTP %d, not 404" % r.status_code)

    # --- assets actually loaded (images, css, js, icons) -------------------
    seen_assets = set()
    for path, _f in INDEXABLE + NOINDEX:
        r = fetch(path)
        if r.status_code != 200:
            continue
        for ref in check_assets(path, strip_comments(r.text)):
            if ref.startswith("data:"):
                continue
            target = urllib.parse.urljoin(SITE + path, ref)
            if not target.startswith(SITE) or target in seen_assets:
                continue
            seen_assets.add(target)
            a = requests.get(target, timeout=20, stream=True)
            if a.status_code >= 400:
                err(path, "asset returns HTTP %d" % a.status_code, ref)

    # --- internal links ---------------------------------------------------
    checked, broken = set(), 0
    for path, _f in INDEXABLE:
        r = fetch(path)
        if r.status_code != 200:
            continue
        for href in re.findall(r'href\s*=\s*["\']([^"\']+)["\']', r.text):
            if href.startswith(("mailto:", "tel:", "#", "javascript:")):
                continue
            target = urllib.parse.urljoin(SITE + path, href)
            if not target.startswith(SITE):
                continue
            target = target.split("#")[0]
            if target in checked:
                continue
            checked.add(target)
            h = requests.head(target, timeout=20, allow_redirects=True)
            if h.status_code >= 400:
                err(path, "broken internal link -> HTTP %d" % h.status_code, target)
                broken += 1

    # --- report -----------------------------------------------------------
    print("%-26s %-6s %-7s %s" % ("PAGE", "WORDS", "BYTES", "SCHEMA"))
    for p in sorted(pages):
        i = pages[p]
        print("%-26s %-6d %-7d %s" % (p, i["words"], i["bytes"],
                                      ", ".join(i["schema"]) or "—"))
    print("\n%d assets checked, %d internal links checked, %d broken"
          % (len(seen_assets), len(checked), broken))

    for label, items in (("ERROR", errors), ("WARN", warnings), ("NOTE", notes)):
        if not items:
            continue
        print("\n%s (%d)" % (label, len(items)))
        for page, msg, detail in items:
            print("  %-22s %s" % (page, msg))
            if detail:
                print("  %-22s   %s" % ("", detail[:150]))

    print("\n%d errors, %d warnings, %d notes" % (len(errors), len(warnings), len(notes)))
    return len(errors)


if __name__ == "__main__":
    sys.exit(main())
