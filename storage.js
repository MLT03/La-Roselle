/* ---------- La Roselle — Supabase-backed storage layer ----------
 * Used by BOTH the customer site (index.html) and the admin (admin.html).
 *
 * Data layout:
 *   Supabase tables: products, orders, settings, content, theme
 *   Supabase Storage: products (public), theme (public), proofs (private)
 *   Cart stays in localStorage (per-device, per-session).
 *
 * All Storage.* data methods are async. Helpers (tText, formatPrice,
 * Storage.getCached*) stay synchronous and read from an in-memory cache
 * that is populated by Storage.init() and kept fresh by realtime.
 */

const SUPABASE_URL  = "https://tagawtcbszdfnltixsic.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhZ2F3dGNic3pkZm5sdGl4c2ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTQ4MTYsImV4cCI6MjA5MjI3MDgxNn0.yEoHGiHNEp3_u3lWb1MyDDJSmbjtZm_eJvGmdAUgzqk";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
window.sb = sb;

const STORAGE_KEYS = {
  cart: "laroselle.cart",
  lang: "la-roselle-lang",
  // Legacy (for one-time local→supabase migration button)
  products: "laroselle.products",
  orders:   "laroselle.orders",
  settings: "laroselle.settings",
  content:  "laroselle.content",
  theme:    "laroselle.theme"
};

const DEFAULT_SETTINGS = {
  shopName: "La Roselle",
  currency: "MRU",
  bankilyNumber: "00 00 00 00",
  bankilyName: "La Roselle",
  whatsappNumber: "",
  contactEmail: "hello@laroselle.com",
  contactPhone: "+000 000 000",
  contactAddress: "Your shop address here",
  paymentBankilyEnabled: true,
  paymentCodEnabled: true,
  instagramUrl: "",
  facebookUrl: "",
  tiktokUrl: "",
  langEnEnabled: true,
  langFrEnabled: true,
  langArEnabled: true,
  shippingFee: 0,
  freeShippingAbove: 0,
  minOrder: 0,
  showAboutSection: true,
  showContactSection: true,
  showHeroFlowers: true
};

const DEFAULT_CONTENT = { en: {}, fr: {}, ar: {} };

const DEFAULT_THEME = {
  colors: {
    blush400: "",
    blush500: "",
    roseDeep: "",
    gold:     "",
    ink:      "",
    cream:    ""
  },
  logoDataUrl: "",      // now holds a public URL (field name kept for back-compat)
  heroImageDataUrl: "",
  faviconDataUrl: ""
};

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
    ["products.all", "input"], ["products.addToCart", "input"],
    ["products.search", "input"]
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

/* Bucket names (must match what was provisioned in Supabase Storage) */
const BUCKETS = {
  products: "products",
  theme:    "theme",
  proofs:   "proofs"
};

/* ---------- Row ↔ JS product shape ----------
 * DB row: { id, data, stock, sort_order, updated_at }
 * JS:     { id, price, images[], image, category, name, description, stock, sort_order }
 * `image` is derived (= images[0] || "") for backward compat.
 */
function productFromRow(row) {
  const d = row.data || {};
  const images = Array.isArray(d.images) ? d.images : (d.image ? [d.image] : []);
  return {
    id: row.id,
    price: Number(d.price) || 0,
    images,
    image: images[0] || "",
    category: d.category || { en: "", fr: "", ar: "" },
    name:     d.name     || { en: "", fr: "", ar: "" },
    description: d.description || { en: "", fr: "", ar: "" },
    stock: Number(row.stock) || 0,
    sort_order: Number(row.sort_order) || 0
  };
}
function productToRow(p) {
  return {
    id: p.id,
    stock: Math.max(0, Math.floor(Number(p.stock) || 0)),
    sort_order: Number(p.sort_order) || 0,
    data: {
      price: Number(p.price) || 0,
      images: Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []),
      image: (Array.isArray(p.images) && p.images[0]) || p.image || "",
      category: p.category || { en: "", fr: "", ar: "" },
      name:     p.name     || { en: "", fr: "", ar: "" },
      description: p.description || { en: "", fr: "", ar: "" }
    }
  };
}

/* ---------- In-memory cache for sync helpers ---------- */
const _cache = {
  products: null,   // array
  settings: { ...DEFAULT_SETTINGS },
  content:  { en: {}, fr: {}, ar: {} },
  theme:    { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors } }
};

const Storage = {
  /* ---------- Init / cache ---------- */
  async init() {
    // Populate caches in parallel
    await Promise.all([
      Storage.getSettings(),
      Storage.getContent(),
      Storage.getTheme(),
      Storage.getProducts()
    ]);
  },

  getCachedSettings() { return _cache.settings; },
  getCachedContent()  { return _cache.content; },
  getCachedTheme()    { return _cache.theme; },
  getCachedProducts() { return _cache.products || []; },

  /* ---------- Products ---------- */
  async getProducts() {
    const { data, error } = await sb
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: true });
    if (error) { console.error("getProducts", error); return _cache.products || []; }
    if (!data || data.length === 0) {
      _cache.products = [];
      // If table is empty, fall back to the static DEFAULT_PRODUCTS for rendering
      // but DO NOT auto-seed the DB. Caller uses "Reset to defaults" to seed.
      const fallback = (typeof DEFAULT_PRODUCTS !== "undefined")
        ? DEFAULT_PRODUCTS.map((p, i) => ({
            ...p,
            images: Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []),
            stock: p.stock != null ? Number(p.stock) : 10,
            sort_order: i + 1
          }))
        : [];
      return fallback;
    }
    _cache.products = data.map(productFromRow);
    return _cache.products;
  },

  async saveProducts(list) {
    // Upsert all rows, delete rows whose id is no longer present.
    const rows = list.map((p, i) => {
      const row = productToRow(p);
      if (!row.sort_order) row.sort_order = i + 1;
      return row;
    });
    const ids = rows.map((r) => r.id);

    const { error: upErr } = await sb
      .from("products")
      .upsert(rows, { onConflict: "id" });
    if (upErr) { console.error("saveProducts upsert", upErr); throw upErr; }

    // Delete rows not in the new list
    if (ids.length > 0) {
      const { error: delErr } = await sb
        .from("products")
        .delete()
        .not("id", "in", `(${ids.map((x) => `"${x.replace(/"/g, "")}"`).join(",")})`);
      if (delErr) console.error("saveProducts delete", delErr);
    } else {
      await sb.from("products").delete().neq("id", "__never__");
    }
    await Storage.getProducts();
  },

  async saveProduct(p) {
    const row = productToRow(p);
    if (!row.sort_order) {
      // Place new products at the end
      const existing = _cache.products || [];
      row.sort_order = (existing.reduce((m, x) => Math.max(m, x.sort_order || 0), 0)) + 1;
    }
    const { error } = await sb
      .from("products")
      .upsert(row, { onConflict: "id" });
    if (error) { console.error("saveProduct", error); throw error; }
    await Storage.getProducts();
  },

  async deleteProduct(id) {
    const { error } = await sb.from("products").delete().eq("id", id);
    if (error) { console.error("deleteProduct", error); throw error; }
    await Storage.getProducts();
  },

  async resetProducts() {
    const { error } = await sb.from("products").delete().neq("id", "__never__");
    if (error) { console.error("resetProducts", error); throw error; }
    _cache.products = [];
  },

  async reorderProducts(idList) {
    // Update sort_order for each id in the given order. One upsert.
    const rows = idList.map((id, i) => ({ id, sort_order: i + 1 }));
    // We must include data/stock too because upsert replaces the row by default.
    // Use a per-row update instead to avoid clobbering.
    const updates = rows.map((r) =>
      sb.from("products").update({ sort_order: r.sort_order }).eq("id", r.id)
    );
    const results = await Promise.all(updates);
    results.forEach((r) => { if (r.error) console.error("reorderProducts", r.error); });
    await Storage.getProducts();
  },

  async decrementStock(items) {
    // items: [{id, qty}, ...] — atomic via RPC
    const { error } = await sb.rpc("decrement_stock", { items });
    if (error) {
      const msg = (error.message || "").toString();
      const m = msg.match(/insufficient_stock:(\S+)/);
      const productId = m ? m[1] : null;
      const e = new Error("insufficient_stock");
      e.productId = productId;
      throw e;
    }
    await Storage.getProducts();
  },

  async restockItems(items) {
    const { error } = await sb.rpc("restock_items", { items });
    if (error) { console.error("restockItems", error); throw error; }
    await Storage.getProducts();
  },

  /* ---------- Orders ---------- */
  async getOrders() {
    const { data, error } = await sb
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { console.error("getOrders", error); return []; }
    return (data || []).map((row) => ({
      ...(row.data || {}),
      id: row.id,
      status: row.status,
      createdAt: row.created_at
    }));
  },

  async addOrder(order) {
    // order must already have an id in format LR-YYMMDD-XXXX
    const { error } = await sb.from("orders").insert({
      id: order.id,
      data: order,
      status: order.status
    });
    if (error) { console.error("addOrder", error); throw error; }
  },

  async updateOrder(id, patch) {
    // Fetch current, merge into data, write back (and status column if present)
    const { data: rows, error: selErr } = await sb
      .from("orders").select("*").eq("id", id).limit(1);
    if (selErr) { console.error("updateOrder select", selErr); throw selErr; }
    if (!rows || rows.length === 0) return;
    const row = rows[0];
    const mergedData = { ...(row.data || {}), ...patch };
    const next = { data: mergedData };
    if (patch.status) next.status = patch.status;
    const { error: upErr } = await sb.from("orders").update(next).eq("id", id);
    if (upErr) { console.error("updateOrder", upErr); throw upErr; }
  },

  async deleteOrder(id) {
    const { error } = await sb.from("orders").delete().eq("id", id);
    if (error) { console.error("deleteOrder", error); throw error; }
  },

  /* ---------- Settings ---------- */
  async getSettings() {
    const { data, error } = await sb
      .from("settings").select("data").eq("id", "default").limit(1);
    if (error) { console.error("getSettings", error); return _cache.settings; }
    const val = { ...DEFAULT_SETTINGS, ...((data && data[0] && data[0].data) || {}) };
    _cache.settings = val;
    return val;
  },

  async saveSettings(s) {
    const clean = { ...s };
    Object.keys(clean).forEach((k) => {
      // Coerce numeric fields
      if (["shippingFee", "freeShippingAbove", "minOrder"].includes(k)) clean[k] = Number(clean[k]) || 0;
    });
    const { error } = await sb
      .from("settings")
      .upsert({ id: "default", data: clean, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) { console.error("saveSettings", error); throw error; }
    _cache.settings = { ...DEFAULT_SETTINGS, ...clean };
  },

  /* ---------- Content ---------- */
  async getContent() {
    const { data, error } = await sb
      .from("content").select("data").eq("id", "default").limit(1);
    if (error) { console.error("getContent", error); return _cache.content; }
    const raw = (data && data[0] && data[0].data) || {};
    const val = {
      en: { ...(raw.en || {}) },
      fr: { ...(raw.fr || {}) },
      ar: { ...(raw.ar || {}) }
    };
    _cache.content = val;
    return val;
  },

  async saveContent(c) {
    const { error } = await sb
      .from("content")
      .upsert({ id: "default", data: c, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) { console.error("saveContent", error); throw error; }
    _cache.content = c;
  },

  async resetContent() {
    const { error } = await sb
      .from("content")
      .upsert({ id: "default", data: {}, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) { console.error("resetContent", error); throw error; }
    _cache.content = { en: {}, fr: {}, ar: {} };
  },

  /* ---------- Theme ---------- */
  async getTheme() {
    const { data, error } = await sb
      .from("theme").select("data").eq("id", "default").limit(1);
    if (error) { console.error("getTheme", error); return _cache.theme; }
    const raw = (data && data[0] && data[0].data) || {};
    const val = {
      ...DEFAULT_THEME,
      ...raw,
      colors: { ...DEFAULT_THEME.colors, ...(raw.colors || {}) }
    };
    _cache.theme = val;
    return val;
  },

  async saveTheme(t) {
    const { error } = await sb
      .from("theme")
      .upsert({ id: "default", data: t, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) { console.error("saveTheme", error); throw error; }
    _cache.theme = {
      ...DEFAULT_THEME,
      ...t,
      colors: { ...DEFAULT_THEME.colors, ...(t.colors || {}) }
    };
  },

  async resetTheme() {
    const { error } = await sb
      .from("theme")
      .upsert({ id: "default", data: {}, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) { console.error("resetTheme", error); throw error; }
    _cache.theme = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors } };
  },

  /* ---------- Cart (stays in localStorage) ---------- */
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

  /* ---------- Image upload / delete ---------- */
  /* Path convention: "<uid>.<ext>" in the root of the bucket.
   * Public URL format:
   *   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
   */
  async uploadImage(bucketKey, file, _prefix) {
    const bucket = BUCKETS[bucketKey] || bucketKey;
    const ext = (file.name && file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1]) || "jpg";
    const path = `${uid("img")}.${ext.toLowerCase()}`;
    // Resize to a Blob first (keep transparency for PNG logos/favicons/hero).
    const blob = await fileToResizedBlob(file, _prefix === "thumb" ? 400 : 1400, 0.85);
    const { error } = await sb.storage.from(bucket).upload(path, blob, {
      contentType: blob.type,
      upsert: false
    });
    if (error) { console.error("uploadImage", error); throw error; }
    if (bucket === BUCKETS.proofs) {
      // Private bucket — return storage path (admin will sign to display)
      return path;
    }
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },

  /* Parse the storage path out of a public URL (or return as-is if already a path).
   * Format: <SUPABASE_URL>/storage/v1/object/public/<bucket>/<path>
   */
  parseStoragePath(bucketKey, urlOrPath) {
    if (!urlOrPath) return null;
    const bucket = BUCKETS[bucketKey] || bucketKey;
    const marker = `/storage/v1/object/public/${bucket}/`;
    const i = urlOrPath.indexOf(marker);
    if (i >= 0) return urlOrPath.slice(i + marker.length);
    // Might already be a raw path
    return urlOrPath;
  },

  async deleteImage(bucketKey, urlOrPath) {
    if (!urlOrPath) return;
    const bucket = BUCKETS[bucketKey] || bucketKey;
    const path = Storage.parseStoragePath(bucketKey, urlOrPath);
    if (!path) return;
    const { error } = await sb.storage.from(bucket).remove([path]);
    if (error) console.warn("deleteImage", error);
  },

  async getSignedProofUrl(path, seconds = 3600) {
    if (!path) return "";
    // Handle old orders that stored a public URL by accident
    if (/^https?:\/\//.test(path)) return path;
    const { data, error } = await sb.storage.from(BUCKETS.proofs).createSignedUrl(path, seconds);
    if (error) { console.error("getSignedProofUrl", error); return ""; }
    return data?.signedUrl || "";
  },

  /* ---------- Realtime ---------- */
  subscribeTable(table, onChange) {
    const channel = sb
      .channel(`rt-${table}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes",
          { event: "*", schema: "public", table },
          (payload) => { try { onChange(payload); } catch (e) { console.error(e); } })
      .subscribe();
    return channel;
  },

  /* ---------- Session ---------- */
  async getSession() {
    const { data } = await sb.auth.getSession();
    return data.session || null;
  }
};

/* ---------- Translation lookup with content overrides (sync) ---------- */
function tText(lang, key) {
  const overrides = Storage.getCachedContent();
  const override = overrides && overrides[lang] && overrides[lang][key];
  if (override && override.trim && override.trim() !== "") return override;
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  return dict[key] != null ? dict[key] : key;
}

/* ---------- Apply theme (async — fetches fresh theme then applies) ---------- */
async function applyTheme() {
  const theme = await Storage.getTheme();
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
    if (v && v.trim && v.trim() !== "") root.style.setProperty(cssVar, v);
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
function formatPrice(amount, settings) {
  const s = settings || Storage.getCachedSettings();
  const n = Number(amount) || 0;
  const formatted = n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  return `${formatted} ${s.currency || "MRU"}`;
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------- Order reference ID: LR-YYMMDD-XXXX ---------- */
function makeOrderId() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `LR-${yy}${mm}${dd}-${suffix}`;
}

/* ---------- Image resize helpers ---------- */
function _resizeCanvas(img, maxSize) {
  const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function fileToResizedDataUrl(file, maxSize = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = _resizeCanvas(img, maxSize);
        const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
        resolve(canvas.toDataURL(mime, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function fileToResizedBlob(file, maxSize = 1400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = _resizeCanvas(img, maxSize);
        const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("toBlob failed"));
          resolve(blob);
        }, mime, quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- Convert a data URL (legacy localStorage images) to a Blob ---------- */
function dataUrlToBlob(dataUrl) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1];
  const bin = atob(m[2]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
