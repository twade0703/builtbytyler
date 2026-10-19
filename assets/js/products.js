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
                 (see hologram.js; omit for a clean placeholder panel)
     reel        product reel (mp4), rendered from the CombineCAD build; when set
                 it replaces the hologram, plays when on screen and opens large
     poster      the reel's still frame
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
    tagline: "Portable 3-axis camera arm for creators",
    holo: "arm",
    reel: "assets/img/hw/nemo-reel-1.mp4",
    poster: "assets/img/hw/nemo-reel-1-poster.jpg",
    status: "In design",
    featured: true,
    available: false,
    description:
      "A three-axis robotic camera arm for streamers and creators. Every joint is a NEMA 17 " +
      "stepper driving through a cycloidal gearbox, so moves are smooth and hold their position " +
      "under load. It runs from a USB-C power bank, so it goes wherever the shoot is, and the " +
      "1/4-20 mount takes whatever camera you already own. Moves are programmed and played back " +
      "over Bluetooth.",
    specs: [
      { label: "Motion", value: "3-axis · base, shoulder, elbow" },
      { label: "Drive", value: "NEMA 17 steppers · cycloidal gearboxes" },
      { label: "Power", value: "USB-C PD power bank · portable" },
      { label: "Camera", value: "1/4-20 mount · any camera" },
      { label: "Control", value: "ESP32 · TMC2209 · Bluetooth presets" },
      { label: "Status", value: "In design" },
    ],
  },
  {
    id: "fpv-drones",
    name: "3\" Mini FPV Quad",
    tagline: "The i4: a 3-inch ducted mini quad",
    holo: "drone",
    reel: "assets/img/hw/i4-reel-1.mp4",
    poster: "assets/img/hw/i4-reel-1-poster.jpg",
    status: "In testing",
    featured: true,
    available: false,
    description:
      "The i4: a 3\" ducted mini quad with a one-piece 3D-printed airframe in carbon-fibre PLA " +
      "or PLA Aero. Wide arms run straight under each motor, the four ducts are braced to each " +
      "other, and a bumper band around the outside takes the hit in a crash. It comes with the " +
      "STEP and STL files for every part, and a SpeedyBee F405 flight controller running " +
      "Betaflight, programmed and bound to a remote.",
    specs: [
      { label: "Airframe", value: "One printed piece · PLA-CF or PLA Aero" },
      { label: "Frame", value: "4 × 82 mm ducts · 125 mm wheelbase · bumper band" },
      { label: "Motors", value: "4 × XING2 1404 3800 kV · 3\" tri-blade props" },
      { label: "Flight controller", value: "SpeedyBee F405 AIO · Betaflight" },
      { label: "Video", value: "HGLRC Zeus Nano 5.8 GHz · RunCam Nano 4" },
      { label: "Radio", value: "RadioMaster RP1 ELRS · 4S 650 mAh" },
      { label: "Files", value: "STEP + STL included" },
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
