/* ---------- La Roselle — Customer site logic ---------- */

(function () {
  const state = {
    lang: localStorage.getItem(STORAGE_KEYS.lang) || "en",
    category: "all",
    cart: Storage.getCart(),
    proofDataUrl: ""
  };

  const t = (key) => (TRANSLATIONS[state.lang] || TRANSLATIONS.en)[key] || key;
  const settings = () => Storage.getSettings();
  const products = () => Storage.getProducts();

  /* ---------- i18n ---------- */
  function applyLanguage(lang) {
    state.lang = lang;
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (dict[key]) el.textContent = dict[key];
    });

    document.querySelectorAll(".lang-switch button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });

    localStorage.setItem(STORAGE_KEYS.lang, lang);

    renderCategoryFilter();
    renderProducts();
    renderCart();
    syncSettingsToUi();
  }

  /* ---------- Settings sync ---------- */
  function syncSettingsToUi() {
    const s = settings();
    // Bankily details in checkout
    const bName = document.getElementById("bankily-name");
    const bNum = document.getElementById("bankily-number");
    if (bName) bName.textContent = s.bankilyName || "—";
    if (bNum) bNum.textContent = s.bankilyNumber || "—";

    // Contact section
    const email = document.querySelector('a[href^="mailto:"]');
    if (email && s.contactEmail) {
      email.href = `mailto:${s.contactEmail}`;
      email.textContent = s.contactEmail;
    }
  }

  /* ---------- Category filter ---------- */
  function getCategories() {
    const set = new Set();
    products().forEach((p) => set.add(p.category[state.lang] || p.category.en));
    return [...set];
  }
  function renderCategoryFilter() {
    const select = document.getElementById("category-filter");
    if (!select) return;
    select.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = t("products.all");
    select.appendChild(allOpt);
    getCategories().forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat; opt.textContent = cat;
      select.appendChild(opt);
    });
    select.value = state.category;
    select.onchange = (e) => { state.category = e.target.value; renderProducts(); };
  }

  /* ---------- Products ---------- */
  function renderProducts() {
    const grid = document.getElementById("product-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const items = products().filter((p) => {
      if (state.category === "all") return true;
      return (p.category[state.lang] || p.category.en) === state.category;
    });

    items.forEach((p) => {
      const card = document.createElement("article");
      card.className = "product-card";
      card.setAttribute("data-id", p.id);

      const imgWrap = document.createElement("div");
      imgWrap.className = "product-img" + (p.image ? "" : " placeholder");
      if (p.image) {
        const img = document.createElement("img");
        img.src = p.image;
        img.alt = p.name[state.lang] || p.name.en;
        img.loading = "lazy";
        imgWrap.appendChild(img);
      }

      const body = document.createElement("div");
      body.className = "product-body";
      body.innerHTML = `
        <div class="product-category">${escapeHtml(p.category[state.lang] || p.category.en)}</div>
        <h3 class="product-name">${escapeHtml(p.name[state.lang] || p.name.en)}</h3>
        <p class="product-desc">${escapeHtml(p.description[state.lang] || p.description.en)}</p>
        <div class="product-price">${escapeHtml(formatPrice(p.price))}</div>
      `;

      const addBtn = document.createElement("button");
      addBtn.className = "btn-small";
      addBtn.type = "button";
      addBtn.textContent = t("products.addToCart");
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        addToCart(p.id);
        addBtn.classList.add("added");
        addBtn.textContent = t("products.added");
        setTimeout(() => {
          addBtn.classList.remove("added");
          addBtn.textContent = t("products.addToCart");
        }, 1400);
      });
      body.appendChild(addBtn);

      card.appendChild(imgWrap);
      card.appendChild(body);
      card.addEventListener("click", () => openProductModal(p));
      grid.appendChild(card);
    });
  }

  /* ---------- Product modal ---------- */
  function openProductModal(p) {
    const modal = document.getElementById("product-modal");
    const body = modal.querySelector(".modal-body");
    const name = p.name[state.lang] || p.name.en;
    const cat  = p.category[state.lang] || p.category.en;
    const desc = p.description[state.lang] || p.description.en;

    const imageHtml = p.image
      ? `<div class="modal-img"><img src="${escapeAttr(p.image)}" alt="${escapeAttr(name)}"></div>`
      : `<div class="modal-img placeholder"></div>`;

    body.innerHTML = `
      ${imageHtml}
      <div class="modal-content">
        <div class="modal-category">${escapeHtml(cat)}</div>
        <h3>${escapeHtml(name)}</h3>
        <div class="modal-price">${escapeHtml(formatPrice(p.price))}</div>
        <p class="modal-desc">${escapeHtml(desc)}</p>
        <button class="btn" style="margin-top:1.5rem;" id="modal-add-btn">${escapeHtml(t("products.addToCart"))}</button>
      </div>
    `;
    document.getElementById("modal-add-btn").addEventListener("click", () => {
      addToCart(p.id);
      closeProductModal();
      openDrawer();
    });

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeProductModal() {
    const modal = document.getElementById("product-modal");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  /* ---------- Cart ---------- */
  function addToCart(productId, qty = 1) {
    const existing = state.cart.find((c) => c.id === productId);
    if (existing) existing.qty += qty;
    else state.cart.push({ id: productId, qty });
    Storage.saveCart(state.cart);
    updateCartBadge();
    renderCart();
  }
  function removeFromCart(productId) {
    state.cart = state.cart.filter((c) => c.id !== productId);
    Storage.saveCart(state.cart);
    updateCartBadge();
    renderCart();
  }
  function setQty(productId, qty) {
    const item = state.cart.find((c) => c.id === productId);
    if (!item) return;
    item.qty = Math.max(1, qty);
    Storage.saveCart(state.cart);
    updateCartBadge();
    renderCart();
  }
  function cartTotalCount() {
    return state.cart.reduce((sum, i) => sum + i.qty, 0);
  }
  function cartTotal() {
    const map = Object.fromEntries(products().map((p) => [p.id, p]));
    return state.cart.reduce((sum, i) => {
      const p = map[i.id];
      return sum + (p ? (Number(p.price) || 0) * i.qty : 0);
    }, 0);
  }
  function updateCartBadge() {
    const el = document.getElementById("cart-count");
    if (!el) return;
    const n = cartTotalCount();
    el.textContent = n;
    el.classList.toggle("hidden", n === 0);
  }

  function renderCart() {
    const body = document.getElementById("cart-body");
    const footer = document.getElementById("cart-footer");
    if (!body) return;
    const map = Object.fromEntries(products().map((p) => [p.id, p]));
    const items = state.cart.filter((i) => map[i.id]);

    if (items.length === 0) {
      body.innerHTML = `
        <div class="cart-empty">
          <div class="emoji">🌸</div>
          <p>${escapeHtml(t("cart.empty"))}</p>
          <p>${escapeHtml(t("cart.emptyHint"))}</p>
        </div>`;
      footer.style.display = "none";
      return;
    }

    body.innerHTML = items.map((i) => {
      const p = map[i.id];
      const name = p.name[state.lang] || p.name.en;
      const lineTotal = (Number(p.price) || 0) * i.qty;
      const imgHtml = p.image
        ? `<img src="${escapeAttr(p.image)}" alt="${escapeAttr(name)}">`
        : `🌸`;
      return `
        <div class="cart-item" data-id="${escapeAttr(p.id)}">
          <div class="cart-item-img">${imgHtml}</div>
          <div>
            <div class="cart-item-name">${escapeHtml(name)}</div>
            <div class="cart-item-price">${escapeHtml(formatPrice(p.price))}</div>
            <div class="qty-group">
              <button type="button" data-action="dec">−</button>
              <span>${i.qty}</span>
              <button type="button" data-action="inc">+</button>
            </div>
          </div>
          <div class="cart-item-right">
            <div class="cart-item-total">${escapeHtml(formatPrice(lineTotal))}</div>
            <button type="button" class="cart-item-remove" data-action="remove">${escapeHtml(t("cart.remove"))}</button>
          </div>
        </div>
      `;
    }).join("");

    // bind qty buttons
    body.querySelectorAll(".cart-item").forEach((row) => {
      const id = row.getAttribute("data-id");
      const item = state.cart.find((c) => c.id === id);
      row.querySelector('[data-action="dec"]').addEventListener("click", () => setQty(id, item.qty - 1));
      row.querySelector('[data-action="inc"]').addEventListener("click", () => setQty(id, item.qty + 1));
      row.querySelector('[data-action="remove"]').addEventListener("click", () => removeFromCart(id));
    });

    footer.style.display = "block";
    document.getElementById("cart-total").textContent = formatPrice(cartTotal());
  }

  function openDrawer() {
    const d = document.getElementById("cart-drawer");
    d.classList.add("open");
    d.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeDrawer() {
    const d = document.getElementById("cart-drawer");
    d.classList.remove("open");
    d.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  /* ---------- Checkout ---------- */
  function openCheckout() {
    if (state.cart.length === 0) return;
    const map = Object.fromEntries(products().map((p) => [p.id, p]));
    const items = state.cart.filter((i) => map[i.id]);
    const ul = document.getElementById("checkout-items");
    ul.innerHTML = items.map((i) => {
      const p = map[i.id];
      const name = p.name[state.lang] || p.name.en;
      const line = (Number(p.price) || 0) * i.qty;
      return `<li><span>${escapeHtml(name)} × ${i.qty}</span><span>${escapeHtml(formatPrice(line))}</span></li>`;
    }).join("");
    document.getElementById("checkout-total").textContent = formatPrice(cartTotal());

    // reset form & proof
    const form = document.getElementById("checkout-form");
    form.reset();
    state.proofDataUrl = "";
    const preview = document.getElementById("proof-preview");
    preview.classList.remove("show");
    document.getElementById("proof-upload").classList.remove("has-file");
    document.getElementById("proof-upload-text").textContent = t("checkout.proofHelp");
    form.querySelectorAll(".field.error").forEach((f) => f.classList.remove("error"));
    syncPaymentMethod();

    closeDrawer();
    const m = document.getElementById("checkout-modal");
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeCheckout() {
    const m = document.getElementById("checkout-modal");
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function syncPaymentMethod() {
    const selected = document.querySelector('input[name="payment"]:checked')?.value || "bankily";
    document.querySelectorAll(".payment-option").forEach((el) => {
      const radio = el.querySelector('input[name="payment"]');
      el.classList.toggle("selected", radio.checked);
    });
    const block = document.getElementById("bankily-block");
    block.style.display = (selected === "bankily") ? "block" : "none";
  }

  async function handleProofChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file, 1200, 0.8);
      state.proofDataUrl = dataUrl;
      const preview = document.getElementById("proof-preview");
      preview.src = dataUrl;
      preview.classList.add("show");
      const upload = document.getElementById("proof-upload");
      upload.classList.add("has-file");
      document.getElementById("proof-upload-text").textContent = file.name;
    } catch (err) {
      console.error(err);
    }
  }

  function submitOrder(ev) {
    ev.preventDefault();
    const form = ev.target;
    const fd = new FormData(form);
    const payment = fd.get("payment");
    const name = (fd.get("name") || "").toString().trim();
    const phone = (fd.get("phone") || "").toString().trim();
    const address = (fd.get("address") || "").toString().trim();
    const notes = (fd.get("notes") || "").toString().trim();

    let valid = true;
    form.querySelectorAll(".field.error").forEach((f) => f.classList.remove("error"));
    [["name", name], ["phone", phone], ["address", address]].forEach(([n, v]) => {
      if (!v) {
        const input = form.querySelector(`[name="${n}"]`);
        if (input) input.closest(".field").classList.add("error");
        valid = false;
      }
    });
    if (payment === "bankily" && !state.proofDataUrl) {
      const upload = document.getElementById("proof-upload");
      upload.closest(".field").classList.add("error");
      valid = false;
    }
    if (!valid) return;

    const map = Object.fromEntries(products().map((p) => [p.id, p]));
    const orderItems = state.cart.map((i) => {
      const p = map[i.id];
      return {
        id: p.id,
        name: p.name.en,
        nameTranslations: p.name,
        price: Number(p.price) || 0,
        qty: i.qty,
        lineTotal: (Number(p.price) || 0) * i.qty
      };
    });

    const order = {
      id: `LR${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`,
      createdAt: new Date().toISOString(),
      customer: { name, phone, address, notes },
      payment: { method: payment, proofDataUrl: payment === "bankily" ? state.proofDataUrl : "" },
      items: orderItems,
      total: cartTotal(),
      currency: settings().currency,
      status: payment === "bankily" ? "awaiting_verification" : "pending",
      lang: state.lang
    };

    Storage.addOrder(order);
    Storage.clearCart();
    state.cart = [];
    updateCartBadge();
    renderCart();
    closeCheckout();
    showConfirmation(order);
  }

  function showConfirmation(order) {
    document.getElementById("confirm-order-id").textContent = order.id;
    const statusText = document.getElementById("confirm-status-text");
    statusText.textContent = order.payment.method === "bankily"
      ? t("confirm.pendingBankily")
      : t("confirm.pendingCod");

    // WhatsApp message
    const s = settings();
    const lines = [
      `🌸 *La Roselle — ${order.id}*`,
      ``,
      `${t("checkout.name")}: ${order.customer.name}`,
      `${t("checkout.phone")}: ${order.customer.phone}`,
      `${t("checkout.address")}: ${order.customer.address}`,
      order.customer.notes ? `${t("checkout.notes")}: ${order.customer.notes}` : null,
      ``,
      `${t("checkout.summary")}:`,
      ...order.items.map((i) => `• ${i.nameTranslations[order.lang] || i.name} × ${i.qty} — ${formatPrice(i.lineTotal)}`),
      ``,
      `${t("cart.total")}: ${formatPrice(order.total)}`,
      `${t("checkout.payment")}: ${order.payment.method === "bankily" ? t("checkout.pay.bankily") : t("checkout.pay.cod")}`
    ].filter(Boolean);
    const msg = encodeURIComponent(lines.join("\n"));

    const waBtn = document.getElementById("confirm-whatsapp-btn");
    if (s.whatsappNumber) {
      waBtn.href = `https://wa.me/${s.whatsappNumber.replace(/[^0-9]/g, "")}?text=${msg}`;
      waBtn.style.display = "";
    } else {
      waBtn.href = `https://wa.me/?text=${msg}`;
    }

    const m = document.getElementById("confirm-modal");
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeConfirm() {
    const m = document.getElementById("confirm-modal");
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  /* ---------- Utils ---------- */
  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    // Language buttons
    document.querySelectorAll(".lang-switch button").forEach((btn) => {
      btn.addEventListener("click", () => applyLanguage(btn.dataset.lang));
    });

    // Modals / drawers close buttons
    document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", closeProductModal));
    document.querySelectorAll("[data-close-drawer]").forEach((el) => el.addEventListener("click", closeDrawer));
    document.querySelectorAll("[data-close-checkout]").forEach((el) => el.addEventListener("click", closeCheckout));
    document.querySelectorAll("[data-close-confirm]").forEach((el) => el.addEventListener("click", closeConfirm));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeProductModal(); closeDrawer(); closeCheckout(); closeConfirm();
      }
    });

    // Cart
    document.getElementById("cart-button").addEventListener("click", openDrawer);
    document.getElementById("cart-checkout-btn").addEventListener("click", openCheckout);

    // Checkout form
    document.querySelectorAll('input[name="payment"]').forEach((el) => {
      el.addEventListener("change", syncPaymentMethod);
    });
    document.querySelector('#proof-upload input[type="file"]').addEventListener("change", handleProofChange);
    document.getElementById("checkout-form").addEventListener("submit", submitOrder);

    // Year
    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // React to storage changes (e.g. admin adds product in another tab)
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEYS.products || e.key === STORAGE_KEYS.settings) {
        renderCategoryFilter();
        renderProducts();
        renderCart();
        syncSettingsToUi();
      }
    });

    applyLanguage(state.lang);
    updateCartBadge();
  });
})();
