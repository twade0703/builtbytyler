/* =================================================================
   PRODUCTS — single source of truth for the store.
   -----------------------------------------------------------------
   To manage the catalog, edit this array only. Every page reads from
   it. Drop in real prices, copy, and images, then set `available`.

   TODO (Tyler): replace placeholder prices/descriptions/specs with
   real product details, and add/remove items as needed.

   Each product:
     id          unique slug used in product.html?id=<id>
     name        display name
     tagline     short one-liner
     price        number (USD) or null for "coming soon"
     image       path under assets/img/
     featured    show on the home page
     available   true = buyable, false = "coming soon"
     description  paragraph(s) for the detail page
     specs        [{ label, value }] rows shown on the detail page
   ================================================================= */

const PRODUCTS = [
  {
    id: "rc-rover",
    name: "RC Rover",
    tagline: "All-terrain remote-controlled rover",
    price: 0,            // TODO: real price
    image: "assets/img/AeroB.png",
    holo: "arm",         // home-page hologram model: robotic arm
    featured: true,
    available: false,    // TODO: set true when ready to sell
    description:
      "A rugged, fully custom remote-controlled rover designed and built from the ground up. " +
      "Engineered for stability over rough terrain with a focus on clean mechanical design and " +
      "responsive controls. TODO: replace with the real product story.",
    specs: [
      { label: "Drive", value: "4-wheel independent" },
      { label: "Chassis", value: "Custom CAD-designed" },
      { label: "Range", value: "TODO" },
      { label: "Lead time", value: "Made to order" },
    ],
  },
  {
    id: "remote-controller",
    name: "Remote Controller",
    tagline: "Ergonomic handheld RC transmitter",
    price: 0,            // TODO: real price
    image: "assets/img/AeroB.png",
    holo: "drone",       // home-page hologram model: quad-drone
    featured: true,
    available: false,
    description:
      "A precision handheld controller built to pair with the RC Rover and other builds. " +
      "Comfortable, durable, and tuned for fine control. TODO: replace with the real product story.",
    specs: [
      { label: "Inputs", value: "Dual analog + triggers" },
      { label: "Build", value: "3D-printed shell" },
      { label: "Battery", value: "TODO" },
      { label: "Lead time", value: "Made to order" },
    ],
  },
  {
    id: "aerospace-study",
    name: "Aerospace Study",
    tagline: "Aerodynamic design & analysis model",
    price: 0,            // TODO: real price
    image: "assets/img/Aero.png",
    holo: "evtol",       // home-page hologram model: eVTOL aircraft
    featured: true,
    available: false,
    description:
      "A design-and-analysis study exploring aerodynamic efficiency and structural form. " +
      "Available as a physical model or design package. TODO: replace with the real product story.",
    specs: [
      { label: "Format", value: "Physical model / CAD package" },
      { label: "Material", value: "TODO" },
      { label: "Scale", value: "TODO" },
      { label: "Lead time", value: "Made to order" },
    ],
  },
  {
    id: "cad-model",
    name: "CAD Model Package",
    tagline: "Production-ready 3D model files",
    price: 0,            // TODO: real price
    image: "assets/img/CAD.png",
    featured: false,
    available: false,
    description:
      "A clean, parametric CAD package ready for manufacturing or 3D printing. " +
      "Delivered as source and neutral exchange formats. TODO: replace with the real product story.",
    specs: [
      { label: "Formats", value: "STEP, STL, native" },
      { label: "Delivery", value: "Digital download" },
      { label: "License", value: "TODO" },
    ],
  },
  {
    id: "code-tool",
    name: "Engineering Tool",
    tagline: "Custom software / GUI utility",
    price: 0,            // TODO: real price
    image: "assets/img/Code.png",
    featured: false,
    available: false,
    description:
      "A bespoke software tool or GUI built to streamline an engineering workflow. " +
      "Tailored to your process. TODO: replace with the real product story.",
    specs: [
      { label: "Platform", value: "Cross-platform" },
      { label: "Delivery", value: "Digital download" },
      { label: "Support", value: "TODO" },
    ],
  },
  {
    id: "env-rig",
    name: "Workshop Rig",
    tagline: "Custom-built environment / setup",
    price: 0,            // TODO: real price
    image: "assets/img/ENV.png",
    featured: false,
    available: false,
    description:
      "A purpose-built rig or environment designed and assembled for a specific task. " +
      "Built to spec. TODO: replace with the real product story.",
    specs: [
      { label: "Build", value: "Bespoke" },
      { label: "Lead time", value: "Made to order" },
      { label: "Footprint", value: "TODO" },
    ],
  },
];

/* Helpers shared across pages */
function getProductById(id) {
  return PRODUCTS.find((p) => p.id === id) || null;
}

function formatPrice(product) {
  if (product.price === null || product.price === 0 || !product.available) {
    return '<span class="soon">Coming soon</span>';
  }
  return "$" + Number(product.price).toLocaleString("en-US");
}

// Expose globally for the non-module scripts on each page.
window.PRODUCTS = PRODUCTS;
window.getProductById = getProductById;
window.formatPrice = formatPrice;
