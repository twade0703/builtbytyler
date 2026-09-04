/* =================================================================
   PRODUCTS + PACKAGES — single source of truth for the store.
   -----------------------------------------------------------------
   To manage the catalog, edit these arrays only. Every page reads
   from them.

   Products are the showcase pieces (rendered as 3D holograms or
   placeholders — no photos). Selling happens through PACKAGES, shown
   on the shop page (shop.html#packages), where the prices live.

   TODO (Tyler): replace placeholder prices/copy with the real ones.

   Product:
     id          unique slug used in product.html?id=<id>
     name        display name
     tagline     short one-liner
     holo        home/shop hologram model: "arm" | "drone" | "evtol"
                 (omit for a clean placeholder panel)
     featured    show on the home page
     available   true = buyable now, false = sold via a build package
     description paragraph for the detail page
     specs       [{ label, value }] rows on the detail page
   ================================================================= */

const PRODUCTS = [
  {
    id: "nemo-arm",
    name: "NEMO Robotic Arm",
    tagline: "3D camera arm for streaming setups",
    holo: "arm",
    featured: true,
    available: false,
    description:
      "A six-axis robotic camera arm built for streamers and creators — programmable " +
      "motion paths, smooth tracking, and a mount tuned for 3D capture rigs. Designed, " +
      "machined and assembled end to end.",
    specs: [
      { label: "Motion", value: "6-axis articulated" },
      { label: "Payload", value: "3D camera + gimbal" },
      { label: "Control", value: "Wireless · motion presets" },
      { label: "Lead time", value: "Made to order" },
    ],
  },
  {
    id: "fpv-drones",
    name: "Quad FPV Drones",
    tagline: "3\", 5\" and 7\" builds, made to order",
    holo: "drone",
    featured: true,
    available: false,
    description:
      "Custom high-speed FPV quadcopters designed for racing, freestyle and long range — " +
      "lightweight carbon frames, high-output power systems and digital FPV, built and " +
      "bench-tuned by hand. Built to order in 3\", 5\" or 7\": 3\" for tight indoor and " +
      "park flying, 5\" as the all-round racing and freestyle standard, 7\" for long-range " +
      "cruising and endurance.",
    specs: [
      { label: "Sizes", value: "3\" · 5\" · 7\"" },
      { label: "Class", value: "Race / freestyle / long range" },
      { label: "Power", value: "High-KV brushless" },
      { label: "Video", value: "Digital FPV" },
      { label: "Lead time", value: "Made to order" },
    ],
  },
  {
    id: "tilt-rotor",
    name: "Tilt Rotor Drone",
    tagline: "eVTOL tilt-rotor aircraft",
    holo: "evtol",
    featured: true,
    available: false,
    description:
      "A custom tilt-rotor VTOL aircraft — lifts off vertically on its rotors, then tilts " +
      "them forward for efficient cruise. Airframe, propulsion and controls designed, built " +
      "and tuned end to end.",
    specs: [
      { label: "Config", value: "Tilt-rotor VTOL" },
      { label: "Flight", value: "Vertical lift + forward cruise" },
      { label: "Airframe", value: "Custom-built" },
      { label: "Lead time", value: "Made to order" },
    ],
  },
  {
    id: "morse-device",
    name: "Morse Code Device",
    tagline: "Transmitter and receiver ESP project",
    holo: "transmitter",
    featured: false,
    available: false,
    description:
      "A two-part Morse code kit built on the ESP platform — a transmitter and a matching " +
      "receiver that key, send and decode Morse over the air, with custom firmware and a " +
      "clean hand-built enclosure.",
    specs: [
      { label: "Platform", value: "ESP32" },
      { label: "Modules", value: "Transmitter + receiver" },
      { label: "Output", value: "Audio + light keying" },
      { label: "Lead time", value: "Made to order" },
    ],
  },
  {
    id: "laser-tracker",
    name: "Laser Tracking System",
    tagline: "Raspberry Pi turret that tracks & aims at targets",
    holo: "turret",
    featured: false,
    available: false,
    description:
      "A Raspberry Pi–powered pan/tilt laser turret. A camera spots and follows a target " +
      "while two servos slew the laser to keep it locked on — vision-based auto-aim, built " +
      "and tuned end to end.",
    specs: [
      { label: "Brain", value: "Raspberry Pi" },
      { label: "Motion", value: "2-axis pan/tilt servos" },
      { label: "Payload", value: "Laser emitter" },
      { label: "Tracking", value: "Vision-based auto-aim" },
      { label: "Lead time", value: "Made to order" },
    ],
  },
  {
    id: "rockets",
    name: "Rockets",
    tagline: "Custom model rockets, built to fly",
    holo: "rocket",
    featured: false,
    available: false,
    description:
      "Custom-designed model rockets — airframe, fins, recovery and propulsion mounts " +
      "engineered to fly and built by hand.",
    specs: [
      { label: "Type", value: "High-power model rocket" },
      { label: "Airframe", value: "Custom-built" },
      { label: "Recovery", value: "Parachute deploy" },
      { label: "Lead time", value: "Made to order" },
    ],
  },
];

/* -----------------------------------------------------------------
   BUILD PACKAGES — the things people actually order, with prices.
   Shown on shop.html#packages. TODO (Tyler): set real prices + copy.
   ----------------------------------------------------------------- */
const PACKAGES = [
  {
    id: "nemo-stream",
    name: "NEMO — Streaming Build",
    badge: "Flagship",
    price: 500,
    // TEMPORARY — awaiting the real Stripe Payment Link for this build.
    // Empty string = checkout disabled, so the button falls back to the
    // enquiry flow and never dead-ends. Paste the live link from
    // Stripe > Payment links to switch it on; nothing else to change.
    // Set the link's success URL to:
    //   https://builtbytyler.com/order-confirmed.html
    paymentLink: "",
    leadTime: "3–4 weeks from order",
    shipping: "Free shipping, continental US",
    blurb:
      "The six-axis NEMO arm configured for live streaming and 3D capture — motion, mount and controller, tuned and ready.",
    includes: [
      "6-axis NEMO robotic arm",
      "3D camera mount + gimbal",
      "Wireless controller",
      "Custom motion presets",
      "Assembly + calibration",
    ],
  },
  {
    id: "fpv-performance",
    name: "Quad FPV — Performance Build",
    badge: "Popular",
    price: 300,
    paymentLink: "",
    leadTime: "2–3 weeks from order",
    shipping: "Free shipping, continental US",
    blurb:
      "A high-speed FPV quad built from the frame up, bench-tested and ready to fly. " +
      "Choose 3\", 5\" or 7\" — tight and indoor, all-round freestyle, or long range.",
    includes: [
      "Your choice of 3\", 5\" or 7\" airframe",
      "Carbon race frame",
      "High-KV motor set",
      "Digital FPV system",
      "Tuned flight controller",
      "Bench-tested + flight-ready",
    ],
  },
  {
    id: "custom-build",
    name: "Custom Engineering Build",
    badge: "By quote",
    price: null, // quote-based — never gets a payment link
    paymentLink: "",
    leadTime: "Scoped per project",
    shipping: "Quoted per project",
    blurb:
      "Bring your own idea — full design, CAD, prototyping and fabrication, handled end to end.",
    includes: [
      "Discovery + concept",
      "Parametric CAD package",
      "Prototype iteration",
      "Final fabrication",
      "Documentation + handoff",
    ],
  },
];

/* -----------------------------------------------------------------
   SOFTWARE PLANS — the tiers on software.html#pricing.
   -----------------------------------------------------------------
   THIS IS THE ONLY PLACE TO PUT A STRIPE LINK FOR SOFTWARE.

   Paste the Payment Link from Stripe into `paymentLink` and that tier's
   button turns into a real checkout on the next page load. Leave it
   empty and the button routes to contact.html?plan=<id> instead, so a
   tier without a link can never dead-end — it just goes back to being
   an enquiry. Nothing else needs editing to switch a tier on.

   HOW TO CREATE EACH LINK (Stripe Dashboard → Payment links → New):
     1. Add a product for the build fee — one-time, e.g. "Launch — build",
        $500.
     2. Add a SECOND line item for the care plan — recurring monthly,
        e.g. "Launch — care plan", $50/month.
        Stripe bills the one-time fee on the first invoice and the
        monthly from then on, which is exactly the published offer.
     3. Under "After payment", choose "Don't show confirmation page" and
        redirect to:
            https://builtbytyler.com/order-confirmed.html?type=software
        The ?type=software is what switches that page's copy from build
        talk to software talk. Without it the payer is told their
        hardware is in the queue.
     4. Copy the https://buy.stripe.com/... URL into `paymentLink` below.

   The `setup` and `monthly` numbers here must match what software.html
   prints. They are not what renders the price — the page does that in
   plain HTML so it works without JavaScript and search engines can read
   it — so main.js compares the two on load and warns in the console if
   they ever drift apart.
   ----------------------------------------------------------------- */
const SOFTWARE_PLANS = [
  {
    id: "launch",
    name: "Launch",
    setup: 500,
    monthly: 50,
        // Charges $550 today (build + first month), then $50/month.
    paymentLink: "https://buy.stripe.com/4gMdRa1w2dl3glc6oSgIo01",
  },
  {
    id: "growth",
    name: "Growth",
    setup: 3000,
    monthly: 200,
        // Charges $3,200 today (build + first month), then $200/month.
    paymentLink: "https://buy.stripe.com/fZu14o6Qm5SBed4aF8gIo02",
  },
  {
    id: "product",
    name: "Product",
    setup: 6000,
    monthly: null,
    // Consultation only, deliberately. $6,000 is a FLOOR, not a price:
    // the work is scoped on a call before anything is quoted, so there
    // is nothing honest to charge for up front. Leaving paymentLink
    // empty keeps this tier on the enquiry route no matter what.
    //
    // The Stripe link that briefly existed for this tier has been
    // deactivated. Do not put one back without changing the tier to
    // advertise a fixed price or a deposit.
    paymentLink: "",
    consultOnly: true,
  },
];

/* True only when a plan can actually be paid for right now.
   Mirrors isBuyable() for hardware: a link that is not a real Stripe
   Payment Link is treated as no link at all, so a typo degrades to the
   enquiry flow instead of sending someone to a broken page. */
function isPlanBuyable(plan) {
  return !!(plan && typeof plan.paymentLink === "string" &&
            plan.paymentLink.startsWith("https://buy.stripe.com/"));
}

function getPlanById(id) {
  return SOFTWARE_PLANS.find((p) => p.id === id) || null;
}

/* "$500 build + $50/mo" — used in the contact.html handoff and in the
   enquiry email, so the figure a visitor was just looking at is the
   figure that reaches the inbox. A consultation tier says "from", because
   its number is a starting point rather than a price. */
function formatPlanPrice(plan) {
  if (!plan) return "";
  const money = (n) => "$" + Number(n).toLocaleString("en-US");
  if (plan.consultOnly) return `from ${money(plan.setup)}, by consultation`;
  if (plan.monthly == null) return money(plan.setup);
  return `${money(plan.setup)} build + ${money(plan.monthly)}/mo`;
}

/* True only when a package can actually be paid for right now. */
function isBuyable(pkg) {
  return !!(pkg && pkg.price != null && typeof pkg.paymentLink === "string" &&
            pkg.paymentLink.startsWith("https://buy.stripe.com/"));
}

/* Helpers shared across pages */
function getProductById(id) {
  return PRODUCTS.find((p) => p.id === id) || null;
}

function formatPrice(product) {
  if (!product.available || product.price === null || product.price === 0 || product.price == null) {
    return '<span class="soon">Coming soon</span>';
  }
  return "$" + Number(product.price).toLocaleString("en-US");
}

function formatPackagePrice(pkg) {
  if (pkg.price === null || pkg.price === undefined) return "By quote";
  return "$" + Number(pkg.price).toLocaleString("en-US");
}

// Expose globally for the non-module scripts on each page.
window.PRODUCTS = PRODUCTS;
window.PACKAGES = PACKAGES;
window.SOFTWARE_PLANS = SOFTWARE_PLANS;
window.getProductById = getProductById;
window.formatPrice = formatPrice;
window.formatPackagePrice = formatPackagePrice;
window.isBuyable = isBuyable;
window.isPlanBuyable = isPlanBuyable;
window.getPlanById = getPlanById;
window.formatPlanPrice = formatPlanPrice;
