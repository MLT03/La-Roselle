/* ---------- La Roselle — Admin logic (Supabase) ---------- */

(function () {
  const state = {
    authed: false,
    editorMode: "new",                // "new" | "edit"
    editorImages: [],                 // array of public URLs (or data URLs during upload race)
    editorOriginalImages: [],         // snapshot at openEditor() to detect removals
    editorProductId: null,
    activeTab: "dashboard",
    orderFilter: "all",
    contentLang: "en",
    channels: [],                     // realtime channels (for cleanup)
    notifPermission: null,            // "granted" | "denied" | "default"
    hasNewOrderPulse: false,
    seenOrderIds: new Set()           // orders we've already seen — avoid double notifying
  };

  const STATUSES = ["awaiting_verification", "pending", "accepted", "shipped", "completed", "cancelled"];

  /* ============ Login / auth ============ */
  async function tryLogin(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: error.message || "Sign-in failed" };
    return { ok: !!data.session, message: "" };
  }

  async function showApp() {
    if (state.authed) return;
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("admin-app").style.display = "flex";
    state.authed = true;
    await Storage.init();
    // Seed seenOrderIds so existing orders don't trigger notification sounds
    const orders = await Storage.getOrders();
    orders.forEach((o) => state.seenOrderIds.add(o.id));
    // Subscribe to realtime
    subscribeAll();
    // Ask for notification permission (non-blocking)
    requestNotificationPermission();
    // Default to dashboard
    switchTab("dashboard");
    await refreshAll();
  }

  function showLogin() {
    unsubscribeAll();
    document.getElementById("admin-app").style.display = "none";
    document.getElementById("login-screen").style.display = "flex";
    state.authed = false;
    state.seenOrderIds = new Set();
  }

  /* ============ Tabs ============ */
  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === tab));
    if (tab === "orders") {
      state.hasNewOrderPulse = false;
      const pulse = document.getElementById("new-order-pulse");
      if (pulse) pulse.classList.remove("show");
    }
    if (tab === "dashboard") renderDashboard();
  }

  /* ============ Realtime ============ */
  function subscribeAll() {
    unsubscribeAll();
    state.channels.push(Storage.subscribeTable("products", async () => {
      await Storage.getProducts();
      if (state.authed) {
        renderProducts();
        if (state.activeTab === "dashboard") renderDashboard();
      }
    }));
    state.channels.push(Storage.subscribeTable("orders", async (payload) => {
      if (!state.authed) return;
      // Detect new INSERT for notifications
      if (payload && payload.eventType === "INSERT") {
        const newId = payload.new && payload.new.id;
        if (newId && !state.seenOrderIds.has(newId)) {
          state.seenOrderIds.add(newId);
          onNewOrder(payload.new);
        }
      }
      renderOrders();
      renderOrdersBadge();
      if (state.activeTab === "dashboard") renderDashboard();
    }));
    state.channels.push(Storage.subscribeTable("settings", async () => {
      await Storage.getSettings();
      if (state.authed) { loadSettingsForm(); loadAppearance(); }
    }));
    state.channels.push(Storage.subscribeTable("content", async () => {
      await Storage.getContent();
      if (state.authed) renderContentEditor();
    }));
    state.channels.push(Storage.subscribeTable("theme", async () => {
      await Storage.getTheme();
      if (state.authed) loadAppearance();
      applyTheme();
    }));
  }
  function unsubscribeAll() {
    state.channels.forEach((ch) => { try { ch.unsubscribe(); } catch (e) {} });
    state.channels = [];
  }

  /* ============ Notifications (new order) ============ */
  function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().then((p) => { state.notifPermission = p; });
    } else {
      state.notifPermission = Notification.permission;
    }
  }
  function playBeep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.5);
    } catch (e) { /* audio not available */ }
  }
  function onNewOrder(row) {
    const o = { ...(row.data || {}), id: row.id, status: row.status };
    const total = formatPriceWithCurrency(o.total || 0, o.currency);
    const name = (o.customer && o.customer.name) || "—";
    playBeep();
    toast(`New order: ${name} — ${total}`);
    if (state.activeTab !== "orders") {
      state.hasNewOrderPulse = true;
      const pulse = document.getElementById("new-order-pulse");
      if (pulse) pulse.classList.add("show");
    }
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(`New order ${o.id}`, {
          body: `${name} — ${total}`,
          icon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='32' cy='32' r='30' fill='%23fdeae3'/><path d='M32 14 C 22 22, 22 34, 32 40 C 42 34, 42 22, 32 14z' fill='%23c96a56'/></svg>"
        });
      } catch (e) { /* some browsers throw outside user gesture */ }
    }
  }

  /* ============ Dashboard ============ */
  async function renderDashboard() {
    const wrap = document.getElementById("dashboard-panel");
    if (!wrap) return;
    const [orders, products] = await Promise.all([
      Storage.getOrders(),
      Storage.getProducts()
    ]);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 86400 * 1000; // last 7 days rolling
    const thirtyStart = todayStart - 29 * 86400 * 1000;

    const nonCancelled = orders.filter((o) => o.status !== "cancelled");

    const ordersToday = nonCancelled.filter((o) => new Date(o.createdAt).getTime() >= todayStart);
    const ordersWeek  = nonCancelled.filter((o) => new Date(o.createdAt).getTime() >= weekStart);
    const revenueToday = ordersToday.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const revenueWeek  = ordersWeek.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const revenueTotal = nonCancelled.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const pendingOrders = orders.filter((o) => o.status === "awaiting_verification" || o.status === "pending").length;

    // Daily counts/revenue for last 14 days
    const days = 14;
    const dayCounts = new Array(days).fill(0);
    const dayRevenue = new Array(days).fill(0);
    nonCancelled.forEach((o) => {
      const t = new Date(o.createdAt).getTime();
      const idx = Math.floor((t - (todayStart - (days - 1) * 86400000)) / 86400000);
      if (idx >= 0 && idx < days) {
        dayCounts[idx] += 1;
        dayRevenue[idx] += Number(o.total) || 0;
      }
    });

    // Top 5 products (last 30 days)
    const byProduct = {};
    nonCancelled
      .filter((o) => new Date(o.createdAt).getTime() >= thirtyStart)
      .forEach((o) => {
        (o.items || []).forEach((i) => {
          if (!byProduct[i.id]) byProduct[i.id] = { id: i.id, name: i.name, qty: 0, rev: 0 };
          byProduct[i.id].qty += Number(i.qty) || 0;
          byProduct[i.id].rev += Number(i.lineTotal) || 0;
        });
      });
    const top5 = Object.values(byProduct).sort((a, b) => b.qty - a.qty).slice(0, 5);

    // Low stock: stock <= 3
    const lowStock = products
      .filter((p) => Number(p.stock) <= 3)
      .sort((a, b) => (a.stock || 0) - (b.stock || 0));

    const currency = Storage.getCachedSettings().currency || "MRU";

    wrap.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>Dashboard</h2>
          <p class="panel-sub">At-a-glance view of orders, revenue, and stock.</p>
        </div>
      </div>

      <div class="stats-grid">
        ${statCard("Orders today", ordersToday.length, sparkline(dayCounts))}
        ${statCard("Revenue today", formatPriceWithCurrency(revenueToday, currency), sparkline(dayRevenue))}
        ${statCard("Orders (7d)", ordersWeek.length, sparkline(dayCounts))}
        ${statCard("Revenue (7d)", formatPriceWithCurrency(revenueWeek, currency), sparkline(dayRevenue))}
        ${statCard("Pending orders", pendingOrders, "")}
        ${statCard("Lifetime revenue", formatPriceWithCurrency(revenueTotal, currency), "")}
      </div>

      <div class="dash-tables">
        <div class="card">
          <h3>Top 5 products (last 30 days)</h3>
          ${top5.length === 0
            ? `<p class="panel-sub">No sales yet.</p>`
            : `<table class="dash-table">
                <thead><tr><th>#</th><th>Product</th><th>Units</th><th>Revenue</th></tr></thead>
                <tbody>
                  ${top5.map((p, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td>${escapeHtml(p.name || p.id)}</td>
                      <td>${p.qty}</td>
                      <td>${escapeHtml(formatPriceWithCurrency(p.rev, currency))}</td>
                    </tr>`).join("")}
                </tbody>
              </table>`}
        </div>

        <div class="card">
          <h3>Low stock</h3>
          ${lowStock.length === 0
            ? `<p class="panel-sub">All products have stock &gt; 3. 🌸</p>`
            : `<table class="dash-table">
                <thead><tr><th>Product</th><th>Stock</th><th></th></tr></thead>
                <tbody>
                  ${lowStock.map((p) => `
                    <tr>
                      <td>${escapeHtml(p.name.en || p.id)}</td>
                      <td><span class="stock-badge ${stockLevel(p.stock)}">${p.stock}</span></td>
                      <td><button class="btn-ghost" data-edit-product="${escapeAttr(p.id)}" style="padding:.35rem .7rem;font-size:.72rem;">Edit</button></td>
                    </tr>`).join("")}
                </tbody>
              </table>`}
        </div>
      </div>
    `;

    wrap.querySelectorAll("[data-edit-product]").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchTab("products");
        openEditor(btn.getAttribute("data-edit-product"));
      });
    });
  }

  function statCard(label, value, sparkSvg) {
    return `<div class="stat-card">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(String(value))}</div>
      ${sparkSvg ? `<div class="stat-spark">${sparkSvg}</div>` : ""}
    </div>`;
  }
  function sparkline(values) {
    if (!values || values.length === 0) return "";
    const w = 120, h = 28, pad = 2;
    const max = Math.max(1, ...values);
    const step = (w - pad * 2) / Math.max(1, values.length - 1);
    const pts = values.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none">
      <polyline fill="none" stroke="var(--blush-500)" stroke-width="1.4" points="${pts}" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  function stockLevel(n) {
    n = Number(n) || 0;
    if (n === 0) return "out";
    if (n <= 3) return "low";
    return "ok";
  }

  /* ============ Products ============ */
  async function renderProducts() {
    const grid = document.getElementById("products-list");
    if (!grid) return;
    const list = await Storage.getProducts();
    const isTouch = "ontouchstart" in window;
    if (list.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <h3>No products yet</h3>
          <p>Click "New product" to add your first item.</p>
        </div>`;
      return;
    }
    grid.innerHTML = list.map((p) => {
      const name = p.name.en || Object.values(p.name).find(Boolean) || "";
      const cat  = p.category.en || Object.values(p.category).find(Boolean) || "";
      const img = p.image
        ? `<img src="${escapeAttr(p.image)}" alt="${escapeAttr(name)}">`
        : "";
      const stock = Number(p.stock) || 0;
      return `
        <div class="admin-product-card" data-id="${escapeAttr(p.id)}" draggable="${!isTouch}">
          <div class="admin-product-img ${p.image ? "" : "placeholder"}">${img}
            ${p.images && p.images.length > 1 ? `<span class="photo-count">${p.images.length}</span>` : ""}
          </div>
          <div class="admin-product-body">
            <div class="admin-product-cat">${escapeHtml(cat)}</div>
            <div class="admin-product-name">${escapeHtml(name)}</div>
            <div class="admin-product-price">${escapeHtml(formatPrice(p.price))}</div>
            <div class="stock-row">
              <span class="stock-badge ${stockLevel(stock)}">Stock: ${stock}</span>
              <div class="stock-adjust">
                <button type="button" data-stock-adjust="-1" aria-label="Decrease stock">−</button>
                <button type="button" data-stock-adjust="1" aria-label="Increase stock">+</button>
              </div>
            </div>
            <div class="admin-product-actions">
              <button class="edit" type="button">Edit</button>
              <button class="delete" type="button">Delete</button>
              ${isTouch ? `
                <button class="move-up" type="button" aria-label="Move up">↑</button>
                <button class="move-down" type="button" aria-label="Move down">↓</button>` : ""}
            </div>
          </div>
        </div>`;
    }).join("");

    grid.querySelectorAll(".admin-product-card").forEach((card) => {
      const id = card.getAttribute("data-id");
      card.querySelector(".edit").addEventListener("click", () => openEditor(id));
      card.querySelector(".delete").addEventListener("click", async () => {
        if (!confirm("Delete this product?")) return;
        try {
          // Delete the product's stored images first
          const p = (await Storage.getProducts()).find((x) => x.id === id);
          if (p) {
            await Promise.all((p.images || []).map((u) => Storage.deleteImage("products", u)));
          }
          await Storage.deleteProduct(id);
          toast("Product deleted");
        } catch (e) { alert("Failed to delete: " + (e.message || e)); }
      });
      card.querySelectorAll("[data-stock-adjust]").forEach((b) => {
        b.addEventListener("click", async (e) => {
          e.stopPropagation();
          const delta = Number(b.getAttribute("data-stock-adjust")) || 0;
          const p = (await Storage.getProducts()).find((x) => x.id === id);
          if (!p) return;
          const next = Math.max(0, Number(p.stock || 0) + delta);
          await Storage.saveProduct({ ...p, stock: next });
          toast(`Stock: ${next}`);
        });
      });
      if (isTouch) {
        card.querySelector(".move-up")?.addEventListener("click", () => moveCard(id, -1));
        card.querySelector(".move-down")?.addEventListener("click", () => moveCard(id, 1));
      }
    });

    if (!isTouch) wireDragReorder(grid);
  }

  async function moveCard(id, delta) {
    const list = await Storage.getProducts();
    const idx = list.findIndex((p) => p.id === id);
    const next = idx + delta;
    if (idx < 0 || next < 0 || next >= list.length) return;
    const reordered = list.slice();
    const [item] = reordered.splice(idx, 1);
    reordered.splice(next, 0, item);
    await Storage.reorderProducts(reordered.map((p) => p.id));
  }

  function wireDragReorder(grid) {
    let dragged = null;
    grid.querySelectorAll(".admin-product-card").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        dragged = card;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", card.getAttribute("data-id")); } catch {}
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        grid.querySelectorAll(".admin-product-card.drag-over").forEach((c) => c.classList.remove("drag-over"));
        dragged = null;
      });
      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!dragged || card === dragged) return;
        card.classList.add("drag-over");
      });
      card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
      card.addEventListener("drop", async (e) => {
        e.preventDefault();
        card.classList.remove("drag-over");
        if (!dragged || card === dragged) return;
        // Insert dragged before card (or after if dragged was earlier)
        const parent = grid;
        const cards = Array.from(parent.children);
        const fromIdx = cards.indexOf(dragged);
        const toIdx = cards.indexOf(card);
        if (fromIdx < toIdx) parent.insertBefore(dragged, card.nextSibling);
        else parent.insertBefore(dragged, card);
        const ids = Array.from(parent.children).map((c) => c.getAttribute("data-id"));
        await Storage.reorderProducts(ids);
      });
    });
  }

  /* ---------- Product editor (with multi-image gallery) ---------- */
  async function openEditor(productId) {
    const form = document.getElementById("product-form");
    form.reset();
    state.editorImages = [];
    state.editorOriginalImages = [];

    if (productId) {
      state.editorMode = "edit";
      state.editorProductId = productId;
      const p = (await Storage.getProducts()).find((x) => x.id === productId);
      if (!p) return;
      document.getElementById("editor-title").textContent = "Edit product";
      form.querySelector('[name="id"]').value = p.id;
      form.querySelector('[name="id"]').readOnly = true;
      form.querySelector('[name="price"]').value = p.price;
      form.querySelector('[name="stock"]').value = p.stock;
      form.querySelector('[name="name_en"]').value = p.name.en || "";
      form.querySelector('[name="name_fr"]').value = p.name.fr || "";
      form.querySelector('[name="name_ar"]').value = p.name.ar || "";
      form.querySelector('[name="category_en"]').value = p.category.en || "";
      form.querySelector('[name="category_fr"]').value = p.category.fr || "";
      form.querySelector('[name="category_ar"]').value = p.category.ar || "";
      form.querySelector('[name="description_en"]').value = p.description.en || "";
      form.querySelector('[name="description_fr"]').value = p.description.fr || "";
      form.querySelector('[name="description_ar"]').value = p.description.ar || "";
      state.editorImages = (p.images || []).slice();
      state.editorOriginalImages = (p.images || []).slice();
    } else {
      state.editorMode = "new";
      state.editorProductId = null;
      document.getElementById("editor-title").textContent = "New product";
      form.querySelector('[name="id"]').readOnly = false;
      form.querySelector('[name="stock"]').value = 0;
    }

    renderEditorGallery();
    switchEditorLang("en");

    const m = document.getElementById("product-editor");
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeEditor() {
    const m = document.getElementById("product-editor");
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function renderEditorGallery() {
    const wrap = document.getElementById("editor-gallery");
    if (!wrap) return;
    const MAX = 8;
    const thumbs = state.editorImages.map((url, i) => `
      <div class="gallery-thumb" draggable="true" data-idx="${i}">
        <img src="${escapeAttr(url)}" alt="Image ${i + 1}" />
        <button type="button" class="gallery-remove" data-remove="${i}" aria-label="Remove image">×</button>
      </div>
    `).join("");
    const canAdd = state.editorImages.length < MAX;
    wrap.innerHTML = thumbs + (canAdd ? `
      <label class="gallery-add" title="Add image">
        <input type="file" accept="image/*" id="editor-add-image" multiple hidden />
        <span>＋</span>
        <small>Add image (${state.editorImages.length}/${MAX})</small>
      </label>` : "");

    wrap.querySelectorAll("[data-remove]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.preventDefault();
        const idx = Number(b.getAttribute("data-remove"));
        state.editorImages.splice(idx, 1);
        renderEditorGallery();
      });
    });
    const input = document.getElementById("editor-add-image");
    if (input) input.addEventListener("change", handleAddImages);

    // Drag-to-reorder thumbnails
    let dragIdx = null;
    wrap.querySelectorAll(".gallery-thumb").forEach((thumb) => {
      thumb.addEventListener("dragstart", (e) => {
        dragIdx = Number(thumb.getAttribute("data-idx"));
        thumb.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      thumb.addEventListener("dragend", () => {
        thumb.classList.remove("dragging");
        wrap.querySelectorAll(".gallery-thumb.drag-over").forEach((t) => t.classList.remove("drag-over"));
        dragIdx = null;
      });
      thumb.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (dragIdx === null) return;
        thumb.classList.add("drag-over");
      });
      thumb.addEventListener("dragleave", () => thumb.classList.remove("drag-over"));
      thumb.addEventListener("drop", (e) => {
        e.preventDefault();
        thumb.classList.remove("drag-over");
        const toIdx = Number(thumb.getAttribute("data-idx"));
        if (dragIdx === null || dragIdx === toIdx) return;
        const arr = state.editorImages.slice();
        const [item] = arr.splice(dragIdx, 1);
        arr.splice(toIdx, 0, item);
        state.editorImages = arr;
        renderEditorGallery();
      });
    });
  }

  async function handleAddImages(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const MAX = 8;
    const slots = MAX - state.editorImages.length;
    const toUpload = files.slice(0, slots);
    for (const f of toUpload) {
      try {
        const url = await Storage.uploadImage("products", f);
        state.editorImages.push(url);
        renderEditorGallery();
      } catch (err) {
        console.error(err);
        alert("Failed to upload image: " + (err.message || err));
      }
    }
  }

  function switchEditorLang(lang) {
    document.querySelectorAll("#product-editor .lang-tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.lang === lang));
    document.querySelectorAll("#product-editor .lang-fields").forEach((f) => {
      f.style.display = f.dataset.lang === lang ? "block" : "none";
    });
  }

  async function saveProduct(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const id = (fd.get("id") || "").toString().trim();
    const price = Number(fd.get("price") || 0);
    const stock = Math.max(0, Math.floor(Number(fd.get("stock") || 0)));
    if (!id) return;

    const list = await Storage.getProducts();
    if (state.editorMode === "new" && list.some((x) => x.id === id)) {
      alert(`A product with id "${id}" already exists.`);
      return;
    }

    const p = {
      id,
      images: state.editorImages.slice(),
      image: state.editorImages[0] || "",
      price,
      stock,
      category: {
        en: (fd.get("category_en") || "").toString().trim(),
        fr: (fd.get("category_fr") || fd.get("category_en") || "").toString().trim(),
        ar: (fd.get("category_ar") || fd.get("category_en") || "").toString().trim()
      },
      name: {
        en: (fd.get("name_en") || "").toString().trim(),
        fr: (fd.get("name_fr") || fd.get("name_en") || "").toString().trim(),
        ar: (fd.get("name_ar") || fd.get("name_en") || "").toString().trim()
      },
      description: {
        en: (fd.get("description_en") || "").toString().trim(),
        fr: (fd.get("description_fr") || fd.get("description_en") || "").toString().trim(),
        ar: (fd.get("description_ar") || fd.get("description_en") || "").toString().trim()
      }
    };

    // Preserve existing sort_order if editing
    if (state.editorMode === "edit") {
      const existing = list.find((x) => x.id === id);
      if (existing) p.sort_order = existing.sort_order;
    }

    try {
      await Storage.saveProduct(p);
      // Delete images that were removed (in editorOriginalImages but not in new set)
      const removed = state.editorOriginalImages.filter((u) => !state.editorImages.includes(u));
      await Promise.all(removed.map((u) => Storage.deleteImage("products", u)));
      closeEditor();
      toast(state.editorMode === "edit" ? "Product updated" : "Product added");
    } catch (e) {
      alert("Failed to save product: " + (e.message || e));
    }
  }

  /* ============ Export / Import / Reset ============ */
  async function exportProducts() {
    const list = await Storage.getProducts();
    const data = JSON.stringify(list, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `la-roselle-products-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("Products exported");
  }

  function importProducts(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error("Not an array");
        if (!confirm(`Import ${parsed.length} products? This will replace your current list.`)) return;
        await Storage.saveProducts(parsed);
        toast("Products imported");
      } catch (err) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  }

  async function resetProducts() {
    if (!confirm("Reset products to the built-in defaults? Your current list will be lost.")) return;
    try {
      await Storage.resetProducts();
      // Seed defaults (without images)
      if (typeof DEFAULT_PRODUCTS !== "undefined" && DEFAULT_PRODUCTS.length) {
        await Storage.saveProducts(DEFAULT_PRODUCTS.map((p, i) => ({
          ...p,
          images: Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []),
          stock: p.stock != null ? Number(p.stock) : 10,
          sort_order: i + 1
        })));
      }
      toast("Products reset");
    } catch (e) { alert("Failed to reset: " + (e.message || e)); }
  }

  /* ============ Orders ============ */
  async function renderOrdersBadge() {
    const list = await Storage.getOrders();
    const pending = list.filter((o) => o.status === "awaiting_verification" || o.status === "pending").length;
    const el = document.getElementById("orders-badge");
    if (el) {
      el.textContent = pending;
      el.classList.toggle("hidden", pending === 0);
    }
  }

  async function renderOrders() {
    const wrap = document.getElementById("orders-list");
    if (!wrap) return;
    const list = await Storage.getOrders();
    const filter = state.orderFilter;
    const filtered = filter === "all" ? list : list.filter((o) => o.status === filter);
    if (filtered.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <h3>No orders yet</h3>
          <p>Orders placed by customers appear here.</p>
        </div>`;
      return;
    }

    wrap.innerHTML = filtered.map((o) => {
      const when = new Date(o.createdAt).toLocaleString();
      const statusLabel = (o.status || "").replace(/_/g, " ");
      const count = (o.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
      return `
        <div class="order-row" data-id="${escapeAttr(o.id)}">
          <div class="order-id">${escapeHtml(o.id)}</div>
          <div class="order-info">
            <strong>${escapeHtml((o.customer && o.customer.name) || "—")}</strong> · ${escapeHtml((o.customer && o.customer.phone) || "—")}
            <br/>
            ${count} items · ${escapeHtml(when)} · ${o.payment && o.payment.method === "bankily" ? "Bankily" : "Cash on delivery"}
          </div>
          <div class="order-total">${escapeHtml(formatPriceWithCurrency(o.total, o.currency))}</div>
          <span class="status-chip ${escapeAttr(o.status || "")}">${escapeHtml(statusLabel)}</span>
        </div>`;
    }).join("");

    wrap.querySelectorAll(".order-row").forEach((row) => {
      row.addEventListener("click", () => openOrderDetail(row.getAttribute("data-id")));
    });
  }

  async function openOrderDetail(orderId) {
    const list = await Storage.getOrders();
    const o = list.find((x) => x.id === orderId);
    if (!o) return;
    const when = new Date(o.createdAt).toLocaleString();
    const itemsHtml = (o.items || []).map((i) =>
      `<li><span>${escapeHtml(i.name)} × ${i.qty}</span><span>${escapeHtml(formatPriceWithCurrency(i.lineTotal, o.currency))}</span></li>`
    ).join("");

    const statusOptions = STATUSES.map((s) =>
      `<option value="${s}" ${s === o.status ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`
    ).join("");

    // Proof: prefer signed URL if we have proofPath, fall back to legacy proofDataUrl
    let proofUrl = "";
    if (o.payment && o.payment.proofPath) {
      proofUrl = await Storage.getSignedProofUrl(o.payment.proofPath);
    } else if (o.payment && o.payment.proofDataUrl) {
      proofUrl = o.payment.proofDataUrl;
    }

    const proofHtml = (o.payment && o.payment.method === "bankily" && proofUrl)
      ? `<div class="proof-wrap">
           <img src="${escapeAttr(proofUrl)}" alt="Proof of payment">
           <div class="proof-actions">
             <a href="${escapeAttr(proofUrl)}" download="${escapeAttr(o.id)}-proof.jpg" class="btn-ghost" style="padding:.5rem 1rem;font-size:.78rem;">⬇ Download</a>
             <a href="${escapeAttr(proofUrl)}" target="_blank" rel="noopener" class="btn-ghost" style="padding:.5rem 1rem;font-size:.78rem;">Open in new tab</a>
           </div>
         </div>`
      : (o.payment && o.payment.method === "bankily"
          ? `<p style="color:#a86400;">No proof uploaded.</p>`
          : `<p style="color:var(--ink-soft);">Cash on delivery — no proof expected.</p>`);

    const detail = document.getElementById("order-detail");
    detail.innerHTML = `
      <h3>Order ${escapeHtml(o.id)}</h3>
      <div class="meta">${escapeHtml(when)} · Language: ${escapeHtml(o.lang || "")}</div>

      <div class="section">
        <h4>Status</h4>
        <div class="section-body status-control">
          <span class="status-chip ${escapeAttr(o.status || "")}">${escapeHtml((o.status || "").replace(/_/g, " "))}</span>
          <select id="status-select">${statusOptions}</select>
          <button class="btn" id="save-status-btn" style="padding:.6rem 1.4rem;font-size:.78rem;">Update</button>
        </div>
      </div>

      <div class="section">
        <h4>Customer</h4>
        <div class="section-body">
          <div><strong>${escapeHtml(o.customer.name)}</strong></div>
          <div>📞 ${escapeHtml(o.customer.phone)}</div>
          <div>📍 ${escapeHtml(o.customer.address)}</div>
          ${o.customer.notes ? `<div style="margin-top:.4rem; color:var(--ink-soft);">📝 ${escapeHtml(o.customer.notes)}</div>` : ""}
        </div>
      </div>

      <div class="section">
        <h4>Items</h4>
        <div class="section-body">
          <ul class="items">${itemsHtml}</ul>
          <div class="total-row"><span>Total</span><span>${escapeHtml(formatPriceWithCurrency(o.total, o.currency))}</span></div>
        </div>
      </div>

      <div class="section">
        <h4>Payment — ${o.payment && o.payment.method === "bankily" ? "Bankily" : "Cash on delivery"}</h4>
        <div class="section-body">${proofHtml}</div>
      </div>

      <div class="danger-zone">
        <button class="btn-ghost danger" id="delete-order-btn">Delete order</button>
      </div>
    `;

    document.getElementById("save-status-btn").addEventListener("click", async () => {
      const newStatus = document.getElementById("status-select").value;
      const oldStatus = o.status;
      if (newStatus === oldStatus) return;

      // Stock adjustments:
      //   Current rule: orders decrement stock on creation, and stock is restocked
      //   ONLY when the order moves to "cancelled". Moving from cancelled back to
      //   any other status re-decrements.
      try {
        if (newStatus === "cancelled" && oldStatus !== "cancelled") {
          if (confirm("Cancelling this order will add its items back to stock. Continue?")) {
            const items = (o.items || []).map((i) => ({ id: i.id, qty: Number(i.qty) || 0 }));
            try { await Storage.restockItems(items); } catch (e) { console.error(e); }
          } else {
            return;
          }
        } else if (oldStatus === "cancelled" && newStatus !== "cancelled") {
          // Re-decrement — may fail if stock ran out meanwhile
          try {
            const items = (o.items || []).map((i) => ({ id: i.id, qty: Number(i.qty) || 0 }));
            await Storage.decrementStock(items);
          } catch (e) {
            alert("Couldn't re-activate this order: " + (e.productId ? `stock for ${e.productId} is insufficient.` : e.message));
            return;
          }
        }
        await Storage.updateOrder(o.id, { status: newStatus });
        await renderOrders();
        await renderOrdersBadge();
        openOrderDetail(o.id);
        toast("Status updated");
      } catch (e) { alert("Failed to update order: " + (e.message || e)); }
    });

    document.getElementById("delete-order-btn").addEventListener("click", async () => {
      if (!confirm("Delete this order permanently?")) return;
      try {
        // Also delete the proof image if private
        if (o.payment && o.payment.proofPath) {
          await Storage.deleteImage("proofs", o.payment.proofPath);
        }
        await Storage.deleteOrder(o.id);
        closeOrder();
        await renderOrders();
        await renderOrdersBadge();
        toast("Order deleted");
      } catch (e) { alert("Failed to delete: " + (e.message || e)); }
    });

    const m = document.getElementById("order-modal");
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeOrder() {
    const m = document.getElementById("order-modal");
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function formatPriceWithCurrency(amount, currency) {
    const n = Number(amount) || 0;
    const formatted = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return `${formatted} ${currency || "MRU"}`;
  }

  /* ============ Settings ============ */
  async function loadSettingsForm() {
    const s = await Storage.getSettings();
    const f = document.getElementById("settings-form");
    if (!f) return;
    Object.entries(s).forEach(([k, v]) => {
      const input = f.querySelector(`[name="${k}"]`);
      if (input) input.value = v;
    });
  }

  async function saveSettingsForm(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const current = await Storage.getSettings();
    const next = { ...current };
    fd.forEach((v, k) => { next[k] = v.toString(); });
    try {
      await Storage.saveSettings(next);
      toast("Settings saved");
    } catch (e) { alert("Failed to save settings: " + (e.message || e)); }
  }

  /* ============ Toast ============ */
  let toastTimer;
  function toast(text) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  /* ============ Utils ============ */
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ============ Content editor ============ */
  async function renderContentEditor() {
    const wrap = document.getElementById("content-editor");
    if (!wrap) return;
    wrap.setAttribute("dir", state.contentLang === "ar" ? "rtl" : "ltr");
    const overrides = await Storage.getContent();
    const langDict = TRANSLATIONS[state.contentLang] || {};
    const langOverrides = overrides[state.contentLang] || {};

    const html = CONTENT_SCHEMA.map((group) => {
      const fields = group.keys.map(([key, kind]) => {
        const def = langDict[key] || "";
        const cur = langOverrides[key] != null ? langOverrides[key] : "";
        const id = `c_${key.replace(/\./g, "_")}`;
        const input = kind === "textarea"
          ? `<textarea id="${id}" data-key="${escapeAttr(key)}" rows="3" placeholder="${escapeAttr(def)}">${escapeHtml(cur)}</textarea>`
          : `<input type="text" id="${id}" data-key="${escapeAttr(key)}" placeholder="${escapeAttr(def)}" value="${escapeAttr(cur)}" />`;
        return `
          <div class="field">
            <label for="${id}">${escapeHtml(key)}</label>
            ${input}
            <span class="default-hint">Default: ${escapeHtml(def) || "<em>(empty)</em>"}</span>
          </div>`;
      }).join("");
      return `<div class="content-group"><h3>${escapeHtml(group.title)}</h3>${fields}</div>`;
    }).join("");

    wrap.innerHTML = html;
  }

  async function switchContentLang(lang) {
    await collectContentInto(state.contentLang);
    state.contentLang = lang;
    document.querySelectorAll("[data-clang]").forEach((b) => b.classList.toggle("active", b.dataset.clang === lang));
    renderContentEditor();
  }

  async function collectContentInto(lang) {
    const overrides = await Storage.getContent();
    overrides[lang] = overrides[lang] || {};
    document.querySelectorAll("#content-editor [data-key]").forEach((el) => {
      const key = el.getAttribute("data-key");
      const val = el.value.trim();
      if (val === "") delete overrides[lang][key];
      else overrides[lang][key] = val;
    });
    await Storage.saveContent(overrides);
  }

  async function saveContent() {
    try {
      await collectContentInto(state.contentLang);
      toast("Content saved");
    } catch (e) { alert("Failed to save content: " + (e.message || e)); }
  }

  async function resetContent() {
    if (!confirm("Reset all text overrides for all languages?")) return;
    try {
      await Storage.resetContent();
      await renderContentEditor();
      toast("Content reset");
    } catch (e) { alert("Failed to reset: " + (e.message || e)); }
  }

  /* ============ Appearance ============ */
  async function loadAppearance() {
    const theme = await Storage.getTheme();
    const s = await Storage.getSettings();

    const form = document.getElementById("colors-form");
    if (form) {
      Object.entries(theme.colors).forEach(([k, v]) => {
        const text = form.querySelector(`[name="${k}"]`);
        const pick = form.querySelector(`[data-color-pick="${k}"]`);
        if (text) text.value = v || "";
        if (pick) pick.value = v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#ffffff";
      });
    }

    setThemeImageUi("logo-preview", "logo-upload", "logo-upload-text", theme.logoDataUrl,
      "Logo uploaded — click to change", "Upload a square logo (PNG recommended)");
    setThemeImageUi("hero-preview", "hero-upload", "hero-upload-text", theme.heroImageDataUrl,
      "Hero image uploaded — click to change", "Upload a wide photo for the hero");
    setThemeImageUi("favicon-preview", "favicon-upload", "favicon-upload-text", theme.faviconDataUrl,
      "Favicon uploaded", "Small square icon (32×32 or 64×64)");

    const vf = document.getElementById("visibility-form");
    if (vf) {
      ["showAboutSection", "showContactSection", "showHeroFlowers", "langEnEnabled",
       "langFrEnabled", "langArEnabled", "paymentBankilyEnabled", "paymentCodEnabled"].forEach((k) => {
        const cb = vf.querySelector(`[name="${k}"]`);
        if (cb) cb.checked = (String(s[k]) === "true" || s[k] === true);
      });
    }
  }
  function setThemeImageUi(previewId, uploadId, uploadTextId, url, okText, defaultText) {
    const prev = document.getElementById(previewId);
    const up = document.getElementById(uploadId);
    const txt = document.getElementById(uploadTextId);
    if (!prev || !up || !txt) return;
    if (url) {
      prev.src = url;
      prev.classList.add("show");
      up.classList.add("has-file");
      txt.textContent = okText;
    } else {
      prev.removeAttribute("src");
      prev.classList.remove("show");
      up.classList.remove("has-file");
      txt.textContent = defaultText;
    }
  }

  async function saveColors(ev) {
    ev.preventDefault();
    const form = ev.target;
    const theme = await Storage.getTheme();
    ["blush400", "blush500", "roseDeep", "gold", "ink", "cream"].forEach((k) => {
      const v = (form.querySelector(`[name="${k}"]`).value || "").trim();
      theme.colors[k] = v;
    });
    try {
      await Storage.saveTheme(theme);
      applyTheme();
      toast("Colors saved");
    } catch (e) { alert("Failed: " + (e.message || e)); }
  }

  async function saveVisibility(ev) {
    ev.preventDefault();
    const form = ev.target;
    const s = await Storage.getSettings();
    ["showAboutSection", "showContactSection", "showHeroFlowers", "langEnEnabled",
     "langFrEnabled", "langArEnabled", "paymentBankilyEnabled", "paymentCodEnabled"].forEach((k) => {
      s[k] = !!form.querySelector(`[name="${k}"]`).checked;
    });
    try {
      await Storage.saveSettings(s);
      toast("Visibility settings saved");
    } catch (e) { alert("Failed: " + (e.message || e)); }
  }

  async function handleThemeImageUpload(inputSel, themeKey, successText) {
    const input = document.querySelector(inputSel);
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const theme = await Storage.getTheme();
      const oldUrl = theme[themeKey];
      const url = await Storage.uploadImage("theme", file);
      theme[themeKey] = url;
      await Storage.saveTheme(theme);
      // Delete the old image after successful save
      if (oldUrl) await Storage.deleteImage("theme", oldUrl);
      await loadAppearance();
      applyTheme();
      toast(successText);
    } catch (err) {
      console.error(err);
      alert("Upload failed: " + (err.message || err));
    }
  }

  async function removeThemeImage(themeKey, successText) {
    try {
      const theme = await Storage.getTheme();
      const oldUrl = theme[themeKey];
      theme[themeKey] = "";
      await Storage.saveTheme(theme);
      if (oldUrl) await Storage.deleteImage("theme", oldUrl);
      await loadAppearance();
      applyTheme();
      toast(successText);
    } catch (e) { alert("Failed: " + (e.message || e)); }
  }

  async function resetTheme() {
    if (!confirm("Reset all appearance settings (colors and images)?")) return;
    try {
      // Optionally clean up stored images
      const theme = await Storage.getTheme();
      await Promise.all([
        theme.logoDataUrl && Storage.deleteImage("theme", theme.logoDataUrl),
        theme.heroImageDataUrl && Storage.deleteImage("theme", theme.heroImageDataUrl),
        theme.faviconDataUrl && Storage.deleteImage("theme", theme.faviconDataUrl)
      ].filter(Boolean));
      await Storage.resetTheme();
      await loadAppearance();
      applyTheme();
      toast("Appearance reset");
    } catch (e) { alert("Failed: " + (e.message || e)); }
  }

  /* ============ One-time migration from localStorage ============ */
  async function migrateLocalProducts() {
    const raw = localStorage.getItem(STORAGE_KEYS.products);
    if (!raw) { alert("No local products found."); return; }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { alert("Local data is not valid JSON."); return; }
    if (!Array.isArray(parsed) || parsed.length === 0) { alert("No local products found."); return; }
    if (!confirm(`Import ${parsed.length} products from this browser's storage to Supabase?`)) return;

    const toUpload = [];
    for (const p of parsed) {
      const images = [];
      const srcImages = Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []);
      for (const src of srcImages) {
        if (!src) continue;
        if (src.startsWith("data:")) {
          const blob = dataUrlToBlob(src);
          if (!blob) continue;
          const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
          const path = `${uid("img")}.${ext}`;
          const { error } = await sb.storage.from("products").upload(path, blob, { contentType: blob.type });
          if (!error) {
            const { data } = sb.storage.from("products").getPublicUrl(path);
            images.push(data.publicUrl);
          }
        } else {
          images.push(src);
        }
      }
      toUpload.push({
        ...p,
        images,
        image: images[0] || "",
        stock: p.stock != null ? Number(p.stock) : 10
      });
    }
    await Storage.saveProducts(toUpload);
    localStorage.removeItem(STORAGE_KEYS.products);
    toast("Products migrated");
  }

  async function migrateLocalRest() {
    const parts = [];
    try {
      const s = localStorage.getItem(STORAGE_KEYS.settings);
      if (s) { await Storage.saveSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) }); parts.push("settings"); }
    } catch {}
    try {
      const c = localStorage.getItem(STORAGE_KEYS.content);
      if (c) { await Storage.saveContent(JSON.parse(c)); parts.push("content"); }
    } catch {}
    try {
      const t = localStorage.getItem(STORAGE_KEYS.theme);
      if (t) { await Storage.saveTheme(JSON.parse(t)); parts.push("theme"); }
    } catch {}
    try {
      const o = localStorage.getItem(STORAGE_KEYS.orders);
      if (o) {
        const list = JSON.parse(o);
        if (Array.isArray(list)) {
          for (const ord of list) {
            try { await Storage.addOrder(ord); } catch {}
          }
          parts.push("orders");
        }
      }
    } catch {}
    // Clear legacy keys
    [STORAGE_KEYS.settings, STORAGE_KEYS.content, STORAGE_KEYS.theme, STORAGE_KEYS.orders].forEach((k) => localStorage.removeItem(k));
    alert(parts.length ? `Migrated: ${parts.join(", ")}.` : "Nothing to migrate.");
  }

  /* ============ refreshAll ============ */
  async function refreshAll() {
    await Promise.all([
      renderProducts(),
      renderOrders(),
      renderOrdersBadge(),
      loadSettingsForm(),
      renderContentEditor(),
      loadAppearance(),
      renderDashboard()
    ]);
  }

  /* ============ Init ============ */
  document.addEventListener("DOMContentLoaded", async () => {
    console.log("[admin] DOMContentLoaded");
    // Auth state
    console.log("[admin] before getSession");
    const session = await Storage.getSession();
    console.log("[admin] after getSession", !!session);
    if (session) await showApp(); else showLogin();
    console.log("[admin] after first show");

    sb.auth.onAuthStateChange((_e, s) => {
      console.log("[admin] authChange", _e, !!s);
      if (s) { showApp().catch(console.error); }
      else { showLogin(); }
    });

    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = (document.getElementById("login-email").value || "").trim();
      const pw = document.getElementById("login-password").value;
      const err = document.getElementById("login-error");
      const result = await tryLogin(email, pw);
      if (result.ok) {
        err.classList.remove("show");
        await showApp();
      } else {
        err.textContent = result.message || "Sign-in failed.";
        err.classList.add("show");
      }
    });
    document.getElementById("logout-btn").addEventListener("click", () => {
      sb.auth.signOut().catch(console.error);
    });

    // Tabs
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.addEventListener("click", () => switchTab(b.dataset.tab));
    });

    // Products actions
    document.getElementById("add-product-btn").addEventListener("click", () => openEditor(null));
    document.getElementById("export-products-btn").addEventListener("click", exportProducts);
    document.getElementById("import-products-btn").addEventListener("click", () => {
      document.getElementById("import-products-input").click();
    });
    document.getElementById("import-products-input").addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) importProducts(e.target.files[0]);
      e.target.value = "";
    });
    document.getElementById("reset-products-btn").addEventListener("click", resetProducts);
    document.getElementById("migrate-local-products-btn")?.addEventListener("click", migrateLocalProducts);

    // Editor
    document.querySelectorAll("[data-close-editor]").forEach((el) => el.addEventListener("click", closeEditor));
    document.querySelectorAll("#product-editor .lang-tab").forEach((b) =>
      b.addEventListener("click", () => switchEditorLang(b.dataset.lang)));
    document.getElementById("product-form").addEventListener("submit", saveProduct);

    // Orders
    document.querySelectorAll("[data-close-order]").forEach((el) => el.addEventListener("click", closeOrder));
    document.getElementById("orders-filter").addEventListener("change", (e) => {
      state.orderFilter = e.target.value;
      renderOrders();
    });

    // Settings
    document.getElementById("settings-form").addEventListener("submit", saveSettingsForm);
    document.getElementById("migrate-local-rest-btn")?.addEventListener("click", migrateLocalRest);

    // Content editor
    document.querySelectorAll("[data-clang]").forEach((b) => {
      b.addEventListener("click", () => switchContentLang(b.dataset.clang));
    });
    document.getElementById("save-content-btn").addEventListener("click", saveContent);
    document.getElementById("reset-content-btn").addEventListener("click", resetContent);

    // Appearance forms
    document.getElementById("colors-form").addEventListener("submit", saveColors);
    document.getElementById("visibility-form").addEventListener("submit", saveVisibility);
    document.getElementById("reset-theme-btn").addEventListener("click", resetTheme);

    // Color picker ↔ text field sync
    document.querySelectorAll("[data-color-pick]").forEach((pick) => {
      const key = pick.getAttribute("data-color-pick");
      const text = document.querySelector(`#colors-form [name="${key}"]`);
      pick.addEventListener("input", () => { text.value = pick.value; });
      text.addEventListener("input", () => {
        if (/^#[0-9a-fA-F]{6}$/.test(text.value)) pick.value = text.value;
      });
    });

    // Theme image uploads
    document.querySelector('#logo-upload input[type="file"]').addEventListener("change", () =>
      handleThemeImageUpload('#logo-upload input[type="file"]', "logoDataUrl", "Logo saved"));
    document.querySelector('#hero-upload input[type="file"]').addEventListener("change", () =>
      handleThemeImageUpload('#hero-upload input[type="file"]', "heroImageDataUrl", "Hero image saved"));
    document.querySelector('#favicon-upload input[type="file"]').addEventListener("change", () =>
      handleThemeImageUpload('#favicon-upload input[type="file"]', "faviconDataUrl", "Favicon saved"));

    document.getElementById("remove-logo-btn").addEventListener("click", () => removeThemeImage("logoDataUrl", "Logo removed"));
    document.getElementById("remove-hero-btn").addEventListener("click", () => removeThemeImage("heroImageDataUrl", "Hero image removed"));
    document.getElementById("remove-favicon-btn").addEventListener("click", () => removeThemeImage("faviconDataUrl", "Favicon removed"));

    // ESC closes modals
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeEditor(); closeOrder(); }
    });

    // Cleanup channels on unload
    window.addEventListener("beforeunload", unsubscribeAll);
  });
})();
