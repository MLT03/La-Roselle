/* ---------- La Roselle — Customer site logic (Supabase-backed) ---------- */

(function () {
  const state = {
    lang: localStorage.getItem(STORAGE_KEYS.lang) || "en",
    category: "all",
    search: "",
    cart: Storage.getCart(),
    proofFile: null,              // pending proof upload (File)
    proofPreviewUrl: "",          // object URL for preview
    productCarousels: new Map(),  // productId -> { index, images }
    channels: []
  };

  const t = (key) => tText(state.lang, key);
  const settings = () => Storage.getCachedSettings();
  const products = () => Storage.getCachedProducts();

  /* ---------- Search helpers ---------- */
  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  }
  function matchesSearch(p, q) {
    if (!q) return true;
    const needle = normalize(q);
    const fields = [
      p.name?.en, p.name?.fr, p.name?.ar,
      p.description?.en, p.description?.fr, p.description?.ar,
      p.category?.en, p.category?.fr, p.category?.ar
    ];
    return fields.some((f) => normalize(f).includes(needle));
  }

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

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const text = tText(lang, key);
      if (text != null && text !== "") el.setAttribute("placeholder", text);
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
    const theme = Storage.getCachedTheme();

    document.querySelectorAll("[data-setting='shopName']").forEach((el) => {
      el.textContent = s.shopName || "La Roselle";
    });

    const brandEl = document.querySelector(".brand");
    if (brandEl) {
      brandEl.classList.toggle("has-logo", !!theme.logoDataUrl);
      if (theme.logoDataUrl) {
        brandEl.style.setProperty("--logo-url", `url("${theme.logoDataUrl}")`);
      } else {
        brandEl.style.removeProperty("--logo-url");
      }
    }

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

    document.querySelectorAll(".hero .petal").forEach((el) => {
      el.style.display = s.showHeroFlowers ? "" : "none";
    });

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

    const langMap = { en: s.langEnEnabled, fr: s.langFrEnabled, ar: s.langArEnabled };
    document.querySelectorAll(".lang-switch button").forEach((btn) => {
      btn.style.display = langMap[btn.dataset.lang] === false ? "none" : "";
    });

    const bName = document.getElementById("bankily-name");
    const bNum = document.getElementById("bankily-number");
    if (bName) bName.textContent = s.bankilyName || "—";
    if (bNum) bNum.textContent = s.bankilyNumber || "—";

    const bankilyOpt = document.querySelector('.payment-option input[value="bankily"]');
    const codOpt = document.querySelector('.payment-option input[value="cod"]');
    if (bankilyOpt) bankilyOpt.closest(".payment-option").style.display = s.paymentBankilyEnabled ? "" : "none";
    if (codOpt) codOpt.closest(".payment-option").style.display = s.paymentCodEnabled ? "" : "none";
    if (!s.paymentBankilyEnabled && codOpt && bankilyOpt && bankilyOpt.checked) {
      codOpt.checked = true;
      syncPaymentMethod();
    }

    const email = document.querySelector('a[href^="mailto:"]');
    if (email && s.contactEmail) {
      email.href = `mailto:${s.contactEmail}`;
      email.textContent = s.contactEmail;
    }
    const phoneEl = document.getElementById("contact-phone-value");
    if (phoneEl) phoneEl.textContent = s.contactPhone || "";
    const addrEl = document.querySelector('[data-i18n="contact.addressValue"]');
    if (addrEl && s.contactAddress) addrEl.textContent = s.contactAddress;

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
    return [...set].filter(Boolean);
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

  /* ---------- Search ---------- */
  let _searchTimer = null;
  function bindSearch() {
    const input = document.getElementById("product-search");
    const clear = document.getElementById("product-search-clear");
    if (!input) return;
    input.addEventListener("input", (e) => {
      const v = e.target.value;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        state.search = v;
        if (clear) clear.style.display = v ? "" : "none";
        renderProducts();
      }, 150);
    });
    if (clear) {
      clear.addEventListener("click", () => {
        input.value = "";
        state.search = "";
        clear.style.display = "none";
        renderProducts();
        input.focus();
      });
    }
  }

  /* ---------- Products ---------- */
  function renderProducts() {
    const grid = document.getElementById("product-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const items = products().filter((p) => {
      if (state.category !== "all") {
        const catLbl = p.category[state.lang] || p.category.en;
        if (catLbl !== state.category) return false;
      }
      if (state.search && !matchesSearch(p, state.search)) return false;
      return true;
    });

    const emptyEl = document.getElementById("products-empty");
    if (items.length === 0) {
      if (emptyEl) {
        emptyEl.textContent = state.search ? t("products.noMatch") : t("products.all");
        emptyEl.style.display = "";
      }
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    items.forEach((p) => {
      const card = buildProductCard(p);
      grid.appendChild(card);
    });
  }

  function buildProductCard(p) {
    const card = document.createElement("article");
    card.className = "product-card";
    card.setAttribute("data-id", p.id);

    const imgWrap = document.createElement("div");
    imgWrap.className = "product-img" + ((p.images && p.images.length) ? "" : " placeholder");

    const imgs = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
    if (imgs.length > 0) {
      const img = document.createElement("img");
      img.src = imgs[0];
      img.alt = p.name[state.lang] || p.name.en;
      img.loading = "lazy";
      img.className = "product-img-main";
      imgWrap.appendChild(img);

      if (imgs.length > 1) {
        const badge = document.createElement("div");
        badge.className = "photo-count-badge";
        badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg> ${imgs.length}`;
        imgWrap.appendChild(badge);
      }
    }

    const totalStock = hasVariants(p) ? totalVariantStock(p) : (Number(p.stock) || 0);
    const outOfStock = totalStock <= 0;
    const lowStock = !outOfStock && totalStock <= 3 && !hasVariants(p);
    if (outOfStock) {
      const pill = document.createElement("div");
      pill.className = "stock-pill out";
      pill.textContent = t("products.outOfStock");
      imgWrap.appendChild(pill);
    } else if (lowStock) {
      const pill = document.createElement("div");
      pill.className = "stock-pill low";
      pill.textContent = (t("products.onlyNLeft") || "Only {n} left").replace("{n}", totalStock);
      imgWrap.appendChild(pill);
    }

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
    if (outOfStock) {
      addBtn.disabled = true;
      addBtn.classList.add("disabled");
      addBtn.textContent = t("products.outOfStock");
    } else if (hasVariants(p)) {
      addBtn.textContent = t("products.chooseSize") || "Choose a size";
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openProductModal(p);
      });
    } else {
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
    }
    body.appendChild(addBtn);

    card.appendChild(imgWrap);
    card.appendChild(body);
    card.addEventListener("click", () => openProductModal(p));
    return card;
  }

  /* ---------- Product modal (carousel for multiple images) ---------- */
  function openProductModal(p) {
    const modal = document.getElementById("product-modal");
    const body = modal.querySelector(".modal-body");
    const name = p.name[state.lang] || p.name.en;
    const cat  = p.category[state.lang] || p.category.en;
    const desc = p.description[state.lang] || p.description.en;
    const imgs = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
    const usesVariants = hasVariants(p);
    const totalStock = usesVariants ? totalVariantStock(p) : (Number(p.stock) || 0);
    const outOfStock = totalStock <= 0;
    const lowStock = !outOfStock && !usesVariants && totalStock <= 3;

    let galleryHtml;
    if (imgs.length === 0) {
      galleryHtml = `<div class="modal-img placeholder"></div>`;
    } else if (imgs.length === 1) {
      galleryHtml = `<div class="modal-img"><img src="${escapeAttr(imgs[0])}" alt="${escapeAttr(name)}"></div>`;
    } else {
      const slides = imgs.map((u, i) => `<img class="carousel-slide${i === 0 ? " active" : ""}" src="${escapeAttr(u)}" alt="${escapeAttr(name)} ${i + 1}">`).join("");
      const dots = imgs.map((_, i) => `<button type="button" class="carousel-dot${i === 0 ? " active" : ""}" data-index="${i}" aria-label="${i + 1}"></button>`).join("");
      galleryHtml = `
        <div class="modal-img carousel" data-count="${imgs.length}">
          <div class="carousel-track">${slides}</div>
          <button type="button" class="carousel-arrow prev" aria-label="Previous">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button type="button" class="carousel-arrow next" aria-label="Next">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <div class="carousel-dots">${dots}</div>
        </div>
      `;
    }

    let stockBadgeHtml = "";
    if (outOfStock) {
      stockBadgeHtml = `<div class="modal-stock out">${escapeHtml(t("products.outOfStock"))}</div>`;
    } else if (lowStock) {
      stockBadgeHtml = `<div class="modal-stock low">${escapeHtml((t("products.onlyNLeft") || "Only {n} left").replace("{n}", totalStock))}</div>`;
    }

    let sizePickerHtml = "";
    if (usesVariants && !outOfStock) {
      const sizesAll = SIZE_PRESETS[p.productType] || p.variants.map((v) => v.size);
      const buttons = sizesAll.map((s) => {
        const v = findVariant(p, s);
        const stk = v ? (Number(v.stock) || 0) : 0;
        const unavailable = stk <= 0;
        return `<button type="button" class="size-opt${unavailable ? " unavailable" : ""}" data-size="${escapeAttr(s)}" ${unavailable ? "disabled" : ""}>${escapeHtml(s)}</button>`;
      }).join("");
      sizePickerHtml = `
        <div class="size-picker">
          <div class="size-label">${escapeHtml(t("products.chooseSize") || "Choose a size")}</div>
          <div class="size-options">${buttons}</div>
        </div>`;
    }

    body.innerHTML = `
      ${galleryHtml}
      <div class="modal-content">
        <div class="modal-category">${escapeHtml(cat)}</div>
        <h3>${escapeHtml(name)}</h3>
        <div class="modal-price">${escapeHtml(formatPrice(p.price))}</div>
        ${stockBadgeHtml}
        <p class="modal-desc">${escapeHtml(desc)}</p>
        ${sizePickerHtml}
        <div style="display:flex; gap:.7rem; justify-content:center; margin-top:1.5rem; flex-wrap:wrap;">
          <button class="btn" id="modal-add-btn"${outOfStock || usesVariants ? " disabled" : ""}>${escapeHtml(outOfStock ? t("products.outOfStock") : (usesVariants ? (t("products.chooseSize") || "Choose a size") : t("products.addToCart")))}</button>
          <button class="btn-ghost" id="modal-share-btn" style="display:inline-flex; align-items:center; gap:.4rem;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            ${escapeHtml(t("products.share"))}
          </button>
        </div>
      </div>
    `;

    let selectedSize = "";
    if (usesVariants) {
      body.querySelectorAll(".size-opt").forEach((btn) => {
        btn.addEventListener("click", () => {
          body.querySelectorAll(".size-opt").forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          selectedSize = btn.getAttribute("data-size");
          const addBtn = document.getElementById("modal-add-btn");
          addBtn.disabled = false;
          addBtn.textContent = t("products.addToCart");
        });
      });
    }

    if (!outOfStock) {
      document.getElementById("modal-add-btn").addEventListener("click", () => {
        if (usesVariants && !selectedSize) return;
        addToCart(p.id, 1, selectedSize);
        closeProductModal();
        openDrawer();
      });
    }
    document.getElementById("modal-share-btn").addEventListener("click", () => {
      openShareModal(p);
    });

    if (imgs.length > 1) wireCarousel(body.querySelector(".carousel"), imgs.length);

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function wireCarousel(root, count) {
    if (!root) return;
    let index = 0;
    const slides = root.querySelectorAll(".carousel-slide");
    const dots = root.querySelectorAll(".carousel-dot");

    const goTo = (i) => {
      index = ((i % count) + count) % count;
      slides.forEach((el, j) => el.classList.toggle("active", j === index));
      dots.forEach((el, j) => el.classList.toggle("active", j === index));
    };

    root.querySelector(".carousel-arrow.prev").addEventListener("click", (e) => { e.stopPropagation(); goTo(index - 1); });
    root.querySelector(".carousel-arrow.next").addEventListener("click", (e) => { e.stopPropagation(); goTo(index + 1); });
    dots.forEach((dot) => dot.addEventListener("click", (e) => {
      e.stopPropagation();
      goTo(Number(dot.dataset.index) || 0);
    }));

    // Keyboard navigation
    const keyHandler = (e) => {
      if (!document.getElementById("product-modal").classList.contains("open")) return;
      if (e.key === "ArrowLeft") { goTo(index - 1); }
      else if (e.key === "ArrowRight") { goTo(index + 1); }
    };
    document.addEventListener("keydown", keyHandler);
    root._keyHandler = keyHandler;

    // Touch swipe
    let startX = 0, deltaX = 0, tracking = false;
    root.addEventListener("touchstart", (e) => {
      if (!e.touches[0]) return;
      tracking = true;
      startX = e.touches[0].clientX;
      deltaX = 0;
    }, { passive: true });
    root.addEventListener("touchmove", (e) => {
      if (!tracking || !e.touches[0]) return;
      deltaX = e.touches[0].clientX - startX;
    }, { passive: true });
    root.addEventListener("touchend", () => {
      if (!tracking) return;
      tracking = false;
      if (Math.abs(deltaX) > 40) {
        if (deltaX < 0) goTo(index + 1);
        else goTo(index - 1);
      }
    });
  }

  function closeProductModal() {
    const modal = document.getElementById("product-modal");
    const carousel = modal.querySelector(".carousel");
    if (carousel && carousel._keyHandler) {
      document.removeEventListener("keydown", carousel._keyHandler);
    }
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  /* ---------- Share modal ---------- */
  function buildProductUrl(p) {
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

    const encUrl = encodeURIComponent(url);
    const encText = encodeURIComponent(shareText);
    const encTextWithUrl = encodeURIComponent(`${shareText}\n${url}`);

    const buttons = [
      { cls: "wa", label: t("share.whatsapp"),
        href: `https://wa.me/?text=${encTextWithUrl}`,
        icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.888-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.599 5.351l.241.383-1.001 3.656 3.751-.983.002-.106z"/></svg>` },
      { cls: "fb", label: t("share.facebook"),
        href: `https://www.facebook.com/sharer/sharer.php?u=${encUrl}&quote=${encText}`,
        icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.3-1.5 1.6-1.5h1.7V3.7c-.3 0-1.3-.1-2.5-.1-2.4 0-4.1 1.5-4.1 4.2v2.1H7.5V13h2.7v8h3.3z"/></svg>` },
      { cls: "tw", label: t("share.twitter"),
        href: `https://twitter.com/intent/tweet?text=${encText}&url=${encUrl}`,
        icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>` },
      { cls: "tg", label: t("share.telegram"),
        href: `https://t.me/share/url?url=${encUrl}&text=${encText}`,
        icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>` },
      { cls: "em", label: t("share.email"),
        href: `mailto:?subject=${encodeURIComponent(name)}&body=${encTextWithUrl}`,
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3,7 12,13 21,7"/></svg>` }
    ];

    if (navigator.share) {
      buttons.push({
        cls: "nt", label: t("share.nativeShare"), native: true,
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

    document.getElementById("share-link-input").value = url;
    const copyBtn = document.getElementById("share-copy-btn");
    copyBtn.classList.remove("copied");
    copyBtn.textContent = t("share.copyLink");

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

  /* ---------- Customer order lookup ---------- */
  function normalizePhone(p) {
    return String(p || "").replace(/[\s\-().]/g, "");
  }
  function showLookupPane(pane) {
    const form   = document.getElementById("order-lookup-form");
    const list   = document.getElementById("order-lookup-list");
    const result = document.getElementById("order-lookup-result");
    if (form)   form.style.display   = pane === "form"   ? "" : "none";
    if (list)   list.style.display   = pane === "list"   ? "" : "none";
    if (result) result.style.display = pane === "result" ? "" : "none";
  }
  function openOrderLookup() {
    const m = document.getElementById("order-lookup-modal");
    const form = document.getElementById("order-lookup-form");
    const err = document.getElementById("lookup-error");
    if (form) form.reset();
    if (err) { err.style.display = "none"; err.textContent = ""; }
    showLookupPane("form");
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeOrderLookup() {
    const m = document.getElementById("order-lookup-modal");
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    state.lookupOrders = [];
    state.lookupPhone = "";
    state.lookupOrderId = "";
  }

  const STATUS_LABELS = {
    awaiting_verification: "orderLookup.status.awaiting",
    pending:               "orderLookup.status.pending",
    accepted:              "orderLookup.status.accepted",
    shipped:               "orderLookup.status.shipped",
    completed:             "orderLookup.status.completed",
    cancelled:             "orderLookup.status.cancelled"
  };
  const CANCELLABLE_STATUSES = new Set(["awaiting_verification", "pending"]);

  function renderLookupResult(order) {
    document.getElementById("lookup-result-id").textContent = order.id || "—";
    const created = order.createdAt ? new Date(order.createdAt) : null;
    document.getElementById("lookup-result-date").textContent =
      created ? created.toLocaleString(state.lang) : "";
    const statusEl = document.getElementById("lookup-result-status");
    const statusKey = STATUS_LABELS[order.status] || ("orderLookup.status." + (order.status || "unknown"));
    statusEl.textContent = t(statusKey) || order.status || "";
    statusEl.className = "lookup-status status-" + (order.status || "unknown");

    const currency = (order.currency || (settings().currency) || "");
    const itemsEl = document.getElementById("lookup-result-items");
    const items = Array.isArray(order.items) ? order.items : [];
    itemsEl.innerHTML = items.map((i) => {
      const nm = (i.nameTranslations && (i.nameTranslations[state.lang] || i.nameTranslations.en)) || i.name || "";
      const suffix = i.size ? ` (${escapeHtml(i.size)})` : "";
      const line = (Number(i.price) || 0) * (Number(i.qty) || 0);
      return `<li>
        <span>${escapeHtml(nm)}${suffix} <span class="q">×${Number(i.qty) || 0}</span></span>
        <span>${escapeHtml(formatPrice(line, currency))}</span>
      </li>`;
    }).join("");

    document.getElementById("lookup-result-total").textContent =
      formatPrice(Number(order.total) || 0, currency);

    const cancelBtn = document.getElementById("lookup-cancel-btn");
    const cannotEl = document.getElementById("lookup-cannot-cancel");
    if (CANCELLABLE_STATUSES.has(order.status)) {
      cancelBtn.style.display = "";
      cancelBtn.disabled = false;
      cancelBtn.dataset.orderId = order.id;
      cannotEl.style.display = "none";
    } else {
      cancelBtn.style.display = "none";
      cannotEl.style.display = "";
    }
  }

  function renderLookupList(orders) {
    const listEl = document.getElementById("lookup-list-items");
    const currency = settings().currency || "";
    if (!orders || orders.length === 0) {
      listEl.innerHTML = `<li class="lookup-empty">${escapeHtml(t("orderLookup.noOrders") || "No orders found for that phone number.")}</li>`;
      return;
    }
    listEl.innerHTML = orders.map((o, idx) => {
      const statusKey = STATUS_LABELS[o.status] || ("orderLookup.status." + (o.status || "unknown"));
      const statusLabel = t(statusKey) || o.status || "";
      const created = o.createdAt ? new Date(o.createdAt).toLocaleDateString(state.lang) : "";
      const total = formatPrice(Number(o.total) || 0, o.currency || currency);
      return `<li>
        <button type="button" class="lookup-order-btn" data-idx="${idx}">
          <span class="lookup-order-main">
            <span class="lookup-id">${escapeHtml(o.id)}</span>
            <span class="lookup-date">${escapeHtml(created)}</span>
          </span>
          <span class="lookup-order-meta">
            <span class="lookup-status status-${escapeHtml(o.status || "unknown")}">${escapeHtml(statusLabel)}</span>
            <span class="lookup-order-total">${escapeHtml(total)}</span>
          </span>
        </button>
      </li>`;
    }).join("");
  }

  async function lookupOrderHandler(ev) {
    ev.preventDefault();
    const form = ev.target;
    const fd = new FormData(form);
    const phone = normalizePhone(fd.get("phone") || "");
    const err = document.getElementById("lookup-error");
    err.style.display = "none";
    err.textContent = "";

    if (!phone) return;

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.prev = submitBtn.textContent; submitBtn.textContent = "…"; }

    try {
      const orders = await Storage.lookupOrdersForCustomer(phone);
      state.lookupPhone = phone;
      state.lookupOrders = Array.isArray(orders) ? orders : [];
      if (state.lookupOrders.length === 0) {
        err.textContent = t("orderLookup.notFound") || "No orders found for that phone number.";
        err.style.display = "";
      } else if (state.lookupOrders.length === 1) {
        state.lookupOrderId = state.lookupOrders[0].id;
        renderLookupResult(state.lookupOrders[0]);
        showLookupPane("result");
      } else {
        renderLookupList(state.lookupOrders);
        showLookupPane("list");
      }
    } catch (e) {
      err.textContent = t("orderLookup.error") || "Could not look up orders. Please try again.";
      err.style.display = "";
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.prev || t("orderLookup.find"); }
    }
  }

  function selectLookupOrder(idx) {
    const order = (state.lookupOrders || [])[idx];
    if (!order) return;
    state.lookupOrderId = order.id;
    renderLookupResult(order);
    showLookupPane("result");
  }

  async function cancelLookupOrder() {
    const btn = document.getElementById("lookup-cancel-btn");
    const orderId = state.lookupOrderId || btn.dataset.orderId;
    const phone = state.lookupPhone;
    if (!orderId || !phone) return;
    const confirmMsg = t("orderLookup.cancelConfirm") || "Cancel this order? This cannot be undone.";
    if (!window.confirm(confirmMsg)) return;
    btn.disabled = true;
    try {
      await Storage.cancelOrderForCustomer(orderId, phone);
      toast(t("orderLookup.cancelSuccess") || "Your order has been cancelled.");
      const refreshed = await Storage.lookupOrdersForCustomer(phone);
      state.lookupOrders = Array.isArray(refreshed) ? refreshed : [];
      const updated = state.lookupOrders.find((o) => o.id === orderId);
      if (updated) renderLookupResult(updated);
    } catch (e) {
      const code = (e && e.message) || "cancel_failed";
      const msg = code === "cannot_cancel"
        ? (t("orderLookup.cannotCancel") || "This order can no longer be cancelled.")
        : (t("orderLookup.error") || "Could not cancel order. Please try again.");
      toast(msg);
      btn.disabled = false;
    }
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
  // Cart items carry a snapshot: {id, name, image, price, qty}
  function snapshotProduct(p, qty, size) {
    return {
      id: p.id,
      size: size || "",
      name: p.name.en || "",
      nameTranslations: p.name,
      image: (p.images && p.images[0]) || p.image || "",
      price: Number(p.price) || 0,
      qty
    };
  }

  function cartKey(item) {
    return item.size ? item.id + "::" + item.size : item.id;
  }
  function findCartItem(productId, size) {
    const s = size || "";
    return state.cart.find((c) => c.id === productId && (c.size || "") === s);
  }
  function availableStock(p, size) {
    if (hasVariants(p)) {
      const v = findVariant(p, size);
      return v ? (Number(v.stock) || 0) : 0;
    }
    return Number(p && p.stock) || 0;
  }

  function addToCart(productId, qty = 1, size = "") {
    const p = products().find((x) => x.id === productId);
    if (!p) return;
    if (hasVariants(p) && !size) {
      toast(t("products.chooseSize") || "Please choose a size");
      return;
    }
    const stock = availableStock(p, size);
    if (stock <= 0) {
      toast(t("products.outOfStock"));
      return;
    }
    const existing = findCartItem(productId, size);
    const currentQty = existing ? existing.qty : 0;
    if (currentQty + qty > stock) {
      toast((t("cart.stockLimit") || "Only {n} available").replace("{n}", stock));
      return;
    }
    if (existing) {
      existing.qty += qty;
      existing.name = p.name.en || "";
      existing.nameTranslations = p.name;
      existing.image = (p.images && p.images[0]) || p.image || "";
      existing.price = Number(p.price) || 0;
    } else {
      state.cart.push(snapshotProduct(p, qty, size));
    }
    Storage.saveCart(state.cart);
    updateCartBadge();
    renderCart();
  }
  function removeFromCart(key) {
    state.cart = state.cart.filter((c) => cartKey(c) !== key);
    Storage.saveCart(state.cart);
    updateCartBadge();
    renderCart();
  }
  function setQty(key, qty) {
    const item = state.cart.find((c) => cartKey(c) === key);
    if (!item) return;
    const p = products().find((x) => x.id === item.id);
    const stock = p ? availableStock(p, item.size) : 0;
    const target = Math.max(1, qty);
    if (p && target > stock) {
      toast((t("cart.stockLimit") || "Only {n} available").replace("{n}", stock));
      item.qty = Math.max(1, Math.min(target, stock));
    } else {
      item.qty = target;
    }
    Storage.saveCart(state.cart);
    updateCartBadge();
    renderCart();
  }
  function cartTotalCount() {
    return state.cart.reduce((sum, i) => sum + i.qty, 0);
  }
  function cartTotal() {
    // Prefer live product price (in case admin changed it), fall back to snapshot
    const map = Object.fromEntries(products().map((p) => [p.id, p]));
    return state.cart.reduce((sum, i) => {
      const p = map[i.id];
      const price = p ? (Number(p.price) || 0) : (Number(i.price) || 0);
      return sum + price * i.qty;
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

    // Keep only items whose product still exists
    state.cart = state.cart.filter((i) => map[i.id]);
    Storage.saveCart(state.cart);

    const items = state.cart;

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
      const name = (p && (p.name[state.lang] || p.name.en)) || i.name || "";
      const price = p ? (Number(p.price) || 0) : (Number(i.price) || 0);
      const img = (p && ((p.images && p.images[0]) || p.image)) || i.image || "";
      const lineTotal = price * i.qty;
      const stock = p ? availableStock(p, i.size) : 0;
      const imgHtml = img
        ? `<img src="${escapeAttr(img)}" alt="${escapeAttr(name)}">`
        : `🌸`;
      const stockWarn = (p && stock < i.qty)
        ? `<div class="cart-item-stockwarn">${escapeHtml((t("cart.stockConflict") || "Only {n} available").replace("{n}", stock))}</div>`
        : "";
      const sizeLabel = i.size
        ? `<div class="cart-item-size">${escapeHtml((t("products.size") || "Size") + ": " + i.size)}</div>`
        : "";
      return `
        <div class="cart-item" data-key="${escapeAttr(cartKey(i))}">
          <div class="cart-item-img">${imgHtml}</div>
          <div>
            <div class="cart-item-name">${escapeHtml(name)}</div>
            ${sizeLabel}
            <div class="cart-item-price">${escapeHtml(formatPrice(price))}</div>
            ${stockWarn}
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

    body.querySelectorAll(".cart-item").forEach((row) => {
      const key = row.getAttribute("data-key");
      const item = state.cart.find((c) => cartKey(c) === key);
      if (!item) return;
      row.querySelector('[data-action="dec"]').addEventListener("click", () => setQty(key, item.qty - 1));
      row.querySelector('[data-action="inc"]').addEventListener("click", () => setQty(key, item.qty + 1));
      row.querySelector('[data-action="remove"]').addEventListener("click", () => removeFromCart(key));
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
      const name = (p && (p.name[state.lang] || p.name.en)) || i.name || "";
      const price = p ? (Number(p.price) || 0) : (Number(i.price) || 0);
      const line = price * i.qty;
      const suffix = i.size ? ` (${escapeHtml(i.size)})` : "";
      return `<li><span>${escapeHtml(name)}${suffix} × ${i.qty}</span><span>${escapeHtml(formatPrice(line))}</span></li>`;
    }).join("");
    document.getElementById("checkout-total").textContent = formatPrice(cartTotal());

    const form = document.getElementById("checkout-form");
    form.reset();
    if (state.proofPreviewUrl) {
      URL.revokeObjectURL(state.proofPreviewUrl);
    }
    state.proofFile = null;
    state.proofPreviewUrl = "";
    const preview = document.getElementById("proof-preview");
    preview.classList.remove("show");
    preview.removeAttribute("src");
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

  function handleProofChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (state.proofPreviewUrl) URL.revokeObjectURL(state.proofPreviewUrl);
    state.proofFile = file;
    state.proofPreviewUrl = URL.createObjectURL(file);
    const preview = document.getElementById("proof-preview");
    preview.src = state.proofPreviewUrl;
    preview.classList.add("show");
    const upload = document.getElementById("proof-upload");
    upload.classList.add("has-file");
    document.getElementById("proof-upload-text").textContent = file.name;
  }

  async function submitOrder(ev) {
    ev.preventDefault();
    const form = ev.target;
    const fd = new FormData(form);
    const payment = fd.get("payment");
    const name = (fd.get("name") || "").toString().trim();
    const phone = (fd.get("phone") || "").toString().trim();
    const email = (fd.get("email") || "").toString().trim().toLowerCase();
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
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const input = form.querySelector('[name="email"]');
      if (input) input.closest(".field").classList.add("error");
      valid = false;
    }
    if (payment === "bankily" && !state.proofFile) {
      const upload = document.getElementById("proof-upload");
      upload.closest(".field").classList.add("error");
      valid = false;
    }
    if (!valid) return;

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.prev = submitBtn.textContent; submitBtn.textContent = "…"; }

    // Latest products for stock + snapshot
    await Storage.getProducts();
    const live = Object.fromEntries(products().map((p) => [p.id, p]));

    // Filter out deleted products, refresh snapshot
    state.cart = state.cart.filter((i) => live[i.id]);

    if (state.cart.length === 0) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.prev || t("checkout.placeOrder"); }
      toast(t("cart.empty"));
      closeCheckout();
      return;
    }

    // Re-check stock before attempting decrement
    for (const i of state.cart) {
      const stock = availableStock(live[i.id], i.size);
      if (i.qty > stock) {
        toast((t("cart.stockConflict") || "Only {n} available").replace("{n}", stock));
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.prev || t("checkout.placeOrder"); }
        renderCart();
        return;
      }
    }

    const orderItems = state.cart.map((i) => {
      const p = live[i.id];
      return {
        id: p.id,
        size: i.size || "",
        name: p.name.en || i.name || "",
        nameTranslations: p.name,
        image: (p.images && p.images[0]) || p.image || "",
        price: Number(p.price) || 0,
        qty: i.qty,
        lineTotal: (Number(p.price) || 0) * i.qty
      };
    });

    const total = orderItems.reduce((s, i) => s + i.lineTotal, 0);

    // Upload the proof FIRST (if needed) to avoid creating an order with no proof
    let proofPath = "";
    if (payment === "bankily" && state.proofFile) {
      try {
        proofPath = await Storage.uploadImage("proofs", state.proofFile);
      } catch (err) {
        console.error("proof upload failed", err);
        toast(t("checkout.proofHelp") || "Proof upload failed");
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.prev || t("checkout.placeOrder"); }
        return;
      }
    }

    const order = {
      id: makeOrderId(),
      createdAt: new Date().toISOString(),
      customer: { name, phone, email, address, notes },
      payment: { method: payment, proofPath: proofPath || "" },
      items: orderItems,
      total,
      currency: settings().currency,
      status: payment === "bankily" ? "awaiting_verification" : "pending",
      lang: state.lang
    };

    // Atomically decrement stock BEFORE writing the order
    try {
      await Storage.decrementStock(orderItems.map((i) => ({ id: i.id, qty: i.qty, size: i.size || "" })));
    } catch (err) {
      console.error("decrement failed", err);
      // Clean up the uploaded proof if we won't use it
      if (proofPath) {
        try { await Storage.deleteImage("proofs", proofPath); } catch (e) { /* ignore */ }
      }
      const pid = err && err.productId;
      const available = err && err.available != null ? err.available : 0;
      const p = pid ? live[pid] : null;
      const nm = p ? (p.name[state.lang] || p.name.en) : "";
      const msg = (t("cart.stockConflict") || "Only {n} available").replace("{n}", available);
      toast(msg + (nm ? ` — ${nm}` : ""));
      await Storage.getProducts();
      renderProducts();
      renderCart();
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.prev || t("checkout.placeOrder"); }
      return;
    }

    // Now write the order. If this fails we attempt to restock.
    try {
      await Storage.addOrder(order);
    } catch (err) {
      console.error("addOrder failed", err);
      try {
        await Storage.restockItems(orderItems.map((i) => ({ id: i.id, qty: i.qty, size: i.size || "" })));
      } catch (e) { /* ignore */ }
      if (proofPath) {
        try { await Storage.deleteImage("proofs", proofPath); } catch (e) { /* ignore */ }
      }
      toast("Could not submit order. Please try again.");
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.prev || t("checkout.placeOrder"); }
      return;
    }

    Storage.clearCart();
    state.cart = [];
    state.proofFile = null;
    if (state.proofPreviewUrl) { URL.revokeObjectURL(state.proofPreviewUrl); state.proofPreviewUrl = ""; }
    updateCartBadge();
    renderCart();
    closeCheckout();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.prev || t("checkout.placeOrder"); }
    showConfirmation(order);
  }

  function showConfirmation(order) {
    document.getElementById("confirm-order-id").textContent = order.id;
    const statusText = document.getElementById("confirm-status-text");
    statusText.textContent = order.payment.method === "bankily"
      ? t("confirm.pendingBankily")
      : t("confirm.pendingCod");

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
      ...order.items.map((i) => `• ${(i.nameTranslations && i.nameTranslations[order.lang]) || i.name}${i.size ? ` (${i.size})` : ""} × ${i.qty} — ${formatPrice(i.lineTotal)}`),
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

  /* ---------- Toast ---------- */
  let _toastTimer = null;
  function toast(msg) {
    let el = document.getElementById("site-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "site-toast";
      el.className = "site-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  /* ---------- Utils ---------- */
  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ---------- Realtime wiring ---------- */
  function subscribeAll() {
    state.channels.push(
      Storage.subscribeTable("products", async () => {
        await Storage.getProducts();
        renderCategoryFilter();
        renderProducts();
        renderCart();
      }),
      Storage.subscribeTable("settings", async () => {
        await Storage.getSettings();
        syncSettingsToUi();
      }),
      Storage.subscribeTable("content", async () => {
        await Storage.getContent();
        applyLanguage(state.lang);
      }),
      Storage.subscribeTable("theme", async () => {
        await applyTheme();
        syncSettingsToUi();
      })
    );
  }
  function unsubscribeAll() {
    state.channels.forEach((ch) => {
      try { sb.removeChannel(ch); } catch (e) { /* ignore */ }
    });
    state.channels = [];
  }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    // Language buttons
    document.querySelectorAll(".lang-switch button").forEach((btn) => {
      btn.addEventListener("click", () => applyLanguage(btn.dataset.lang));
    });

    // Modal / drawer close buttons
    document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", closeProductModal));
    document.querySelectorAll("[data-close-drawer]").forEach((el) => el.addEventListener("click", closeDrawer));
    document.querySelectorAll("[data-close-checkout]").forEach((el) => el.addEventListener("click", closeCheckout));
    document.querySelectorAll("[data-close-confirm]").forEach((el) => el.addEventListener("click", closeConfirm));
    document.querySelectorAll("[data-close-share]").forEach((el) => el.addEventListener("click", closeShareModal));
    document.querySelectorAll("[data-close-lookup]").forEach((el) => el.addEventListener("click", closeOrderLookup));
    const shareCopyBtn = document.getElementById("share-copy-btn");
    if (shareCopyBtn) shareCopyBtn.addEventListener("click", copyShareLink);

    // Order lookup
    const myOrderBtn = document.getElementById("my-order-button");
    if (myOrderBtn) myOrderBtn.addEventListener("click", openOrderLookup);
    const lookupForm = document.getElementById("order-lookup-form");
    if (lookupForm) lookupForm.addEventListener("submit", lookupOrderHandler);
    const lookupBackBtn = document.getElementById("lookup-back-btn");
    if (lookupBackBtn) lookupBackBtn.addEventListener("click", () => {
      if ((state.lookupOrders || []).length > 1) showLookupPane("list");
      else showLookupPane("form");
    });
    const lookupListBackBtn = document.getElementById("lookup-list-back-btn");
    if (lookupListBackBtn) lookupListBackBtn.addEventListener("click", () => showLookupPane("form"));
    const lookupListItems = document.getElementById("lookup-list-items");
    if (lookupListItems) lookupListItems.addEventListener("click", (e) => {
      const btn = e.target.closest(".lookup-order-btn");
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      if (Number.isInteger(idx)) selectLookupOrder(idx);
    });
    const lookupCancelBtn = document.getElementById("lookup-cancel-btn");
    if (lookupCancelBtn) lookupCancelBtn.addEventListener("click", cancelLookupOrder);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeProductModal(); closeDrawer(); closeCheckout(); closeConfirm(); closeShareModal(); closeOrderLookup();
      }
    });

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
    const proofInput = document.querySelector('#proof-upload input[type="file"]');
    if (proofInput) proofInput.addEventListener("change", handleProofChange);
    document.getElementById("checkout-form").addEventListener("submit", submitOrder);

    // Search
    bindSearch();

    // Year
    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Load data from Supabase, then render
    try {
      await Storage.init();
    } catch (e) {
      console.error("Storage.init failed", e);
    }

    await applyTheme();
    applyLanguage(state.lang);
    updateCartBadge();
    openFromHash();

    // Realtime subscriptions
    subscribeAll();
    window.addEventListener("beforeunload", unsubscribeAll);
  });
})();
