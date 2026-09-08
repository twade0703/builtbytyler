/* =================================================================
   PRODUCTS — single source of truth for the builds.
   -----------------------------------------------------------------
   To manage the catalogue, edit this array only. Every page reads
   from it.

   These are the machines on the bench, rendered as 3D holograms —
   no photos. NONE OF THEM ARE FOR SALE. There is no price field and
   no checkout anywhere in this file for a reason: a price on a thing
   that cannot be bought is a promise that cannot be kept. If builds
   open later, that is a deliberate change, not a missing feature.

   Product:
     id          unique slug used in product.html?id=<id>
     name        display name
     tagline     short one-liner
     holo        hologram model: "arm" | "drone" | "evtol"
                 (see hologram.js;
                 omit for a clean placeholder panel)
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
      { label: "Status", value: "In progress" },
    ],
  },
  {
    id: "fpv-drones",
    name: "Quad FPV Drones",
    tagline: "Race, freestyle and long-range quads",
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
      { label: "Status", value: "In progress" },
    ],
  },
  {
    id: "tilt-rotor",
    name: "Tilt-Rotor Drone",
    tagline: "VTOL aircraft that lifts like a helicopter and flies like a plane",
    holo: "evtol",
    featured: true,
    available: false,
    description:
      "A custom tilt-rotor VTOL aircraft. It lifts off vertically on its proprotors, then " +
      "tilts them forward and flies on the wing for efficient cruise — the transition is " +
      "the hard part, and it is the part that was designed, built and tuned here end to end.",
    specs: [
      { label: "Config", value: "Tilt-rotor VTOL" },
      { label: "Flight", value: "Vertical lift · wing-borne cruise" },
      { label: "Airframe", value: "Custom-built" },
      { label: "Status", value: "In progress" },
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
   A link that is not a real Stripe Payment Link is treated as no link
   at all, so a typo degrades to the enquiry flow instead of sending
   someone to a broken page. */
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


/* Helpers shared across pages */
function getProductById(id) {
  return PRODUCTS.find((p) => p.id === id) || null;
}

/* Nothing here is for sale yet, so there is one status and it is honest.
   A price on a thing you cannot buy is worse than no price. */
function formatPrice() {
  return '<span class="soon">In progress</span>';
}


// Expose globally for the non-module scripts on each page.
window.PRODUCTS = PRODUCTS;
window.SOFTWARE_PLANS = SOFTWARE_PLANS;
window.getProductById = getProductById;
window.formatPrice = formatPrice;
window.isPlanBuyable = isPlanBuyable;
window.getPlanById = getPlanById;
window.formatPlanPrice = formatPlanPrice;
