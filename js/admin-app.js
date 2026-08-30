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

  await Promise.all([loadSections(), loadEbooks(), loadMessages()]);
})();

/* ---------------------------------------------------------
   TABS
   --------------------------------------------------------- */
function wireTabs() {
  const tabs = document.querySelectorAll(".admin-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("is-active"));
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add("is-active");
    });
  });
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
  document.getElementById("ebook-published").checked = ebook ? ebook.is_published !== false : true;
  document.getElementById("ebook-show-downloads").checked = ebook ? !!ebook.show_downloads : false;
  document.getElementById("ebook-cover").value = "";
  document.getElementById("ebook-file").value = "";
  document.getElementById("ebook-drive-url").value = ebook?.drive_url || "";
  document.getElementById("save-ebook-btn").textContent = ebook ? "Guardar cambios" : "Guardar ebook";

  form.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const patch = { title, price, description, is_published, show_downloads };
  if (driveUrl) patch.drive_url = driveUrl;

  if (coverFile) {
    const up = await uploadEbookFile(coverFile, "covers");
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
    showStatus(status, "No se pudo guardar: " + result.reason, true);
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
    li.className = "ebook-item" + (ebook.is_published === false ? " is-unpublished" : "");
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
