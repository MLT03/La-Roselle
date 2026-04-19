/* ---------- La Roselle — Shared storage layer ----------
 * Used by BOTH the customer site (index.html) and the admin site (admin.html).
 * All data lives in the browser's localStorage.
 */

const STORAGE_KEYS = {
  products: "laroselle.products",
  orders:   "laroselle.orders",
  settings: "laroselle.settings",
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
  contactAddress: "Your shop address here"
};

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
  }
};

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
