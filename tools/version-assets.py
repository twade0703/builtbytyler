"""Stamp a version on every local asset link so a returning visitor cannot
pair new HTML with a cached old stylesheet.

This used to matter for four hours. It now matters for a year.

Originally Cloudflare served assets with `Cache-Control: max-age=14400`, so a
returning browser kept its old styles.css and main.js for four hours and
rendered new markup against them — which is exactly what happened on the
first deploy of this rebuild: new HTML, four-hour-old CSS, and the hero index
rendered as a bulleted list.

_headers now caches assets/js, assets/css and assets/vendor for seven days
`immutable`, precisely BECAUSE this script makes every URL unique. That is
the trade: within that week the stamp is the only thing that invalidates the
cache. Ship a CSS or JS change without bumping VERSION and a returning
visitor keeps the old file for a week, not an afternoon.

Seven and not a year because a query string does not change the file path:
during a deploy the previous deployment answers the new ?v= URL with the old
bytes, and the edge keeps whatever it saw. _headers has the full account.

Bump VERSION on any deploy that changes CSS or JS.
"""
import hashlib, io, json, os, re, glob, sys

VERSION = "40"
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ASSETS = [
    "assets/css/styles.css",
    "assets/css/motion.css",
    "assets/js/products.js",
    "assets/js/components.js",
    "assets/js/hologram.js",
    "assets/js/main.js",
    "assets/js/starfield.js",
]

# checkout-test.html is self-contained by design and links nothing from assets/.
pages = [f for f in glob.glob("*.html") if f != "checkout-test.html"]

changed = 0
for f in pages:
    s = io.open(f, encoding="utf-8").read()
    before = s
    for a in ASSETS:
        # match the asset with or without an existing ?v=N
        s = re.sub(
            r'(["\'])' + re.escape(a) + r'(\?v=[0-9]+)?(["\'])',
            r'\g<1>' + a + "?v=" + VERSION + r'\g<3>',
            s,
        )
    if s != before:
        io.open(f, "w", encoding="utf-8", newline="\n").write(s)
        changed += 1

# Dependencies imported from INSIDE a module are linked from no page, so the
# loop above never sees them and they need stamping here. There are none now:
# the star field used to import a vendored three.js and no longer does.
MODULE_IMPORTS = []

for src, dep in MODULE_IMPORTS:
    if not os.path.exists(src):
        continue
    s = io.open(src, encoding="utf-8").read()
    before = s
    s = re.sub(
        r'(["\'])' + re.escape(dep) + r'(\?v=[0-9]+)?(["\'])',
        r'\g<1>' + dep + "?v=" + VERSION + r'\g<3>',
        s,
    )
    if s != before:
        io.open(src, "w", encoding="utf-8", newline="\n").write(s)
        changed += 1
        print("  stamped", dep, "in", src)

# The demos under demos/ are exported from their own projects and link their
# scripts by bare name ("app.js"). Cloudflare caches those for four hours, so
# a returning visitor kept an old app.js for an afternoon after every change.
# Each local script is stamped with a hash of ITS OWN CONTENT, not VERSION: the
# URL moves only when that file does, so the 365 KB data file stays cached
# across deploys that never touched it. A fresh export arrives unstamped and
# is stamped again here, on the next run.
for page in glob.glob("demos/*/index.html"):
    folder = os.path.dirname(page)
    s = io.open(page, encoding="utf-8").read()
    before = s

    def stamp(m):
        name = m.group(2)
        path = os.path.join(folder, name)
        if "/" in name or not os.path.exists(path):
            return m.group(0)
        h = hashlib.sha1(io.open(path, "rb").read()).hexdigest()[:8]
        return m.group(1) + name + "?v=" + h + m.group(4)

    s = re.sub(r'(<script src=")([A-Za-z0-9_.-]+\.js)(\?v=[0-9a-f]+)?(")', stamp, s)
    if s != before:
        io.open(page, "w", encoding="utf-8", newline="\n").write(s)
        changed += 1
        print("  stamped scripts in", page.replace(os.sep, "/"))

print("versioned", changed, "files at v=" + VERSION)

# ---------------------------------------------------------------- the guard
#
# Bumping VERSION is a manual step, and forgetting it is now expensive rather
# than merely untidy: with `immutable` on assets/*, a URL that does not change
# is a URL that never refetches. This has already happened once — starfield.js
# was edited and shipped under an unchanged v=21, so the edge kept serving the
# previous file behind that exact URL for every visitor while the unstamped
# path returned the new one. That is invisible unless you fetch the stamped URL
# specifically, which is why it survived a "verified live" check.
#
# So the script records what each version's bytes were, and refuses to let the
# contents of an already-recorded version change underneath it.
LEDGER = os.path.join("tools", "asset-hashes.json")
TRACKED = ASSETS + [dep for _s, dep in MODULE_IMPORTS]


def sha(path):
    return hashlib.sha256(io.open(path, "rb").read()).hexdigest()[:16]


now = {}
for a in ASSETS:
    if os.path.exists(a):
        now[a] = sha(a)
for src, dep in MODULE_IMPORTS:
    p = os.path.normpath(os.path.join(os.path.dirname(src), dep.split("?")[0]))
    if os.path.exists(p):
        now[p.replace(os.sep, "/")] = sha(p)

ledger = {}
if os.path.exists(LEDGER):
    ledger = json.load(io.open(LEDGER, encoding="utf-8"))

was = ledger.get(VERSION)
if was and was != now:
    drifted = sorted(k for k in now if was.get(k) != now[k])
    print("", file=sys.stderr)
    print("ERROR: these files changed but VERSION is still %s:" % VERSION, file=sys.stderr)
    for d in drifted:
        print("         %s  %s -> %s" % (d, was.get(d, "(new)"), now[d]), file=sys.stderr)
    print("", file=sys.stderr)
    print("       Their URLs are cached `immutable`, so shipping this would serve", file=sys.stderr)
    print("       the OLD bytes to every returning visitor. Bump VERSION and", file=sys.stderr)
    print("       re-run.", file=sys.stderr)
    sys.exit(1)

ledger[VERSION] = now
io.open(LEDGER, "w", encoding="utf-8", newline="\n").write(
    json.dumps(ledger, indent=1, sort_keys=True) + "\n")
print("recorded %d asset hashes for v=%s" % (len(now), VERSION))
