/* =========================================================
   ADMIN-APP.JS — lógica del panel privado
   ========================================================= */

/* Campos editables por sección. "html:true" permite usar
   algunas etiquetas simples (<em>, <strong>, <br>) porque se
   inyectan con innerHTML en el sitio público. */
const SECTION_FIELD_DEFS = {
  hero: [
    { key: "eyebrow", label: "Etiqueta superior", type: "text", placeholder: "Counselor · Espacio de escucha" },
    { key: "title", label: "Título principal", type: "textarea", html: true, hint: "Podés usar <br> para salto de línea y <em>texto</em> para cursiva.", placeholder: "Un espacio<br>para <em>encontrarte</em>." },
    { key: "lead", label: "Bajada", type: "textarea", placeholder: "Soy Mabel Mereles. Acompaño procesos de counseling con un enfoque humanista..." },
    { key: "portrait_caption", label: "Texto bajo la foto", type: "text", placeholder: "Buenos Aires · Sesiones online" },
  ],
  about: [
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Un espacio para escucharte, comprenderte y acompañarte." },
    { key: "intro", label: "Párrafo introductorio", type: "textarea", html: true, hint: "Podés usar <strong>texto</strong> para negrita.", placeholder: "Soy <strong>Mabel Mereles</strong>, Counselor egresada de <strong>Holos Capital</strong>..." },
  ],
  approach: [{ key: "title", label: "Título de la sección", type: "text", placeholder: "Cómo trabajamos juntos" }],
  ebooks: [{ key: "title", label: "Título de la sección", type: "text", placeholder: "Ebooks para tu proceso" }],
  testimonials: [{ key: "title", label: "Título de la sección", type: "text", placeholder: "Lo que cuentan quienes pasaron por acá" }],
  faq: [{ key: "title", label: "Título de la sección", type: "text", placeholder: "Sobre el counseling" }],
  contact: [
    { key: "title", label: "Título de la sección", type: "text", placeholder: "Demos el primer paso" },
    { key: "lead", label: "Bajada", type: "textarea", placeholder: "Escribime y coordinamos una primera charla sin compromiso..." },
  ],
};

let sectionsState = [];
let ebooksState = [];
let dragSourceIndex = null;

/* ---------------------------------------------------------
   ARRANQUE
   --------------------------------------------------------- */
(async function initAdmin() {
  const session = await guardAdminPage();
  if (!session) return; // guardAdminPage ya redirige a login.html

  document.getElementById("admin-gate").hidden = true;
  document.getElementById("admin-app").hidden = false;

  wireLogoutButton(document.getElementById("logout-btn"));
  wireTabs();
  wireSectionsPanel();
  wireEbooksPanel();
  wireCouponsPanel();

  await Promise.all([loadSections(), loadEbooks(), loadMessages()]);
  await loadCoupons(); // depende de ebooksState, por eso va después
  await loadMetrics(); // también depende de ebooksState (descargas por ebook)
  await loadSales();

  subscribeSalesRealtime();
})();

/* ---------------------------------------------------------
   TABS
   --------------------------------------------------------- */
function wireTabs() {
  const tabs = document.querySelectorAll(".admin-tab");
  const menu = document.getElementById("admin-menu");
  const toggle = document.getElementById("admin-nav-toggle");
  const validTabs = Array.from(tabs).map((t) => t.dataset.tab);

  function activateTab(tabName, updateHash) {
    const name = validTabs.includes(tabName) ? tabName : validTabs[0];
    tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
    document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("is-active"));
    document.getElementById(`panel-${name}`).classList.add("is-active");
    if (updateHash) history.replaceState(null, "", `#${name}`);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activateTab(tab.dataset.tab, true);
      closeMobileMenu();
      if (tab.dataset.tab === "sales" && typeof hideSalesBadge === "function") hideSalesBadge();
    });
  });

  function closeMobileMenu() {
    if (!menu) return;
    menu.classList.remove("open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
    document.addEventListener("click", (e) => {
      if (menu.classList.contains("open") && !menu.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) {
        closeMobileMenu();
      }
    });
  }

  // al cargar (o refrescar): respeta la pestaña que estaba abierta,
  // guardada en el hash de la URL (#ebooks, #coupons, etc.)
  activateTab(window.location.hash.replace("#", ""), false);
}

function showStatus(el, message, isError) {
  el.textContent = message;
  el.hidden = false;
  el.classList.toggle("is-error", !!isError);
  if (!isError) setTimeout(() => (el.hidden = true), 3200);
}

/* ---------------------------------------------------------
   SECCIONES
   --------------------------------------------------------- */
async function loadSections() {
  const raw = await fetchAllSectionsAdmin();
  // aseguramos que estén las 6 secciones aunque la tabla esté vacía o incompleta
  sectionsState = DEFAULT_SECTIONS.map((def) => {
    const found = raw.find((r) => r.key === def.key);
    return found ? { ...def, ...found, content: found.content || {} } : { ...def };
  }).sort((a, b) => a.position - b.position);
  renderSections();
}

function renderSections() {
  const list = document.getElementById("section-list");
  list.innerHTML = "";

  sectionsState.forEach((section, index) => {
    const li = document.createElement("li");
    li.className = "section-card" + (section.visible === false ? " is-hidden-section" : "");
    li.draggable = true;
    li.dataset.index = String(index);

    const fields = SECTION_FIELD_DEFS[section.key] || [];
    const fieldsHtml = fields
      .map((f) => {
        const value = section.content?.[f.key] || "";
        const inputHtml =
          f.type === "textarea"
            ? `<textarea data-field-key="${f.key}" rows="2" placeholder="${escapeAttr(f.placeholder)}">${escapeHtml(value)}</textarea>`
            : `<input type="text" data-field-key="${f.key}" value="${escapeAttr(value)}" placeholder="${escapeAttr(f.placeholder)}">`;
        return `<label>
          <span>${f.label}</span>
          ${inputHtml}
          ${f.hint ? `<span class="field-hint">${f.hint}</span>` : ""}
        </label>`;
      })
      .join("");

    li.innerHTML = `
      <div class="section-card-head">
        <span class="drag-handle" aria-hidden="true">⠿</span>
        <div class="section-card-title">
          <strong>${section.title}</strong>
          <span>${section.visible === false ? "Oculta en la web" : "Visible en la web"}</span>
        </div>
        <div class="section-card-actions">
          <button type="button" class="link-btn" data-action="toggle-edit">Editar textos</button>
          <label class="toggle">
            <input type="checkbox" data-action="toggle-visible" ${section.visible !== false ? "checked" : ""}>
            <span class="toggle-track"></span>
          </label>
        </div>
      </div>
      <div class="section-fields">${fieldsHtml || "<p class=\"field-hint\">Esta sección todavía no tiene textos editables.</p>"}</div>
    `;

    // drag & drop
    li.addEventListener("dragstart", () => {
      dragSourceIndex = index;
      li.classList.add("is-dragging");
    });
    li.addEventListener("dragend", () => li.classList.remove("is-dragging"));
    li.addEventListener("dragover", (e) => e.preventDefault());
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragSourceIndex === null || dragSourceIndex === index) return;
      const moved = sectionsState.splice(dragSourceIndex, 1)[0];
      sectionsState.splice(index, 0, moved);
      dragSourceIndex = null;
      renderSections();
    });

    // visibilidad
    li.querySelector('[data-action="toggle-visible"]').addEventListener("change", (e) => {
      sectionsState[index].visible = e.target.checked;
      li.classList.toggle("is-hidden-section", !e.target.checked);
      li.querySelector(".section-card-title span").textContent = e.target.checked ? "Visible en la web" : "Oculta en la web";
    });

    // expandir edición de textos
    const fieldsEl = li.querySelector(".section-fields");
    li.querySelector('[data-action="toggle-edit"]').addEventListener("click", () => {
      fieldsEl.classList.toggle("is-open");
    });

    // guardar cambios de texto en el estado en memoria
    fieldsEl.querySelectorAll("[data-field-key]").forEach((input) => {
      input.addEventListener("input", () => {
        if (!sectionsState[index].content) sectionsState[index].content = {};
        sectionsState[index].content[input.dataset.fieldKey] = input.value;
      });
    });

    list.appendChild(li);
  });
}

function wireSectionsPanel() {
  document.getElementById("save-sections-btn").addEventListener("click", async () => {
    const btn = document.getElementById("save-sections-btn");
    const status = document.getElementById("sections-status");
    btn.disabled = true;
    btn.textContent = "Guardando...";

    const result = await saveSectionsLayout(sectionsState);

    btn.disabled = false;
    btn.textContent = "Guardar cambios";

    if (result.ok) {
      showStatus(status, "Cambios guardados. Ya se ven en la web.", false);
    } else {
      showStatus(status, "No se pudo guardar: " + result.reason, true);
    }
  });
}

/* ---------------------------------------------------------
   EBOOKS
   --------------------------------------------------------- */
/** Convierte un título en un slug de URL: "¿Cómo poner límites?" -> "como_poner_limites" */
function slugify(text) {
  return (text || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Achica y recomprime una imagen del lado del navegador antes de
 * subirla (máx. 900px de lado más largo, JPEG calidad 82%). Evita
 * subir fotos de varios MB tal cual, que encarecen el storage y
 * hacen la web más lenta. Si algo falla, devuelve el archivo original.
 */
function compressImage(file, maxDimension = 900, quality = 0.82) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) return resolve(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

function wireEbooksPanel() {
  const form = document.getElementById("ebook-form");
  const newBtn = document.getElementById("new-ebook-btn");
  const cancelBtn = document.getElementById("cancel-ebook-btn");

  newBtn.addEventListener("click", () => openEbookForm(null));
  cancelBtn.addEventListener("click", () => closeEbookForm());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitEbookForm();
  });
}

function openEbookForm(ebook) {
  const form = document.getElementById("ebook-form");
  form.hidden = false;
  document.getElementById("ebook-form-title").textContent = ebook ? "Editar ebook" : "Nuevo ebook";

  document.getElementById("ebook-id").value = ebook?.id || "";
  document.getElementById("ebook-title").value = ebook?.title || "";
  document.getElementById("ebook-price").value = ebook?.price || 0;
  document.getElementById("ebook-description").value = ebook?.description || "";
  document.getElementById("ebook-long-description").value = ebook?.long_description || "";
  document.getElementById("ebook-keywords").value = ebook?.keywords || "";
  document.getElementById("ebook-published").checked = ebook ? ebook.is_published !== false : true;
  document.getElementById("ebook-show-downloads").checked = ebook ? !!ebook.show_downloads : false;
  document.getElementById("ebook-cover").value = "";
  document.getElementById("ebook-file").value = "";
  document.getElementById("ebook-drive-url").value = ebook?.drive_url || "";
  document.getElementById("save-ebook-btn").textContent = ebook ? "Guardar cambios" : "Guardar ebook";

  updateSlugPreview(ebook?.slug || null);

  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Muestra qué URL va a tener (o ya tiene) la página propia del ebook. */
function updateSlugPreview(existingSlug) {
  const titleInput = document.getElementById("ebook-title");
  const descInput = document.getElementById("ebook-description");
  const slugPreview = document.getElementById("ebook-slug-preview");
  const seoUrl = document.getElementById("seo-preview-url");
  const seoTitle = document.getElementById("seo-preview-title");
  const seoDesc = document.getElementById("seo-preview-desc");

  const currentSlug = () => existingSlug || slugify(titleInput.value) || "titulo-del-ebook";

  const render = () => {
    const slug = currentSlug();
    slugPreview.textContent = existingSlug
      ? `Página de este ebook: merelesmabel.com/${slug} (no cambia aunque edites el título)`
      : `Se va a publicar en: merelesmabel.com/${slug}`;

    const t = titleInput.value.trim() || "Título del ebook";
    const d = descInput.value.trim() || "Acá va a aparecer la descripción breve que cargues arriba.";
    seoUrl.textContent = `merelesmabel.com › ${slug}`;
    seoTitle.textContent = t.length > 60 ? t.slice(0, 57) + "…" : t;
    seoDesc.textContent = d.length > 160 ? d.slice(0, 157) + "…" : d;
  };

  render();
  titleInput.oninput = render;
  descInput.oninput = render;
}

function closeEbookForm() {
  document.getElementById("ebook-form").hidden = true;
  document.getElementById("ebook-form").reset();
}

async function submitEbookForm() {
  const status = document.getElementById("ebook-form-status");
  const saveBtn = document.getElementById("save-ebook-btn");
  const id = document.getElementById("ebook-id").value || null;
  const title = document.getElementById("ebook-title").value.trim();
  const price = parseFloat(document.getElementById("ebook-price").value) || 0;
  const description = document.getElementById("ebook-description").value.trim();
  const long_description = document.getElementById("ebook-long-description").value.trim();
  const keywords = document.getElementById("ebook-keywords").value.trim();
  const is_published = document.getElementById("ebook-published").checked;
  const show_downloads = document.getElementById("ebook-show-downloads").checked;
  const coverFile = document.getElementById("ebook-cover").files[0];
  const bookFile = document.getElementById("ebook-file").files[0];
  const driveUrl = document.getElementById("ebook-drive-url").value.trim();

  if (!title) {
    showStatus(status, "Falta el título.", true);
    return;
  }

  const existing = id ? ebooksState.find((e) => e.id === id) : null;
  const isPaid = price > 0;

  if (isPaid && !driveUrl && !existing?.drive_url) {
    showStatus(status, "Es un ebook pago: falta el link privado de Google Drive.", true);
    return;
  }
  if (!isPaid && !bookFile && !existing?.file_url) {
    showStatus(status, "Es un ebook gratis: falta subir el archivo PDF/EPUB.", true);
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Guardando...";

  const patch = { title, price, description, long_description, keywords, is_published, show_downloads };
  if (driveUrl) patch.drive_url = driveUrl;
  if (!existing?.slug) patch.slug = slugify(title);

  if (coverFile) {
    saveBtn.textContent = "Optimizando portada...";
    const optimizedCover = await compressImage(coverFile);
    saveBtn.textContent = "Guardando...";

    const up = await uploadEbookFile(optimizedCover, "covers");
    if (!up.ok) {
      showStatus(status, "No se pudo subir la portada: " + up.reason, true);
      saveBtn.disabled = false;
      saveBtn.textContent = "Guardar ebook";
      return;
    }
    patch.cover_url = up.url;
    patch.cover_path = up.path;
  }

  if (bookFile) {
    const up = await uploadEbookFile(bookFile, "files");
    if (!up.ok) {
      showStatus(status, "No se pudo subir el archivo: " + up.reason, true);
      saveBtn.disabled = false;
      saveBtn.textContent = "Guardar ebook";
      return;
    }
    patch.file_url = up.url;
    patch.file_path = up.path;
  }

  let result;
  if (id) {
    result = await updateEbook(id, patch);
  } else {
    patch.position = ebooksState.length;
    result = await createEbook(patch);
  }

  saveBtn.disabled = false;
  saveBtn.textContent = "Guardar ebook";

  if (!result.ok) {
    const isSlugCollision = /slug/i.test(result.reason) && /duplicate|unique/i.test(result.reason);
    showStatus(
      status,
      isSlugCollision
        ? "Ya existe otro ebook con un título muy parecido (la URL quedaría repetida). Cambiá un poco el título."
        : "No se pudo guardar: " + result.reason,
      true
    );
    return;
  }

  closeEbookForm();
  await loadEbooks();
}

async function loadEbooks() {
  ebooksState = await fetchAllEbooksAdmin();
  renderEbooks();
}

function renderEbooks() {
  const list = document.getElementById("ebook-list");
  list.innerHTML = "";

  if (!ebooksState.length) {
    list.innerHTML = `<li class="empty-hint">Todavía no subiste ningún ebook.</li>`;
    return;
  }

  ebooksState.forEach((ebook, index) => {
    const li = document.createElement("li");
    li.className = "ebook-item ebook-item-full" + (ebook.is_published === false ? " is-unpublished" : "");
    li.draggable = true;
    li.dataset.index = String(index);

    li.innerHTML = `
      <span class="drag-handle" aria-hidden="true">⠿</span>
      <div class="ebook-item-cover">
        ${ebook.cover_url ? `<img src="${ebook.cover_url}" alt="">` : ""}
      </div>
      <div class="ebook-item-body">
        <strong>${escapeHtml(ebook.title)}</strong>
        <span>${ebook.price > 0 ? "$" + ebook.price : "Gratis"} · ${ebook.is_published === false ? "Oculto" : "Publicado"} · ${ebook.downloads_count || 0} descargas${ebook.show_downloads ? " (visible en la web)" : " (oculto en la web)"}</span>
      </div>
      <div class="ebook-item-actions">
        <label class="toggle">
          <input type="checkbox" data-action="toggle-published" ${ebook.is_published !== false ? "checked" : ""}>
          <span class="toggle-track"></span>
        </label>
        <button type="button" class="link-btn" data-action="edit">Editar</button>
        <button type="button" class="link-btn" data-action="delete">Borrar</button>
      </div>
    `;

    li.addEventListener("dragstart", () => {
      dragSourceIndex = index;
      li.classList.add("is-dragging");
    });
    li.addEventListener("dragend", () => li.classList.remove("is-dragging"));
    li.addEventListener("dragover", (e) => e.preventDefault());
    li.addEventListener("drop", async (e) => {
      e.preventDefault();
      if (dragSourceIndex === null || dragSourceIndex === index) return;
      const moved = ebooksState.splice(dragSourceIndex, 1)[0];
      ebooksState.splice(index, 0, moved);
      dragSourceIndex = null;
      renderEbooks();
      await reorderEbooks(ebooksState.map((e) => e.id));
    });

    li.querySelector('[data-action="toggle-published"]').addEventListener("change", async (e) => {
      await updateEbook(ebook.id, { is_published: e.target.checked });
      await loadEbooks();
    });

    li.querySelector('[data-action="edit"]').addEventListener("click", () => openEbookForm(ebook));

    li.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm(`¿Borrar "${ebook.title}"? Esta acción no se puede deshacer.`)) return;
      await deleteEbook(ebook);
      await loadEbooks();
    });

    list.appendChild(li);
  });
}

/* ---------------------------------------------------------
   CUPONES
   --------------------------------------------------------- */
let couponsState = [];

function wireCouponsPanel() {
  const form = document.getElementById("coupon-form");
  document.getElementById("new-coupon-btn").addEventListener("click", () => openCouponForm(null));
  document.getElementById("cancel-coupon-btn").addEventListener("click", () => closeCouponForm());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitCouponForm();
  });
}

function openCouponForm(coupon) {
  const form = document.getElementById("coupon-form");
  form.hidden = false;
  document.getElementById("coupon-form-title").textContent = coupon ? "Editar cupón" : "Nuevo cupón";

  document.getElementById("coupon-id").value = coupon?.id || "";
  document.getElementById("coupon-code").value = coupon?.code || "";
  document.getElementById("coupon-discount").value = coupon?.discount_percent || 100;
  document.getElementById("coupon-max-uses").value = coupon?.max_uses ?? "";
  document.getElementById("coupon-expires").value = coupon?.expires_at ? coupon.expires_at.slice(0, 10) : "";
  document.getElementById("coupon-active").checked = coupon ? coupon.active !== false : true;

  const select = document.getElementById("coupon-ebook");
  select.innerHTML = `<option value="">Todos los ebooks pagos</option>`;
  ebooksState
    .filter((e) => e.price > 0)
    .forEach((e) => {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = e.title;
      if (coupon?.ebook_id === e.id) opt.selected = true;
      select.appendChild(opt);
    });

  document.getElementById("save-coupon-btn").textContent = coupon ? "Guardar cambios" : "Guardar cupón";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeCouponForm() {
  document.getElementById("coupon-form").hidden = true;
  document.getElementById("coupon-form").reset();
}

async function submitCouponForm() {
  const status = document.getElementById("coupon-form-status");
  const saveBtn = document.getElementById("save-coupon-btn");
  const id = document.getElementById("coupon-id").value || null;
  const code = document.getElementById("coupon-code").value.trim().toUpperCase();
  const discount_percent = parseInt(document.getElementById("coupon-discount").value, 10);
  const ebook_id = document.getElementById("coupon-ebook").value || null;
  const maxUsesRaw = document.getElementById("coupon-max-uses").value;
  const max_uses = maxUsesRaw ? parseInt(maxUsesRaw, 10) : null;
  const expiresRaw = document.getElementById("coupon-expires").value;
  const expires_at = expiresRaw ? new Date(expiresRaw + "T23:59:59").toISOString() : null;
  const active = document.getElementById("coupon-active").checked;

  if (!code) {
    showStatus(status, "Falta el código del cupón.", true);
    return;
  }
  if (!discount_percent || discount_percent < 1 || discount_percent > 100) {
    showStatus(status, "El descuento tiene que ser entre 1 y 100.", true);
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Guardando...";

  const patch = { code, discount_percent, ebook_id, max_uses, expires_at, active };
  const result = id ? await updateCoupon(id, patch) : await createCoupon(patch);

  saveBtn.disabled = false;
  saveBtn.textContent = "Guardar cupón";

  if (!result.ok) {
    showStatus(status, "No se pudo guardar: " + result.reason, true);
    return;
  }

  closeCouponForm();
  await loadCoupons();
}

async function loadCoupons() {
  couponsState = await fetchAllCouponsAdmin();
  renderCoupons();
}

function renderCoupons() {
  const list = document.getElementById("coupon-list");
  list.innerHTML = "";

  if (!couponsState.length) {
    list.innerHTML = `<li class="empty-hint">Todavía no creaste ningún cupón.</li>`;
    return;
  }

  couponsState.forEach((coupon) => {
    const ebookTitle = coupon.ebook_id ? ebooksState.find((e) => e.id === coupon.ebook_id)?.title || "ebook eliminado" : "Todos los ebooks";
    const usage = coupon.max_uses ? `${coupon.used_count}/${coupon.max_uses} usos` : `${coupon.used_count} usos (ilimitado)`;
    const expired = coupon.expires_at && new Date(coupon.expires_at) < new Date();

    const li = document.createElement("li");
    li.className = "ebook-item" + (coupon.active === false || expired ? " is-unpublished" : "");
    li.innerHTML = `
      <div class="ebook-item-body">
        <strong>${escapeHtml(coupon.code)} · ${coupon.discount_percent}% off</strong>
        <span>${escapeHtml(ebookTitle)} · ${usage}${expired ? " · vencido" : ""}${coupon.active === false ? " · inactivo" : ""}</span>
      </div>
      <div class="ebook-item-actions">
        <label class="toggle">
          <input type="checkbox" data-action="toggle-active" ${coupon.active !== false ? "checked" : ""}>
          <span class="toggle-track"></span>
        </label>
        <button type="button" class="link-btn" data-action="edit">Editar</button>
        <button type="button" class="link-btn" data-action="delete">Borrar</button>
      </div>
    `;

    li.querySelector('[data-action="toggle-active"]').addEventListener("change", async (e) => {
      await updateCoupon(coupon.id, { active: e.target.checked });
      await loadCoupons();
    });
    li.querySelector('[data-action="edit"]').addEventListener("click", () => openCouponForm(coupon));
    li.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm(`¿Borrar el cupón "${coupon.code}"?`)) return;
      await deleteCoupon(coupon.id);
      await loadCoupons();
    });

    list.appendChild(li);
  });
}

/* ---------------------------------------------------------
   VENTAS
   --------------------------------------------------------- */
const STATUS_LABELS = {
  approved: "Aprobado",
  pending: "Pendiente",
  in_process: "En proceso",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

async function loadSales() {
  const purchases = await fetchPurchasesAdmin();
  renderSalesSummary(purchases);
  renderSalesList(purchases);
}

/**
 * Se suscribe a cambios en "purchases" vía Supabase Realtime. Cuando
 * una compra queda aprobada (recién creada con cupón 100%, o
 * actualizada por el webhook de Mercado Pago), prende el punto de
 * notificación en la pestaña "Ventas" y refresca los datos, sin que
 * haga falta recargar la página.
 */
function subscribeSalesRealtime() {
  if (!supabaseClient) return;

  supabaseClient
    .channel("purchases-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "purchases" },
      (payload) => {
        if (payload.new && payload.new.status === "approved") {
          showSalesBadge();
        }
        loadSales(); // igual refrescamos los números para mantenerlos al día
      }
    )
    .subscribe();
}

function showSalesBadge() {
  const badge = document.getElementById("sales-badge");
  if (badge) badge.hidden = false;
}

function hideSalesBadge() {
  const badge = document.getElementById("sales-badge");
  if (badge) badge.hidden = true;
}

function renderSalesSummary(purchases) {
  const grid = document.getElementById("sales-summary");
  const approved = purchases.filter((p) => p.status === "approved");
  const pending = purchases.filter((p) => p.status === "pending" || p.status === "in_process");
  const rejected = purchases.filter((p) => p.status === "rejected" || p.status === "cancelled");
  const total = approved.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const cards = [
    { label: "Total facturado", value: `$${total.toLocaleString("es-AR")}`, hint: `${approved.length} ventas aprobadas` },
    { label: "Pendientes", value: pending.length, hint: "esperando confirmación" },
    { label: "Rechazadas / canceladas", value: rejected.length, hint: "" },
  ];

  grid.innerHTML = cards
    .map(
      (c) => `
      <div class="metric-card">
        <strong>${c.value}</strong>
        <span>${c.label}</span>
        <small>${c.hint}</small>
      </div>`
    )
    .join("");
}

function renderSalesList(purchases) {
  const list = document.getElementById("sales-list");

  if (!purchases.length) {
    list.innerHTML = `<li class="empty-hint">Todavía no hay compras registradas.</li>`;
    return;
  }

  list.innerHTML = purchases
    .map((p) => {
      const date = p.created_at ? new Date(p.created_at).toLocaleString("es-AR") : "";
      const statusLabel = STATUS_LABELS[p.status] || p.status;
      return `
      <li class="sale-item">
        <div class="sale-item-head">
          <strong>${escapeHtml(p.ebooks?.title || "Ebook eliminado")}</strong>
          <span class="sale-status sale-status--${escapeHtml(p.status)}">${statusLabel}</span>
        </div>
        <div class="sale-item-details">
          <span><b>Monto:</b> $${Number(p.amount || 0).toLocaleString("es-AR")}</span>
          <span><b>Email:</b> ${escapeHtml(p.payer_email || "—")}</span>
          <span><b>Fecha:</b> ${date}</span>
          ${p.coupon_code ? `<span><b>Cupón:</b> ${escapeHtml(p.coupon_code)}</span>` : ""}
        </div>
      </li>`;
    })
    .join("");
}

/* ---------------------------------------------------------
   MÉTRICAS
   --------------------------------------------------------- */
async function loadMetrics() {
  const [visits, daily, messagesCount] = await Promise.all([
    fetchVisitMetrics(),
    fetchDailyVisits(14),
    fetchMessagesCount(),
  ]);
  renderMetricsSummary(visits, messagesCount);
  renderMetricsSparkline(daily);
  renderMetricsEbooks();
}

function renderMetricsSummary(visits, messagesCount) {
  const grid = document.getElementById("metrics-summary");
  const v = visits || {
    total_visits: 0,
    unique_visitors: 0,
    today_visits: 0,
    today_unique: 0,
    last_7d_visits: 0,
    last_7d_unique: 0,
    last_30d_visits: 0,
    last_30d_unique: 0,
  };

  const cards = [
    { label: "Visitantes únicos (total)", value: v.unique_visitors, hint: `${v.total_visits} visitas en total` },
    { label: "Hoy", value: v.today_unique, hint: `${v.today_visits} visitas` },
    { label: "Últimos 7 días", value: v.last_7d_unique, hint: `${v.last_7d_visits} visitas` },
    { label: "Últimos 30 días", value: v.last_30d_unique, hint: `${v.last_30d_visits} visitas` },
    { label: "Mensajes recibidos", value: messagesCount, hint: "vía formulario de contacto" },
  ];

  grid.innerHTML = cards
    .map(
      (c) => `
      <div class="metric-card">
        <strong>${c.value ?? 0}</strong>
        <span>${c.label}</span>
        <small>${c.hint}</small>
      </div>`
    )
    .join("");
}

function renderMetricsSparkline(daily) {
  const el = document.getElementById("metrics-sparkline");
  if (!daily.length) {
    el.innerHTML = `<p class="field-hint">Todavía no hay visitas registradas.</p>`;
    return;
  }

  const max = Math.max(1, ...daily.map((d) => d.unique_visitors));
  el.innerHTML = daily
    .map((d) => {
      const height = Math.max(6, Math.round((d.unique_visitors / max) * 100));
      const dateLabel = new Date(d.day + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
      return `
        <div class="sparkline-bar" title="${dateLabel}: ${d.unique_visitors} únicos / ${d.visits} visitas">
          <div class="sparkline-fill" style="height:${height}%"></div>
          <span>${dateLabel}</span>
        </div>`;
    })
    .join("");
}

function renderMetricsEbooks() {
  const list = document.getElementById("metrics-ebooks-list");

  if (!ebooksState.length) {
    list.innerHTML = `<li class="empty-hint">Todavía no cargaste ningún ebook.</li>`;
    return;
  }

  const sorted = [...ebooksState].sort((a, b) => (b.downloads_count || 0) - (a.downloads_count || 0));
  const total = sorted.reduce((sum, e) => sum + (e.downloads_count || 0), 0);

  list.innerHTML =
    `<li class="empty-hint" style="text-align:left; border-style:solid;"><strong>${total}</strong> descargas/ventas en total, entre todos los ebooks.</li>` +
    sorted
      .map(
        (e) => `
      <li class="ebook-item">
        <div class="ebook-item-cover">${e.cover_url ? `<img src="${e.cover_url}" alt="">` : ""}</div>
        <div class="ebook-item-body">
          <strong>${escapeHtml(e.title)}</strong>
          <span>${e.downloads_count || 0} descargas${e.price > 0 ? " / ventas" : ""} · ${e.price > 0 ? "$" + e.price : "Gratis"}</span>
        </div>
      </li>`
      )
      .join("");
}

/* ---------------------------------------------------------
   MENSAJES
   --------------------------------------------------------- */
async function loadMessages() {
  const messages = await fetchMessagesAdmin();
  const list = document.getElementById("message-list");
  list.innerHTML = "";

  if (!messages.length) {
    list.innerHTML = `<li class="empty-hint">Todavía no recibiste mensajes desde la web.</li>`;
    return;
  }

  messages.forEach((m) => {
    const li = document.createElement("li");
    li.className = "message-item";
    const date = m.created_at ? new Date(m.created_at).toLocaleString("es-AR") : "";
    li.innerHTML = `
      <div class="message-item-head">
        <strong>${escapeHtml(m.nombre)}</strong>
        <span>${date}</span>
      </div>
      <div class="message-item-contact">
        <span><b>Email:</b> <a href="mailto:${escapeAttr(m.email)}">${escapeHtml(m.email)}</a></span>
        <span><b>Teléfono:</b> ${
          m.telefono
            ? `<a href="https://wa.me/${escapeAttr(m.telefono.replace(/\D/g, ""))}" target="_blank" rel="noopener">${escapeHtml(m.telefono)}</a>`
            : "—"
        }</span>
      </div>
      <p>${escapeHtml(m.mensaje)}</p>
    `;
    list.appendChild(li);
  });
}

/* ---------------------------------------------------------
   HELPERS
   --------------------------------------------------------- */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
function escapeAttr(str) {
  return (str || "").replace(/"/g, "&quot;");
}
