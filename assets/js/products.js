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
                 it replaces the hologram, plays when on screen and opens large.
                 Keep the inline reel at 1280x720: two 2880x1620 reels decoding at once
                 dropped the page from 144 to ~94 fps on first scroll (2026-10-22)
     reelLarge   the full-size reel the "Watch it large" dialog plays (optional)
     poster      the reel's still frame
     status      the line under the name, e.g. "In testing" (defaults to "In progress")
     featured    show on the home page
     available   true = buyable now, false = sold via a build package
     description paragraph for the detail page
     keys        3 short facts shown under the build on the Hardware page
     specs       [{ label, value }] rows on the detail page
   ================================================================= */

const PRODUCTS = [
  {
    id: "nemo-arm",
    name: "NEMO Robotic Arm",
    tagline: "A camera robot on its own rail",
    holo: "arm",
    reel: "assets/img/hw/nemo-reel-8-720.mp4",
    reelLarge: "assets/img/hw/nemo-reel-8.mp4",
    poster: "assets/img/hw/nemo-reel-8-poster-720.jpg",
    status: "In design",
    keys: ["1 m camera rail", "4 cycloid joints", "1 kg payload"],
    featured: true,
    available: false,
    description:
      "A camera robot for streamers and creators. The arm rides a one metre rail on two 16 mm " +
      "hardened shafts, each held by a machined SK16 bracket at both ends, bolted into T-nuts in the " +
      "2040 extrusion, with four closed linear bearings and a GT2 belt, so slides are smooth and " +
      "repeatable. On top of the carriage are four rotary joints: base, shoulder, elbow and a " +
      "camera pan at the tip. Every rotary joint is a stepper driving our own 25:1 cycloidal " +
      "gearbox, so moves are smooth and hold their position under load. It runs from a USB-C " +
      "power bank that slides into the end of the rail, and the 1/4-20 plate takes whatever " +
      "camera you already own. Every part is 3D printed or off the shelf.",
    specs: [
      { label: "Motion", value: "Rail slide + 4 rotary joints: base, shoulder, elbow, camera pan" },
      { label: "Rail", value: "2 × 2040 extrusion · 2 × 16 mm shafts, each held by an SK16 bracket at both ends bolted into T-nuts · 4 × SC16UU · 760 mm travel" },
      { label: "Rail drive", value: "NEMA 17 · GT2 belt on a 20T pulley · 12.5 µm per step · drag chain" },
      { label: "Gearboxes", value: "Our own 25:1 cycloid in every joint · 26 rollers, 2 discs" },
      { label: "Motors", value: "NEMA 17 on the base, shoulder and elbow · NEMA 14 on the camera pan" },
      { label: "Payload", value: "1 kg camera at full reach · shoulder needs 3.6 of 4.9 N·m" },
      { label: "Reach", value: "250 mm arm on a 1 m rail" },
      { label: "Stability", value: "Tip margin 3.8 with the arm level at full reach" },
      { label: "Camera", value: "1/4-20 plate · any camera" },
      { label: "Power", value: "100 W USB-C PD power bank, inside the rail end" },
      { label: "Control", value: "ESP32 · 5 × TMC2209 · Bluetooth" },
      { label: "Size", value: "1215 × 394 × 334 mm" },
      { label: "Files", value: "STEP + STL included" },
      { label: "Status", value: "In design" },
    ],
  },
  {
    id: "fpv-drones",
    name: "3\" Mini FPV Quad",
    tagline: "The i4: a 3-inch ducted mini quad",
    holo: "drone",
    reel: "assets/img/hw/i4-reel-7-720.mp4",
    reelLarge: "assets/img/hw/i4-reel-7.mp4",
    poster: "assets/img/hw/i4-reel-7-poster-720.jpg",
    status: "In testing",
    keys: ["3-inch ducted", "319 g ready to fly", "About 7 min hover"],
    featured: true,
    available: false,
    description:
      "The i4: a 3\" ducted mini quad built for quiet, smooth flight. The airframe is one printed " +
      "piece in carbon-fibre PLA or PLA Aero: four braced ducts, arms that run straight under each " +
      "motor, and a bumper band that takes the hit in a crash. It flies four T-Motor Velox V1507 motors on " +
      "HQProp D76 tri-blades held by M5 prop nuts, off a Hummingbird 255 all-in-one flight " +
      "controller and 4-in-1 ESC. Video is a Caddx Ant camera on a TPU mount at the " +
      "nose, clear of everything in its 165° view, into a Zeus Nano transmitter, control is ExpressLRS, and it runs on a 4S 650 mAh pack. Every wire is " +
      "routed: motor leads down channels in the arms under cable ties, one harness to the camera, " +
      "video and receiver, and a 470 µF cap on the XT30 lead. It comes with the " +
      "STEP and STL files for every part, set up in Betaflight and bound to your remote.",
    specs: [
      { label: "Airframe", value: "One printed piece · PLA-CF or PLA Aero · 4 × 79 mm ducts" },
      { label: "Motors", value: "4 × T-Motor Velox V1507 4100 kV · M5 shaft, prop nuts" },
      { label: "Props", value: "HQProp D76MMX3 tri-blade · 3 in pitch · 1.5 mm tip gap" },
      { label: "Flight controller + ESC", value: "Hummingbird 255 AIO (one board) · AT32F435 · AM32 4-in-1" },
      { label: "Camera", value: "Caddx Ant Nano 1200TVL · 165° · nose mount, 25° uptilt" },
      { label: "Video", value: "HGLRC Zeus Nano 350 mW · FlyFishRC Osprey 40 mm RHCP" },
      { label: "Radio", value: "RadioMaster XR2 Nano · ExpressLRS 2.4 GHz · on the left deck ear" },
      { label: "Battery", value: "Tattu 650 mAh 4S 75C · XT30 · 15 mm strap" },
      { label: "Weight", value: "352 g ready to fly in PLA-CF · 293 g in PLA Aero" },
      { label: "Hover time", value: "About 6 min in PLA-CF · 8 min in PLA Aero (calculated)" },
      { label: "Video range", value: "About 1 to 1.5 km line of sight (estimated)" },
      { label: "Goggles", value: "Pairs with Skyzone Cobra SD X V4 · RHCP" },
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
     1. Add a product for the start fee — one-time, $500. It builds the
        site AND covers the first month ("Website build, with your first
        month").
     2. Add a SECOND line item for the care plan — recurring monthly,
        $50/month ("Website Care Plan").
     3. Set a 30-day free trial on the subscription
        (subscription_data.trial_period_days = 30). Stripe then charges the
        one-time $500 at checkout and the $50 monthly from 30 days later,
        which is exactly the published offer: $500 to start, first month
        included, then $50 a month from month two. (Since 2026-10-21. The
        old links charged $550 on day one.)
     4. Require terms of service acceptance, and put the plain price above
        the pay button (custom text): "You pay $500 today. That builds
        your site and covers your first month. Then $50 a month starting
        next month, until you cancel. ..."
     5. Under "After payment", choose "Don't show confirmation page" and
        redirect to:
            https://builtbytyler.com/order-confirmed.html?type=software
        The ?type=software is what switches that page's copy from build
        talk to software talk. Without it the payer is told their
        hardware is in the queue.
     6. Copy the https://buy.stripe.com/... URL into `paymentLink` below.

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
        // Charges $500 today (build + first month), then $50/month from
        // 30 days later. plink_1UTDPvKIfcK0fVAnITLU4boi, made 2026-10-21.
    paymentLink: "https://buy.stripe.com/5kQ7sM2A694Nfh800ugIo07",
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

/* "$500 to start (first month included), then $50/mo" — used in the
   contact.html handoff and in the
   enquiry email, so the figure a visitor was just looking at is the
   figure that reaches the inbox. A consultation tier says "from", because
   its number is a starting point rather than a price. */
function formatPlanPrice(plan) {
  if (!plan) return "";
  const money = (n) => "$" + Number(n).toLocaleString("en-US");
  if (plan.consultOnly) return "by consultation";
  if (plan.monthly == null) return money(plan.setup);
  return `${money(plan.setup)} to start (first month included), then ${money(plan.monthly)}/mo`;
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
