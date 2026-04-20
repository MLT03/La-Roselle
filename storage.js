/* ---------- La Roselle — Shared storage layer ----------
 * Used by BOTH the customer site (index.html) and the admin site (admin.html).
 * All data lives in the browser's localStorage.
 */

const STORAGE_KEYS = {
  products: "laroselle.products",
  orders:   "laroselle.orders",
  settings: "laroselle.settings",
  content:  "laroselle.content",
  theme:    "laroselle.theme",
  cart:     "laroselle.cart",
  admin:    "laroselle.admin",
  lang:     "la-roselle-lang"
};

const DEFAULT_SETTINGS = {
  shopName: "La Roselle",
  currency: "MRU",                 // display symbol for prices
  bankilyNumber: "00 00 00 00",    // your Bankily phone number
  bankilyName: "La Roselle",       // recipient name shown to customer
  whatsappNumber: "",              // e.g. "22200000000" (intl, no +)
  contactEmail: "hello@laroselle.com",
  contactPhone: "+000 000 000",
  contactAddress: "Your shop address here",
  /* Payment methods on/off */
  paymentBankilyEnabled: true,
  paymentCodEnabled: true,
  /* Social links (leave empty to hide) */
  instagramUrl: "",
  facebookUrl: "",
  tiktokUrl: "",
  /* Languages — uncheck to hide the language switch button */
  langEnEnabled: true,
  langFrEnabled: true,
  langArEnabled: true,
  /* Shipping & order notes */
  shippingFee: 0,
  freeShippingAbove: 0,  // 0 = disabled
  minOrder: 0,           // 0 = no minimum
  /* Visibility toggles */
  showAboutSection: true,
  showContactSection: true,
  showHeroFlowers: true
};

/* Content overrides — merged on top of TRANSLATIONS for the customer site.
 * Shape: { en: { "key": "text", ... }, fr: {...}, ar: {...} } */
const DEFAULT_CONTENT = { en: {}, fr: {}, ar: {} };

/* Theme overrides — applied as CSS custom properties at runtime. */
const DEFAULT_THEME = {
  colors: {
    blush400: "",     // hero/cta base pink — leave empty for default
    blush500: "",     // buttons/prices
    roseDeep: "",     // headings
    gold:     "",     // accents
    ink:      "",     // body text
    cream:    ""      // background
  },
  logoDataUrl: "",      // optional replacement for the rose icon
  heroImageDataUrl: "", // optional background image for the hero
  faviconDataUrl: ""    // optional favicon override
};

/* The editable-content schema: defines which UI strings the admin can override,
 * grouped by section for the editor. The default text for each key comes
 * from translations.js (TRANSLATIONS) — here we just list the keys. */
const CONTENT_SCHEMA = [
  { title: "Header & brand", keys: [
    ["brand.tagline", "input"],
    ["nav.home", "input"], ["nav.products", "input"], ["nav.about", "input"], ["nav.contact", "input"]
  ]},
  { title: "Hero (top banner)", keys: [
    ["hero.eyebrow", "input"], ["hero.title", "input"],
    ["hero.subtitle", "textarea"], ["hero.cta", "input"]
  ]},
  { title: "Products section", keys: [
    ["products.eyebrow", "input"], ["products.title", "input"],
    ["products.subtitle", "textarea"], ["products.filter", "input"],
    ["products.all", "input"], ["products.addToCart", "input"]
  ]},
  { title: "About section", keys: [
    ["about.eyebrow", "input"], ["about.title", "input"], ["about.body", "textarea"]
  ]},
  { title: "Contact section", keys: [
    ["contact.eyebrow", "input"], ["contact.title", "input"], ["contact.body", "textarea"],
    ["contact.email", "input"], ["contact.phone", "input"], ["contact.address", "input"],
    ["contact.addressValue", "input"]
  ]},
  { title: "Cart & checkout", keys: [
    ["cart.title", "input"], ["cart.checkout", "input"], ["cart.continue", "input"],
    ["checkout.bankilyText", "textarea"], ["checkout.proofHelp", "input"]
  ]},
  { title: "Footer", keys: [
    ["footer.rights", "input"]
  ]}
];

const DEFAULT_ADMIN = {
  // Default admin password — CHANGE THIS from the admin Settings tab.
  // Stored as a simple hash (sha-256) once set.
  passwordHash: null,
  defaultPassword: "laroselle"      // used on first login if no hash set
};

const Storage = {
  /* ----- Products ----- */
  getProducts() {
    const raw = localStorage.getItem(STORAGE_KEYS.products);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    // fall back to file-based defaults (products.js)
    return (typeof DEFAULT_PRODUCTS !== "undefined") ? DEFAULT_PRODUCTS : [];
  },
  saveProducts(list) {
    localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(list));
  },
  resetProducts() {
    localStorage.removeItem(STORAGE_KEYS.products);
  },

  /* ----- Orders ----- */
  getOrders() {
    const raw = localStorage.getItem(STORAGE_KEYS.orders);
    try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  },
  saveOrders(list) {
    localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(list));
  },
  addOrder(order) {
    const list = Storage.getOrders();
    list.unshift(order);
    Storage.saveOrders(list);
  },
  updateOrder(id, patch) {
    const list = Storage.getOrders();
    const idx = list.findIndex((o) => o.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...patch };
      Storage.saveOrders(list);
    }
  },
  deleteOrder(id) {
    Storage.saveOrders(Storage.getOrders().filter((o) => o.id !== id));
  },

  /* ----- Settings ----- */
  getSettings() {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    try {
      return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
    } catch (e) { return { ...DEFAULT_SETTINGS }; }
  },
  saveSettings(s) {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(s));
  },

  /* ----- Cart ----- */
  getCart() {
    const raw = localStorage.getItem(STORAGE_KEYS.cart);
    try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  },
  saveCart(cart) {
    localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
  },
  clearCart() {
    localStorage.removeItem(STORAGE_KEYS.cart);
  },

  /* ----- Admin ----- */
  getAdmin() {
    const raw = localStorage.getItem(STORAGE_KEYS.admin);
    try {
      return { ...DEFAULT_ADMIN, ...(raw ? JSON.parse(raw) : {}) };
    } catch (e) { return { ...DEFAULT_ADMIN }; }
  },
  saveAdmin(a) {
    localStorage.setItem(STORAGE_KEYS.admin, JSON.stringify(a));
  },

  /* ----- Content (text overrides, per language) ----- */
  getContent() {
    const raw = localStorage.getItem(STORAGE_KEYS.content);
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        en: { ...(parsed.en || {}) },
        fr: { ...(parsed.fr || {}) },
        ar: { ...(parsed.ar || {}) }
      };
    } catch (e) { return { en: {}, fr: {}, ar: {} }; }
  },
  saveContent(c) {
    localStorage.setItem(STORAGE_KEYS.content, JSON.stringify(c));
  },
  resetContent() {
    localStorage.removeItem(STORAGE_KEYS.content);
  },

  /* ----- Theme (colors + images) ----- */
  getTheme() {
    const raw = localStorage.getItem(STORAGE_KEYS.theme);
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        ...DEFAULT_THEME,
        ...parsed,
        colors: { ...DEFAULT_THEME.colors, ...(parsed.colors || {}) }
      };
    } catch (e) { return { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors } }; }
  },
  saveTheme(t) {
    localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(t));
  },
  resetTheme() {
    localStorage.removeItem(STORAGE_KEYS.theme);
  }
};

/* ---------- Translation lookup with content overrides ---------- */
function tText(lang, key) {
  const overrides = Storage.getContent();
  const override = overrides[lang] && overrides[lang][key];
  if (override && override.trim() !== "") return override;
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  return dict[key] != null ? dict[key] : key;
}

/* ---------- Apply theme (CSS custom properties + favicon) ---------- */
function applyTheme() {
  const theme = Storage.getTheme();
  const root = document.documentElement;
  const map = {
    blush400: "--blush-400",
    blush500: "--blush-500",
    roseDeep: "--rose-deep",
    gold:     "--gold",
    ink:      "--ink",
    cream:    "--cream"
  };
  Object.entries(map).forEach(([k, cssVar]) => {
    const v = theme.colors[k];
    if (v && v.trim() !== "") root.style.setProperty(cssVar, v);
    else root.style.removeProperty(cssVar);
  });

  if (theme.faviconDataUrl) {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = theme.faviconDataUrl;
  }
}

/* ---------- Helpers ---------- */
async function sha256(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatPrice(amount, settings) {
  const s = settings || Storage.getSettings();
  const n = Number(amount) || 0;
  const formatted = n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  return `${formatted} ${s.currency}`;
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------- Image helpers (resize to keep localStorage small) ---------- */
function fileToResizedDataUrl(file, maxSize = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
        resolve(canvas.toDataURL(mime, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
