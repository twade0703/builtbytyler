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
    tagline: "High-speed drone designs",
    holo: "drone",
    featured: true,
    available: false,
    description:
      "Custom high-speed FPV quadcopters designed for racing and freestyle — lightweight " +
      "carbon frames, high-output power systems and digital FPV, built and bench-tuned by hand.",
    specs: [
      { label: "Class", value: "5\" race / freestyle" },
      { label: "Power", value: "High-KV brushless" },
      { label: "Video", value: "Digital FPV" },
      { label: "Lead time", value: "Made to order" },
    ],
  },
  {
    id: "aerospace-study",
    name: "Aerospace Study",
    tagline: "Aerodynamic design & analysis model",
    holo: "evtol",
    featured: true,
    available: false,
    description:
      "A design-and-analysis study exploring aerodynamic efficiency and structural form, " +
      "available as a physical model or a complete design package.",
    specs: [
      { label: "Format", value: "Physical model / CAD package" },
      { label: "Focus", value: "Aero + structure" },
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
    id: "code-tool",
    name: "Engineering Tool",
    tagline: "Custom software / GUI utility",
    featured: false,
    available: false,
    description:
      "A bespoke software tool or GUI built to streamline an engineering workflow, " +
      "tailored to your process.",
    specs: [
      { label: "Platform", value: "Cross-platform" },
      { label: "Delivery", value: "Digital download" },
    ],
  },
  {
    id: "env-rig",
    name: "Workshop Rig",
    tagline: "Custom-built environment / setup",
    featured: false,
    available: false,
    description:
      "A purpose-built rig or environment designed and assembled for a specific task. Built to spec.",
    specs: [
      { label: "Build", value: "Bespoke" },
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
    price: 1450, // TODO: real price
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
    price: 890, // TODO: real price
    blurb:
      "A high-speed FPV quad built from the frame up for racing and freestyle, bench-tested and ready to fly.",
    includes: [
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
    price: null, // quote-based
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
window.getProductById = getProductById;
window.formatPrice = formatPrice;
window.formatPackagePrice = formatPackagePrice;
