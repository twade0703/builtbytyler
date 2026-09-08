"""Stamp a version on every local asset link so a returning visitor cannot
pair new HTML with a cached old stylesheet.

This used to matter for four hours. It now matters for a year.

Originally Cloudflare served assets with `Cache-Control: max-age=14400`, so a
returning browser kept its old styles.css and main.js for four hours and
rendered new markup against them — which is exactly what happened on the
first deploy of this rebuild: new HTML, four-hour-old CSS, and the hero index
rendered as a bulleted list.

_headers now sets `max-age=31536000, immutable` on assets/js, assets/css and
assets/vendor, precisely BECAUSE this script makes every URL unique. That is
the trade: the cache is permanent, so the stamp is the only thing that
invalidates it. Ship a CSS or JS change without bumping VERSION and a
returning visitor keeps the old file for a year, not an afternoon.

Bump VERSION on any deploy that changes CSS or JS.
"""
import io, os, re, glob

VERSION = "21"
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

# The vendored three.js is imported from inside starfield.js, not linked from
# any page, so the loop above never sees it. It still sits under the immutable
# cache rule in _headers, which means without a stamp here a new three.module.js
# would be invisible to every returning visitor for a year. Stamping the import
# is what makes that cache rule honest.
MODULE_IMPORTS = [("assets/js/starfield.js", "../vendor/three.module.js")]

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

print("versioned", changed, "files at v=" + VERSION)
