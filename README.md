# builtbytyler.com

A one-person studio site with two jobs: sell the hardware Tyler Wade designs and
builds, and sell the software and web work he does for other businesses.

Static HTML, CSS and vanilla JS. No build step, no framework, no bundler — open
a page and it runs. Deployed to Cloudflare Pages (see `_headers`).

---

## Layout

```
builtbytyler/
├── index.html              Home — the studio, its two halves, featured builds
├── shop.html               Product collection + orderable build packages
├── software.html           Software & web services, process, published pricing
├── about.html              Who Tyler is; mechanical + software
├── contact.html            Ways to reach him (accepts ?plan= from software.html)
├── product.html            Product detail, driven by ?id=<slug>
├── policies.html           Lead times, shipping, refunds — the terms of sale
├── order-confirmed.html    Stripe success return page
├── checkout-test.html      Standalone Stripe harness. Self-contained by design:
│                           it has its own inline CSS and links nothing from
│                           assets/, so a broken stylesheet can never mask a
│                           broken checkout. Do not wire it into the design system.
├── _headers                Cloudflare response headers (CSP, HSTS, robots)
├── CNAME                   Custom domain for the GitHub Pages origin
│
├── assets/
│   ├── css/
│   │   ├── styles.css      The design system. All tokens live in :root.
│   │   └── motion.css      The motion engine. Loaded AFTER styles.css.
│   ├── js/
│   │   ├── products.js     Catalog + packages — the single source of truth
│   │   ├── components.js   Shared chrome (nav, footer, cart drawer, modals)
│   │   ├── main.js         Behaviour: grids, cart, nav, HUD, plan handoff, reveals
│   │   ├── hologram.js     2D-canvas wireframe holograms (cards + detail)
│   │   └── starfield.js    The drifting star field behind every page (Three.js, ESM)
│   └── img/                Photography and raster assets
│
└── tools/
    └── devserver.py        Local server that sends Cache-Control: no-store
```

## Running it locally

```bash
python builtbytyler/tools/devserver.py 5500
```

Then open <http://localhost:5500>. Use this rather than a plain
`python -m http.server`: the pages are cached aggressively otherwise, and you
will spend an afternoon debugging a stylesheet the browser stopped fetching.

`starfield.js` is an ES module and imports Three.js over the network, so the
site must be served over HTTP — opening `index.html` from the filesystem will
silently skip the backdrop.

---

## The three layers

**1 · Design system — `assets/css/styles.css`**
Every colour, type size, radius and shadow is a custom property in `:root`.
Retune the look there and the whole site follows. The visual language is
engineered rather than soft: near-square corners, hairline rules, mono
micro-labels, one cut corner on the primary button, and a serif italic
(`--font-accent`) for emphasis.

The serif is a **page-opener device only** — scoped to `h1 em` and `.display em`.
At h2/h3 scale it stops reading as editorial and starts reading as the wrong
font; below h1 the emphasis is carried by weight and accent colour instead.

**2 · Motion engine — `assets/css/motion.css`**
One easing curve, four speeds, and scroll reveals built on native CSS
`animation-timeline: view()` — no GSAP, no Lenis, no scroll hijacking, and no
IntersectionObserver on browsers that support timelines.

| Attribute | Effect |
|---|---|
| `data-enter` | Above-the-fold: children rise in sequence on a timer |
| `data-split` | Headline splits into per-word spans that rise individually |
| `data-reveal` | Rise into view on scroll. Also `scale`, `blur`, `left`, `right` |
| `data-reveal-i="1..8"` | Stagger siblings — offsets the *range*, not a delay |
| `data-draw` | A rule that draws itself across as it enters |
| `data-parallax` | Depth drift as the element crosses the viewport |

There is no marquee, ticker or auto-scrolling text strip, and none is to be
added. Sideways-sliding text is unreadable and carries no information.

Two rules matter when editing it:

- `animation-delay` does **nothing** on a scroll timeline. The timeline is
  scroll position, not wall-clock, so a delay never fires. Stagger by shifting
  `animation-range` instead — that is what `data-reveal-i` does.
- Every hidden state is gated behind `@supports` **and** the `.js-reveal` class
  that `main.js` sets. A browser without scroll timelines and without working
  JavaScript shows the content immediately. Content first, motion second.

`prefers-reduced-motion: reduce` turns the entire layer off in one block.

**3 · Backdrop — `assets/js/starfield.js`**
A fixed full-viewport field of drifting stars that dollies forward as the page
scrolls, plus a vignette veil over it (`body::before` in `styles.css`). Three
`THREE.Points` layers and a camera — no post-processing, no models.

It is a *field* and nothing else. An earlier version flew wireframe models
through the same corridor and was cut for competing with the type; do not add
objects back into it.

Two things in there are load-bearing and easy to break:

- The far layer sets `sizeAttenuation: false`. The original scene ran an
  UnrealBloom pass that was quietly making sub-pixel stars visible; without it,
  attenuated points at distance render under one pixel and the field vanishes.
- `frame(0, 0)` is called once before the rAF loop starts. A page loaded in a
  background tab gets no animation frames at all, so without that first
  synchronous paint the field is simply absent until the tab is focused.

It degrades in three steps: no WebGL or a CDN failure leaves the static site
untouched, `prefers-reduced-motion` renders one still frame with no loop, and
phones get ~40% of the particles at a capped pixel ratio with no MSAA.

---

## The holograms

`hologram.js` draws each product as a wireframe on a 2D canvas — procedural
geometry and a hand-rolled projection, no library. What makes it read as a
projection rather than a line drawing is depth: every edge is graded along
colour, opacity, width and glow from a cold thin far blue to a hot bright near
white-cyan, across 16 bands. That grade is doing the job hidden-line removal
would do in a real 3D renderer, which a canvas cannot afford.

Per frame: a floor pool, one wide-blur haze pass, the depth-graded cores in
`lighter` composite, a rising scan band that re-lights what it crosses, and
vertex glints in two passes. Everything batches per depth band, so a model
costs a couple of dozen stroke calls regardless of edge count. Only a hovered
hologram animates, and the loop winds itself down when the pointer leaves.

Two things that look like details but are not:

- Rotor blades are tapered planforms (`BLADE`), never spokes. A three-spoke
  star reads as a wheel at any size.
- `resize()` sets `canvas.width`, which wipes the bitmap, so it must be
  followed by a `render()`. Without that a single resize leaves every
  hologram permanently blank.

## Editing the catalog

`assets/js/products.js` is the only file to touch. `PRODUCTS` are the showcase
pieces; `PACKAGES` are the configured builds that carry prices and Stripe
payment links. A package is only buyable when `paymentLink` is a real
`https://buy.stripe.com/…` URL — otherwise the button falls back to the enquiry
flow so it can never dead-end.

## Editing software pricing

Prices live in the markup of `software.html` (`#pricing`), in the four stat
tiles near the top of that page, and in the `PLANS` map in `main.js`, which
carries the tier across to `contact.html?plan=…`. **Change all three.**

Current: Launch $500 + $50/mo · Growth $3,000 + $200/mo · Product $6,000.

These are deliberately below the rates in `00 Framework/BENCHMARK.md`. The
model here is volume — a large number of small retainers run largely
hands-off — rather than the smaller number of higher-value builds that
research describes. Launch is expected to rise to $1,000 + $50/mo.

## Payments — software plans

The three tiers are wired to live Stripe Payment Links. `SOFTWARE_PLANS` in
`assets/js/products.js` is the only place a link lives; `main.js` turns a tier
whose plan carries a real `buy.stripe.com` link into a direct checkout and
leaves the rest as enquiry links, so a missing or mistyped link degrades to
the enquiry flow instead of dead-ending.

| Tier | Charged today | Then | Stripe line items |
|---|---|---|---|
| Launch | $550 | $50/mo | Launch build (one-off) + Website Care Plan (monthly) |
| Growth | $3,200 | $200/mo | Growth build (one-off) + Growth care plan (monthly) |

Product is **consultation only** and deliberately has no link. Its $6,000 is a
floor, not a price, and the tier reads "From $6,000 / By consultation". A
`consultOnly: true` plan is skipped by the checkout wiring even if someone
pastes a link into it. The link that briefly existed for it is deactivated in
Stripe.

Each link redirects to `order-confirmed.html?type=software`, which is what
switches that page from build copy to software copy. If you create a new link,
set that redirect or the payer is told their hardware is in the queue.

The tier prices are printed in `software.html` as plain HTML so they work
without JavaScript. `SOFTWARE_PLANS` holds the same numbers for the enquiry
handoff, and `main.js` warns in the console if the two ever drift apart.

## Payments — general

Checkout hands off to Stripe's own hosted page. Card details are never entered
on, stored on, or transmitted through this site. `_headers` restricts
`form-action` and `frame-src` to Stripe's domains accordingly.

## Deployment

`main` is the branch that ships. Push to it and the host rebuilds.

The site is indexable: the `X-Robots-Tag: noindex, nofollow` line that sat in
`_headers` through the rebuild was removed at launch. If you ever need to take
the site back out of search while reworking it, put that line back in the `/*`
block rather than adding meta tags page by page.

`checkout-test.html` ships with the site. It carries its own `noindex` meta and
nothing links to it, but it does contain a live Stripe payment link — delete it
once checkout is settled rather than leaving a test harness on production.
