"""Stamp a version on every local asset link so a returning visitor cannot
pair new HTML with a cached old stylesheet.

Cloudflare Pages serves assets with `Cache-Control: public, max-age=14400`
regardless of what the `/*` block in _headers asks for, so for four hours
after a deploy a returning browser keeps its old styles.css and main.js and
renders the new markup against them. That is exactly what happened on the
first deploy of this rebuild: the HTML was new, the CSS was four hours old,
and the hero index rendered as a bulleted list.

Bump VERSION on any deploy that changes CSS or JS. It is cheap and it is the
only thing standing between a returning visitor and a broken page.
"""
import io, os, re, glob

VERSION = "4"
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
print("versioned", changed, "pages at v=" + VERSION)
