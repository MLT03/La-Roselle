/* ---------- La Roselle — Admin logic ---------- */

(function () {
  const state = {
    authed: false,
    editorMode: "new",    // "new" | "edit"
    editorImageDataUrl: "",
    editorProductId: null,
    activeTab: "products",
    orderFilter: "all"
  };

  /* ---------- Login ---------- */
  async function tryLogin(password) {
    const admin = Storage.getAdmin();
    if (!admin.passwordHash) {
      // First-run: accept the default password, then store a hash of it.
      if (password === admin.defaultPassword) {
        const hash = await sha256(password);
        Storage.saveAdmin({ passwordHash: hash });
        return true;
      }
      return false;
    }
    const hash = await sha256(password);
    return hash === admin.passwordHash;
  }

  function showApp() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("admin-app").style.display = "flex";
    sessionStorage.setItem("laroselle.admin.session", "1");
    state.authed = true;
    refreshAll();
  }
  function showLogin() {
    document.getElementById("admin-app").style.display = "none";
    document.getElementById("login-screen").style.display = "flex";
    sessionStorage.removeItem("laroselle.admin.session");
    state.authed = false;
  }

  /* ---------- Tabs ---------- */
  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === tab));
  }

  /* ---------- Products ---------- */
  function renderProducts() {
    const grid = document.getElementById("products-list");
    const list = Storage.getProducts();
    if (list.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <h3>No products yet</h3>
          <p>Click "New product" to add your first item.</p>
        </div>`;
      return;
    }
    grid.innerHTML = list.map((p) => {
      const name = p.name.en || Object.values(p.name)[0] || "";
      const cat  = p.category.en || Object.values(p.category)[0] || "";
      const img = p.image
        ? `<img src="${escapeAttr(p.image)}" alt="${escapeAttr(name)}">`
        : "";
      return `
        <div class="admin-product-card" data-id="${escapeAttr(p.id)}">
          <div class="admin-product-img ${p.image ? "" : "placeholder"}">${img}</div>
          <div class="admin-product-body">
            <div class="admin-product-cat">${escapeHtml(cat)}</div>
            <div class="admin-product-name">${escapeHtml(name)}</div>
            <div class="admin-product-price">${escapeHtml(formatPrice(p.price))}</div>
            <div class="admin-product-actions">
              <button class="edit">Edit</button>
              <button class="delete">Delete</button>
            </div>
          </div>
        </div>`;
    }).join("");

    grid.querySelectorAll(".admin-product-card").forEach((card) => {
      const id = card.getAttribute("data-id");
      card.querySelector(".edit").addEventListener("click", () => openEditor(id));
      card.querySelector(".delete").addEventListener("click", () => {
        if (confirm("Delete this product?")) {
          Storage.saveProducts(Storage.getProducts().filter((x) => x.id !== id));
          renderProducts();
          toast("Product deleted");
        }
      });
    });
  }

  function openEditor(productId) {
    const form = document.getElementById("product-form");
    form.reset();
    state.editorImageDataUrl = "";
    document.getElementById("editor-img-preview").classList.remove("show");
    document.getElementById("editor-img-upload").classList.remove("has-file");
    document.getElementById("editor-img-text").textContent = "Click to upload a product photo";

    if (productId) {
      state.editorMode = "edit";
      state.editorProductId = productId;
      const p = Storage.getProducts().find((x) => x.id === productId);
      if (!p) return;
      document.getElementById("editor-title").textContent = "Edit product";
      form.querySelector('[name="id"]').value = p.id;
      form.querySelector('[name="id"]').readOnly = true;
      form.querySelector('[name="price"]').value = p.price;
      form.querySelector('[name="name_en"]').value = p.name.en || "";
      form.querySelector('[name="name_fr"]').value = p.name.fr || "";
      form.querySelector('[name="name_ar"]').value = p.name.ar || "";
      form.querySelector('[name="category_en"]').value = p.category.en || "";
      form.querySelector('[name="category_fr"]').value = p.category.fr || "";
      form.querySelector('[name="category_ar"]').value = p.category.ar || "";
      form.querySelector('[name="description_en"]').value = p.description.en || "";
      form.querySelector('[name="description_fr"]').value = p.description.fr || "";
      form.querySelector('[name="description_ar"]').value = p.description.ar || "";
      if (p.image) {
        state.editorImageDataUrl = p.image;
        const preview = document.getElementById("editor-img-preview");
        preview.src = p.image;
        preview.classList.add("show");
        document.getElementById("editor-img-upload").classList.add("has-file");
        document.getElementById("editor-img-text").textContent = "Image loaded — click to change";
      }
    } else {
      state.editorMode = "new";
      state.editorProductId = null;
      document.getElementById("editor-title").textContent = "New product";
      form.querySelector('[name="id"]').readOnly = false;
    }

    // switch back to EN tab by default
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
  function switchEditorLang(lang) {
    document.querySelectorAll(".lang-tab").forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
    document.querySelectorAll(".lang-fields").forEach((f) => {
      f.style.display = f.dataset.lang === lang ? "block" : "none";
    });
  }
  async function handleEditorImage(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file, 900, 0.82);
      state.editorImageDataUrl = dataUrl;
      const preview = document.getElementById("editor-img-preview");
      preview.src = dataUrl;
      preview.classList.add("show");
      document.getElementById("editor-img-upload").classList.add("has-file");
      document.getElementById("editor-img-text").textContent = file.name;
    } catch (err) { console.error(err); }
  }
  function saveProduct(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const id = (fd.get("id") || "").toString().trim();
    const price = Number(fd.get("price") || 0);
    if (!id) return;

    const list = Storage.getProducts();
    if (state.editorMode === "new" && list.some((x) => x.id === id)) {
      alert(`A product with id "${id}" already exists.`);
      return;
    }

    const p = {
      id,
      image: state.editorImageDataUrl,
      price,
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

    if (state.editorMode === "edit") {
      const idx = list.findIndex((x) => x.id === id);
      if (idx >= 0) list[idx] = p;
    } else {
      list.push(p);
    }
    Storage.saveProducts(list);
    closeEditor();
    renderProducts();
    toast(state.editorMode === "edit" ? "Product updated" : "Product added");
  }

  /* ---------- Export / Import ---------- */
  function exportProducts() {
    const data = JSON.stringify(Storage.getProducts(), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `la-roselle-products-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("Products exported");
  }
  function importProducts(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error("Not an array");
        if (!confirm(`Import ${parsed.length} products? This will replace your current list.`)) return;
        Storage.saveProducts(parsed);
        renderProducts();
        toast("Products imported");
      } catch (err) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  }
  function resetProducts() {
    if (!confirm("Reset products to the built-in defaults? Your current list will be lost.")) return;
    Storage.resetProducts();
    renderProducts();
    toast("Products reset");
  }

  /* ---------- Orders ---------- */
  const STATUSES = ["awaiting_verification", "pending", "accepted", "shipped", "completed", "cancelled"];

  function renderOrdersBadge() {
    const pending = Storage.getOrders().filter((o) => o.status === "awaiting_verification" || o.status === "pending").length;
    const el = document.getElementById("orders-badge");
    el.textContent = pending;
    el.classList.toggle("hidden", pending === 0);
  }

  function renderOrders() {
    const list = Storage.getOrders();
    const filter = state.orderFilter;
    const filtered = filter === "all" ? list : list.filter((o) => o.status === filter);
    const wrap = document.getElementById("orders-list");
    if (filtered.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <h3>No orders yet</h3>
          <p>Orders placed by customers on this browser appear here.</p>
        </div>`;
      return;
    }

    wrap.innerHTML = filtered.map((o) => {
      const when = new Date(o.createdAt).toLocaleString();
      const statusLabel = o.status.replace(/_/g, " ");
      const count = o.items.reduce((s, i) => s + i.qty, 0);
      return `
        <div class="order-row" data-id="${escapeAttr(o.id)}">
          <div class="order-id">${escapeHtml(o.id)}</div>
          <div class="order-info">
            <strong>${escapeHtml(o.customer.name)}</strong> · ${escapeHtml(o.customer.phone)}
            <br/>
            ${count} items · ${escapeHtml(when)} · ${o.payment.method === "bankily" ? "Bankily" : "Cash on delivery"}
          </div>
          <div class="order-total">${escapeHtml(formatPriceWithCurrency(o.total, o.currency))}</div>
          <span class="status-chip ${o.status}">${escapeHtml(statusLabel)}</span>
        </div>`;
    }).join("");

    wrap.querySelectorAll(".order-row").forEach((row) => {
      row.addEventListener("click", () => openOrderDetail(row.getAttribute("data-id")));
    });
  }

  function openOrderDetail(orderId) {
    const o = Storage.getOrders().find((x) => x.id === orderId);
    if (!o) return;
    const when = new Date(o.createdAt).toLocaleString();
    const itemsHtml = o.items.map((i) =>
      `<li><span>${escapeHtml(i.name)} × ${i.qty}</span><span>${escapeHtml(formatPriceWithCurrency(i.lineTotal, o.currency))}</span></li>`
    ).join("");

    const statusOptions = STATUSES.map((s) =>
      `<option value="${s}" ${s === o.status ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`
    ).join("");

    const proofHtml = (o.payment.method === "bankily" && o.payment.proofDataUrl)
      ? `<div class="proof-wrap">
           <img src="${escapeAttr(o.payment.proofDataUrl)}" alt="Proof of payment">
           <div class="proof-actions">
             <a href="${escapeAttr(o.payment.proofDataUrl)}" download="${escapeAttr(o.id)}-proof.jpg" class="btn-ghost" style="padding:.5rem 1rem;font-size:.78rem;">⬇ Download</a>
             <a href="${escapeAttr(o.payment.proofDataUrl)}" target="_blank" rel="noopener" class="btn-ghost" style="padding:.5rem 1rem;font-size:.78rem;">Open in new tab</a>
           </div>
         </div>`
      : (o.payment.method === "bankily"
          ? `<p style="color:#a86400;">No proof uploaded.</p>`
          : `<p style="color:var(--ink-soft);">Cash on delivery — no proof expected.</p>`);

    const detail = document.getElementById("order-detail");
    detail.innerHTML = `
      <h3>Order ${escapeHtml(o.id)}</h3>
      <div class="meta">${escapeHtml(when)} · Language: ${escapeHtml(o.lang)}</div>

      <div class="section">
        <h4>Status</h4>
        <div class="section-body status-control">
          <span class="status-chip ${o.status}">${escapeHtml(o.status.replace(/_/g, " "))}</span>
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
        <h4>Payment — ${o.payment.method === "bankily" ? "Bankily" : "Cash on delivery"}</h4>
        <div class="section-body">${proofHtml}</div>
      </div>

      <div class="danger-zone">
        <button class="btn-ghost danger" id="delete-order-btn">Delete order</button>
      </div>
    `;

    document.getElementById("save-status-btn").addEventListener("click", () => {
      const newStatus = document.getElementById("status-select").value;
      Storage.updateOrder(o.id, { status: newStatus });
      renderOrders();
      renderOrdersBadge();
      openOrderDetail(o.id);
      toast("Status updated");
    });
    document.getElementById("delete-order-btn").addEventListener("click", () => {
      if (!confirm("Delete this order permanently?")) return;
      Storage.deleteOrder(o.id);
      closeOrder();
      renderOrders();
      renderOrdersBadge();
      toast("Order deleted");
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

  /* ---------- Settings ---------- */
  function loadSettingsForm() {
    const s = Storage.getSettings();
    const f = document.getElementById("settings-form");
    Object.entries(s).forEach(([k, v]) => {
      const input = f.querySelector(`[name="${k}"]`);
      if (input) input.value = v;
    });
  }
  function saveSettingsForm(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const next = {};
    fd.forEach((v, k) => { next[k] = v.toString(); });
    Storage.saveSettings({ ...Storage.getSettings(), ...next });
    toast("Settings saved");
  }

  async function savePassword(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const current = fd.get("current").toString();
    const next = fd.get("next").toString();
    const confirmPw = fd.get("confirm").toString();
    const err = document.getElementById("password-error");
    const ok = document.getElementById("password-success");
    err.classList.remove("show"); ok.classList.remove("show");

    const admin = Storage.getAdmin();
    const currentHash = await sha256(current);
    const expected = admin.passwordHash || (await sha256(admin.defaultPassword));
    if (currentHash !== expected) {
      err.textContent = "Current password is incorrect."; err.classList.add("show");
      return;
    }
    if (next.length < 4) {
      err.textContent = "New password must be at least 4 characters."; err.classList.add("show");
      return;
    }
    if (next !== confirmPw) {
      err.textContent = "New passwords do not match."; err.classList.add("show");
      return;
    }
    const hash = await sha256(next);
    Storage.saveAdmin({ passwordHash: hash });
    ev.target.reset();
    ok.textContent = "Password updated.";
    ok.classList.add("show");
    toast("Password updated");
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(text) {
    const el = document.getElementById("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  /* ---------- Utils ---------- */
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function refreshAll() {
    renderProducts();
    renderOrders();
    renderOrdersBadge();
    loadSettingsForm();
  }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    // Session auto-login within the same tab
    if (sessionStorage.getItem("laroselle.admin.session")) {
      showApp();
    } else {
      showLogin();
    }

    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = document.getElementById("login-password").value;
      const ok = await tryLogin(pw);
      const err = document.getElementById("login-error");
      if (ok) {
        err.classList.remove("show");
        showApp();
      } else {
        err.textContent = "Incorrect password.";
        err.classList.add("show");
      }
    });
    document.getElementById("logout-btn").addEventListener("click", showLogin);

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

    // Editor
    document.querySelectorAll("[data-close-editor]").forEach((el) => el.addEventListener("click", closeEditor));
    document.querySelectorAll(".lang-tab").forEach((b) => b.addEventListener("click", () => switchEditorLang(b.dataset.lang)));
    document.querySelector('#editor-img-upload input[type="file"]').addEventListener("change", handleEditorImage);
    document.getElementById("product-form").addEventListener("submit", saveProduct);

    // Orders
    document.querySelectorAll("[data-close-order]").forEach((el) => el.addEventListener("click", closeOrder));
    document.getElementById("orders-filter").addEventListener("change", (e) => {
      state.orderFilter = e.target.value;
      renderOrders();
    });

    // Settings
    document.getElementById("settings-form").addEventListener("submit", saveSettingsForm);
    document.getElementById("password-form").addEventListener("submit", savePassword);

    // ESC closes modals
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeEditor(); closeOrder(); }
    });

    // React to changes from other tabs
    window.addEventListener("storage", (e) => {
      if (!state.authed) return;
      if (e.key === STORAGE_KEYS.orders) { renderOrders(); renderOrdersBadge(); }
      if (e.key === STORAGE_KEYS.products) renderProducts();
      if (e.key === STORAGE_KEYS.settings) loadSettingsForm();
    });
  });
})();
