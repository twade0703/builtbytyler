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
     status      the line under the name, e.g. "In testing" (defaults to "In progress")
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
    name: "3\" Mini FPV Quad",
    tagline: "3D-printed ducted mini quad",
    holo: "drone",
    status: "In testing",
    featured: true,
    available: false,
    description:
      "The i4: a 3\" ducted mini quad with a 3D-printed airframe in carbon-fibre PLA or PLA Aero, " +
      "printed with a structural mesh infill. The frame is one piece and built to take a " +
      "crash: wide arms run straight under each motor, the ducts are braced to each other, " +
      "and a thicker bumper band takes the hit. It comes with the STEP and STL files for " +
      "every part, and an STM32 flight controller running Betaflight, programmed and " +
      "bound to a remote.",
    specs: [
      { label: "Airframe", value: "3D-printed PLA-CF or PLA Aero" },
      { label: "Frame", value: "One piece · braced ducts · crash bumper" },
      { label: "Files", value: "STEP + STL included" },
      { label: "Flight controller", value: "STM32 · Betaflight" },
      { label: "Radio", value: "Bound to a remote · 5.8 GHz video" },
      { label: "Status", value: "In testing" },
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
    id: "product",
    name: "Product",
    setup: null,
    monthly: null,
    // Consultation only, deliberately, and no number on the page: the work
    // is scoped on a call before anything is quoted, so there is nothing
    // honest to charge for up front (the "From $6,000" floor came off on
    // 2026-09-26, and the Growth tier with it). Leaving paymentLink
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
  if (plan.consultOnly) return "by consultation";
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
