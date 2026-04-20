/* ---------- La Roselle — Customer site logic ---------- */

(function () {
  const state = {
    lang: localStorage.getItem(STORAGE_KEYS.lang) || "en",
    category: "all",
    cart: Storage.getCart(),
    proofDataUrl: ""
  };

  const t = (key) => tText(state.lang, key);
  const settings = () => Storage.getSettings();
  const products = () => Storage.getProducts();

  /* ---------- i18n ---------- */
  function applyLanguage(lang) {
    state.lang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const text = tText(lang, key);
      if (text != null && text !== "") el.textContent = text;
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
    const theme = Storage.getTheme();

    // Brand name (shop name is a setting)
    document.querySelectorAll("[data-setting='shopName']").forEach((el) => {
      el.textContent = s.shopName || "La Roselle";
    });

    // Logo image (optional) — replaces the rose SVG decoration
    const brandEl = document.querySelector(".brand");
    if (brandEl) {
      brandEl.classList.toggle("has-logo", !!theme.logoDataUrl);
      if (theme.logoDataUrl) {
        brandEl.style.setProperty("--logo-url", `url("${theme.logoDataUrl}")`);
      } else {
        brandEl.style.removeProperty("--logo-url");
      }
    }

    // Hero background image (optional)
    const hero = document.querySelector(".hero");
    if (hero) {
      if (theme.heroImageDataUrl) {
        hero.classList.add("has-hero-image");
        hero.style.setProperty("--hero-bg", `url("${theme.heroImageDataUrl}")`);
      } else {
        hero.classList.remove("has-hero-image");
        hero.style.removeProperty("--hero-bg");
      }
    }

    // Hero flowers toggle
    document.querySelectorAll(".hero .petal").forEach((el) => {
      el.style.display = s.showHeroFlowers ? "" : "none";
    });

    // Section visibility toggles
    const aboutEl = document.getElementById("about");
    if (aboutEl) aboutEl.style.display = s.showAboutSection ? "" : "none";
    const contactEl = document.getElementById("contact");
    if (contactEl) contactEl.style.display = s.showContactSection ? "" : "none";
    document.querySelectorAll('a[href="#about"]').forEach((el) => {
      el.style.display = s.showAboutSection ? "" : "none";
    });
    document.querySelectorAll('a[href="#contact"]').forEach((el) => {
      el.style.display = s.showContactSection ? "" : "none";
    });

    // Language switch — show/hide buttons based on enabled langs
    const langMap = { en: s.langEnEnabled, fr: s.langFrEnabled, ar: s.langArEnabled };
    document.querySelectorAll(".lang-switch button").forEach((btn) => {
      btn.style.display = langMap[btn.dataset.lang] === false ? "none" : "";
    });

    // Bankily details in checkout
    const bName = document.getElementById("bankily-name");
    const bNum = document.getElementById("bankily-number");
    if (bName) bName.textContent = s.bankilyName || "—";
    if (bNum) bNum.textContent = s.bankilyNumber || "—";

    // Payment method toggles
    const bankilyOpt = document.querySelector('.payment-option input[value="bankily"]');
    const codOpt = document.querySelector('.payment-option input[value="cod"]');
    if (bankilyOpt) bankilyOpt.closest(".payment-option").style.display = s.paymentBankilyEnabled ? "" : "none";
    if (codOpt) codOpt.closest(".payment-option").style.display = s.paymentCodEnabled ? "" : "none";
    // If the default (bankily) is disabled, pick COD
    if (!s.paymentBankilyEnabled && codOpt && bankilyOpt && bankilyOpt.checked) {
      codOpt.checked = true;
      syncPaymentMethod();
    }

    // Contact section
    const email = document.querySelector('a[href^="mailto:"]');
    if (email && s.contactEmail) {
      email.href = `mailto:${s.contactEmail}`;
      email.textContent = s.contactEmail;
    }
    const phoneEl = document.getElementById("contact-phone-value");
    if (phoneEl) phoneEl.textContent = s.contactPhone || "";
    const addrEl = document.querySelector('[data-i18n="contact.addressValue"]');
    if (addrEl && s.contactAddress) addrEl.textContent = s.contactAddress;

    // Social links
    const socials = document.getElementById("socials");
    if (socials) {
      const links = [
        { k: "instagramUrl", label: "Instagram", icon: "ig" },
        { k: "facebookUrl", label: "Facebook", icon: "fb" },
        { k: "tiktokUrl", label: "TikTok", icon: "tt" },
        { k: "whatsappNumber", label: "WhatsApp", icon: "wa" }
      ];
      const items = links.map((l) => {
        const val = s[l.k];
        if (!val) return "";
        const href = l.k === "whatsappNumber"
          ? `https://wa.me/${val.replace(/[^0-9]/g, "")}`
          : val;
        const icons = {
          ig: `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.9.9 1.4.2.4.3 1 .4 2.2.1 1.2.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.9.7-1.4.9-.4.2-1 .3-2.2.4-1.2.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.9-.9-1.4-.2-.4-.3-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.9-.7 1.4-.9.4-.2 1-.3 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.3-.5.2-.9.4-1.3.8-.4.4-.6.8-.8 1.3-.1.4-.3 1-.3 2.1-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c.1 1.1.2 1.7.3 2.1.2.5.4.9.8 1.3.4.4.8.6 1.3.8.4.1 1 .3 2.1.3 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.3.5-.2.9-.4 1.3-.8.4-.4.6-.8.8-1.3.1-.4.3-1 .3-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1.1-.2-1.7-.3-2.1-.2-.5-.4-.9-.8-1.3-.4-.4-.8-.6-1.3-.8-.4-.1-1-.3-2.1-.3-1.2-.1-1.6-.1-4.7-.1zm0 3.1a5 5 0 110 10 5 5 0 010-10zm0 1.8a3.2 3.2 0 100 6.4 3.2 3.2 0 000-6.4zm5.2-2.1a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"/></svg>`,
          fb: `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.3-1.5 1.6-1.5h1.7V3.7c-.3 0-1.3-.1-2.5-.1-2.4 0-4.1 1.5-4.1 4.2v2.1H7.5V13h2.7v8h3.3z"/></svg>`,
          tt: `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19.6 7.1v3.2a7.8 7.8 0 01-4.5-1.4v6.5a5.8 5.8 0 11-5-5.7v3.3a2.5 2.5 0 101.8 2.4V2h3.2a4.6 4.6 0 004.5 4.5z"/></svg>`,
          wa: `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24z"/></svg>`
        };
        return `<a href="${href}" target="_blank" rel="noopener" aria-label="${l.label}">${icons[l.icon]}</a>`;
      }).join("");
      socials.innerHTML = items;
      socials.style.display = items ? "" : "none";
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

      // Share button (top-right corner of the image)
      const shareBtn = document.createElement("button");
      shareBtn.type = "button";
      shareBtn.className = "product-share-btn";
      shareBtn.setAttribute("aria-label", t("products.share"));
      shareBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openShareModal(p);
      });
      imgWrap.appendChild(shareBtn);

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
        <div style="display:flex; gap:.7rem; justify-content:center; margin-top:1.5rem; flex-wrap:wrap;">
          <button class="btn" id="modal-add-btn">${escapeHtml(t("products.addToCart"))}</button>
          <button class="btn-ghost" id="modal-share-btn" style="display:inline-flex; align-items:center; gap:.4rem;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            ${escapeHtml(t("products.share"))}
          </button>
        </div>
      </div>
    `;
    document.getElementById("modal-add-btn").addEventListener("click", () => {
      addToCart(p.id);
      closeProductModal();
      openDrawer();
    });
    document.getElementById("modal-share-btn").addEventListener("click", () => {
      openShareModal(p);
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

  /* ---------- Share modal ---------- */
  function buildProductUrl(p) {
    // Points the link back to the shop with a product anchor.
    // The anchor is handled in init to auto-open the product modal.
    const base = window.location.origin + window.location.pathname;
    return `${base}#product=${encodeURIComponent(p.id)}`;
  }

  function openShareModal(p) {
    const name = p.name[state.lang] || p.name.en;
    const desc = p.description[state.lang] || p.description.en;
    const price = formatPrice(p.price);
    const url = buildProductUrl(p);
    const shopName = settings().shopName || "La Roselle";
    const shareText = `🌸 ${name} — ${price}\n${desc}\n\n${shopName}`;

    // Preview
    const preview = document.getElementById("share-preview");
    const imgHtml = p.image
      ? `<img src="${escapeAttr(p.image)}" alt="${escapeAttr(name)}">`
      : `<img alt="" style="display:flex; align-items:center; justify-content:center; font-size:1.8rem;">`;
    preview.innerHTML = `
      ${imgHtml}
      <div class="sp-body">
        <div class="sp-name">${escapeHtml(name)}</div>
        <div class="sp-price">${escapeHtml(price)}</div>
      </div>
    `;

    // Build share buttons
    const encUrl = encodeURIComponent(url);
    const encText = encodeURIComponent(shareText);
    const encTextWithUrl = encodeURIComponent(`${shareText}\n${url}`);

    const buttons = [
      {
        cls: "wa",
        label: t("share.whatsapp"),
        href: `https://wa.me/?text=${encTextWithUrl}`,
        icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.888-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.599 5.351l.241.383-1.001 3.656 3.751-.983.002-.106z"/></svg>`
      },
      {
        cls: "fb",
        label: t("share.facebook"),
        href: `https://www.facebook.com/sharer/sharer.php?u=${encUrl}&quote=${encText}`,
        icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.3-1.5 1.6-1.5h1.7V3.7c-.3 0-1.3-.1-2.5-.1-2.4 0-4.1 1.5-4.1 4.2v2.1H7.5V13h2.7v8h3.3z"/></svg>`
      },
      {
        cls: "tw",
        label: t("share.twitter"),
        href: `https://twitter.com/intent/tweet?text=${encText}&url=${encUrl}`,
        icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`
      },
      {
        cls: "tg",
        label: t("share.telegram"),
        href: `https://t.me/share/url?url=${encUrl}&text=${encText}`,
        icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`
      },
      {
        cls: "em",
        label: t("share.email"),
        href: `mailto:?subject=${encodeURIComponent(name)}&body=${encTextWithUrl}`,
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3,7 12,13 21,7"/></svg>`
      }
    ];

    if (navigator.share) {
      buttons.push({
        cls: "nt",
        label: t("share.nativeShare"),
        native: true,
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`
      });
    }

    const btnsEl = document.getElementById("share-buttons");
    btnsEl.innerHTML = buttons.map((b) => {
      if (b.native) {
        return `<button type="button" class="share-btn ${b.cls}" data-native>${b.icon}<span class="share-label">${escapeHtml(b.label)}</span></button>`;
      }
      return `<a class="share-btn ${b.cls}" href="${escapeAttr(b.href)}" target="_blank" rel="noopener noreferrer">${b.icon}<span class="share-label">${escapeHtml(b.label)}</span></a>`;
    }).join("");

    const nativeBtn = btnsEl.querySelector("[data-native]");
    if (nativeBtn) {
      nativeBtn.addEventListener("click", async () => {
        try {
          await navigator.share({ title: name, text: shareText, url });
        } catch (err) { /* user cancelled */ }
      });
    }

    // Link row
    document.getElementById("share-link-input").value = url;
    const copyBtn = document.getElementById("share-copy-btn");
    copyBtn.classList.remove("copied");
    copyBtn.textContent = t("share.copyLink");

    // Show modal
    const m = document.getElementById("share-modal");
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeShareModal() {
    const m = document.getElementById("share-modal");
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  async function copyShareLink() {
    const input = document.getElementById("share-link-input");
    const btn = document.getElementById("share-copy-btn");
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (err) {
      input.select();
      document.execCommand("copy");
    }
    btn.classList.add("copied");
    btn.textContent = t("products.linkCopied");
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.textContent = t("share.copyLink");
    }, 2200);
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
    document.querySelectorAll("[data-close-share]").forEach((el) => el.addEventListener("click", closeShareModal));
    document.getElementById("share-copy-btn").addEventListener("click", copyShareLink);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeProductModal(); closeDrawer(); closeCheckout(); closeConfirm(); closeShareModal();
      }
    });

    // If the page was opened with #product=<id>, auto-open that product
    function openFromHash() {
      const match = (window.location.hash || "").match(/product=([^&]+)/);
      if (!match) return;
      const id = decodeURIComponent(match[1]);
      const p = products().find((x) => x.id === id);
      if (p) {
        setTimeout(() => openProductModal(p), 300);
      }
    }
    window.addEventListener("hashchange", openFromHash);

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

    // React to storage changes (e.g. admin edits in another tab)
    window.addEventListener("storage", (e) => {
      if ([STORAGE_KEYS.products, STORAGE_KEYS.settings, STORAGE_KEYS.content, STORAGE_KEYS.theme].includes(e.key)) {
        applyTheme();
        renderCategoryFilter();
        renderProducts();
        renderCart();
        applyLanguage(state.lang);
      }
    });

    applyTheme();
    applyLanguage(state.lang);
    updateCartBadge();
    openFromHash();
  });
})();
