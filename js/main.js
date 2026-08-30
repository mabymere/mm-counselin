/* =========================================================
   MAIN.JS — interacción del sitio público
   ========================================================= */

document.getElementById("year").textContent = new Date().getFullYear();

/* ---------- fix de altura real de viewport en mobile ---------- */
function setViewportHeight() {
  document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
}
setViewportHeight();
window.addEventListener("resize", setViewportHeight);
window.addEventListener("orientationchange", setViewportHeight);

/* ---------- header al hacer scroll ---------- */
const header = document.getElementById("site-header");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 40);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

/* ---------- menú mobile ---------- */
const navToggle = document.getElementById("nav-toggle");
const mainNav = document.getElementById("main-nav");
navToggle.addEventListener("click", () => {
  const open = mainNav.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(open));
});
mainNav.querySelectorAll("a").forEach(a =>
  a.addEventListener("click", () => {
    mainNav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  })
);

/* ---------- reveal-on-scroll ---------- */
const revealEls = document.querySelectorAll(".reveal");
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add("is-visible"), i * 60);
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
);
revealEls.forEach(el => revealObserver.observe(el));

/* =========================================================
   THREE.JS — fondo ambiental de partículas orgánicas
   Sutil, no interactúa con el layout, solo acompaña el scroll.
   ========================================================= */
(function ambientBackground() {
  const canvas = document.getElementById("bg-canvas");
  if (!window.THREE || !canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 14;

  const COUNT = 140;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 26;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 26;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
    speeds[i] = 0.15 + Math.random() * 0.35;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  // dos tonos: verde agua y verde oliva, alternados
  const materialAqua = new THREE.PointsMaterial({
    color: 0x7fae9c,
    size: 0.09,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, materialAqua);
  scene.add(points);

  let targetScrollY = 0;
  let currentScrollY = 0;
  window.addEventListener(
    "scroll",
    () => {
      targetScrollY = window.scrollY / (document.body.scrollHeight - window.innerHeight || 1);
    },
    { passive: true }
  );

  let mouseX = 0,
    mouseY = 0;
  window.addEventListener(
    "mousemove",
    (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true }
  );

  function animate() {
    requestAnimationFrame(animate);
    currentScrollY += (targetScrollY - currentScrollY) * 0.04;

    points.rotation.y = currentScrollY * 1.4 + mouseX * 0.06;
    points.rotation.x = currentScrollY * 0.5 + mouseY * 0.04;
    points.position.y = currentScrollY * 2.2;

    const pos = geometry.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3 + 1] += Math.sin(Date.now() * 0.00025 * speeds[i] + i) * 0.0018;
    }
    geometry.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
})();

/* =========================================================
   LAYOUT DINÁMICO — orden, visibilidad y textos editados
   desde el panel privado (admin.html)
   ========================================================= */
(async function applySectionsLayout() {
  const root = document.getElementById("sections-root");
  if (!root || typeof fetchSectionsLayout !== "function") return;

  const sections = await fetchSectionsLayout();
  if (!sections.length) return; // sin Supabase configurado: se queda el orden fijo del HTML

  sections.forEach((s) => {
    const el = root.querySelector(`[data-section="${s.key}"]`);
    if (!el) return;

    // visibilidad
    el.style.display = s.visible === false ? "none" : "";

    // contenido editable (título, bajada, etc.)
    if (s.content && typeof s.content === "object") {
      Object.entries(s.content).forEach(([field, value]) => {
        if (!value) return;
        const target = el.querySelector(`[data-field="${field}"]`);
        if (!target) return;
        if (target.hasAttribute("data-field-html")) {
          target.innerHTML = value;
        } else {
          target.textContent = value;
        }
      });
    }
  });

  // reordenar el DOM según "position"
  sections
    .slice()
    .sort((a, b) => a.position - b.position)
    .forEach((s) => {
      const el = root.querySelector(`[data-section="${s.key}"]`);
      if (el) root.appendChild(el);
    });
})();

/* =========================================================
   EBOOKS — carga dinámica desde Supabase
   Si todavía no hay Supabase configurado o no hay ebooks
   publicados, se mantiene el estado vacío del HTML.
   ========================================================= */
(async function loadEbooks() {
  const grid = document.getElementById("ebook-grid");
  const emptyState = document.getElementById("ebook-empty");
  if (!grid || typeof fetchPublishedEbooks !== "function") return;

  const ebooks = await fetchPublishedEbooks();
  if (!ebooks.length) return; // se queda el estado vacío

  emptyState.remove();
  ebooks.forEach((ebook) => {
    const isPaid = ebook.price && ebook.price > 0;
    const card = document.createElement("article");
    card.className = "ebook-card reveal";
    card.innerHTML = `
      <div class="ebook-cover" ${ebook.cover_url ? `data-cover="${ebook.cover_url}" data-title="${ebook.title}"` : ""}>
        ${ebook.cover_url ? `<img src="${ebook.cover_url}" alt="${ebook.title}" loading="lazy">` : ""}
      </div>
      <div class="ebook-body">
        <h3>${ebook.title}</h3>
        <p>${ebook.description || ""}</p>
        <div class="ebook-actions-row">
          ${
            isPaid
              ? `<button type="button" class="ebook-download ebook-buy-btn" data-ebook-id="${ebook.id}">Comprar${ebook.price ? ` · $${ebook.price}` : ""}</button>
                 <span class="ebook-secure-badge">
                   <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                   Pago seguro a través de Mercado Pago
                 </span>
                 <button type="button" class="ebook-coupon-toggle">¿Tenés un cupón?</button>
                 <div class="ebook-coupon-box" hidden>
                   <input type="text" class="ebook-coupon-input" placeholder="Código de cupón">
                 </div>
                 <button type="button" class="ebook-recover-toggle">¿Ya pagaste y no pudiste descargar?</button>
                 <div class="ebook-recover-box" hidden>
                   <input type="email" class="ebook-recover-email" placeholder="Tu email de compra">
                   <button type="button" class="ebook-recover-submit" data-ebook-id="${ebook.id}">Buscar mi compra</button>
                   <p class="ebook-recover-status" hidden></p>
                 </div>`
              : `<button type="button" class="ebook-download ebook-free-btn" data-ebook-id="${ebook.id}" data-file-url="${ebook.file_url}">Descargar</button>`
          }
          ${ebook.show_downloads ? `<span class="ebook-downloads-badge">${ebook.downloads_count || 0} descargas</span>` : ""}
        </div>
        ${ebook.slug ? `<a class="ebook-view-more" href="/${ebook.slug}">Ver más →</a>` : ""}
      </div>
    `;
    grid.appendChild(card);
    revealObserver.observe(card);
  });

  grid.querySelectorAll(".ebook-buy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const couponInput = btn.closest(".ebook-actions-row").querySelector(".ebook-coupon-input");
      buyEbook(btn.dataset.ebookId, btn, couponInput ? couponInput.value.trim() : "");
    });
  });

  grid.querySelectorAll(".ebook-coupon-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const box = toggle.nextElementSibling;
      box.hidden = !box.hidden;
      if (!box.hidden) box.querySelector("input").focus();
    });
  });

  grid.querySelectorAll(".ebook-recover-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const box = toggle.nextElementSibling;
      box.hidden = !box.hidden;
      if (!box.hidden) box.querySelector("input").focus();
    });
  });

  grid.querySelectorAll(".ebook-recover-submit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const box = btn.closest(".ebook-recover-box");
      recoverPurchase(btn.dataset.ebookId, box.querySelector(".ebook-recover-email"), box.querySelector(".ebook-recover-status"), btn);
    });
  });

  grid.querySelectorAll(".ebook-free-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      incrementEbookDownloads(btn.dataset.ebookId); // fire and forget, no bloquea la descarga
      window.open(btn.dataset.fileUrl, "_blank", "noopener");
    });
  });

  grid.querySelectorAll(".ebook-cover[data-cover]").forEach((cover) => {
    cover.addEventListener("click", () => openEbookLightbox(cover.dataset.cover, cover.dataset.title));
  });
})();

/* =========================================================
   PREVISUALIZACIÓN DE TAPA DE EBOOK (lightbox)
   ========================================================= */
const ebookLightbox = document.getElementById("ebook-lightbox");
const ebookLightboxImg = document.getElementById("ebook-lightbox-img");

function openEbookLightbox(src, alt) {
  if (!ebookLightbox) return;
  ebookLightboxImg.src = src;
  ebookLightboxImg.alt = alt || "";
  ebookLightbox.hidden = false;
}
function closeEbookLightbox() {
  if (!ebookLightbox) return;
  ebookLightbox.hidden = true;
  ebookLightboxImg.src = "";
}
if (ebookLightbox) {
  document.getElementById("ebook-lightbox-close").addEventListener("click", closeEbookLightbox);
  ebookLightbox.addEventListener("click", (e) => {
    if (e.target === ebookLightbox) closeEbookLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !ebookLightbox.hidden) closeEbookLightbox();
  });
}

/**
 * Busca una compra ya aprobada con ese email para ese ebook (para
 * cuando alguien pagó de verdad pero perdió la página de gracias.html).
 * Si la encuentra, redirige a gracias.html reusando toda esa lógica.
 */
async function recoverPurchase(ebookId, emailInput, statusEl, btn) {
  const email = emailInput.value.trim();
  if (!email) {
    statusEl.hidden = false;
    statusEl.textContent = "Escribí el email que usaste para pagar.";
    return;
  }

  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Buscando...";
  statusEl.hidden = true;

  try {
    const res = await fetch("/api/recover-purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ebook_id: ebookId, email }),
    });
    const data = await res.json();

    if (data.found) {
      window.location.href = `gracias.html?external_reference=${encodeURIComponent(data.external_reference)}`;
      return;
    }

    btn.disabled = false;
    btn.textContent = originalLabel;
    statusEl.hidden = false;
    statusEl.innerHTML =
      'No encontramos ninguna compra aprobada con ese email para este ebook. Si ya pagaste, ' +
      '<a href="https://wa.me/5491156472298" target="_blank" rel="noopener">escribinos por WhatsApp</a> con tu comprobante y te lo mandamos a mano.';
  } catch (err) {
    btn.disabled = false;
    btn.textContent = originalLabel;
    statusEl.hidden = false;
    statusEl.textContent = "No se pudo buscar tu compra. Probá de nuevo en unos minutos.";
  }
}

/**
 * Inicia la compra de un ebook pago. Si hay un cupón válido de 100%,
 * el backend aprueba directo y devuelve un link a gracias.html sin
 * pasar por Mercado Pago. Si no, crea la preferencia y redirige al
 * checkout con el precio ya descontado (si corresponde).
 */
async function buyEbook(ebookId, btn, couponCode) {
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Procesando...";

  try {
    const res = await fetch("/api/create-preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ebook_id: ebookId, coupon_code: couponCode || undefined }),
    });
    const data = await res.json();

    if (data.free && data.redirect) {
      window.location.href = data.redirect;
      return;
    }
    if (data.init_point) {
      window.location.href = data.init_point;
      return;
    }
    throw new Error(data.error || "Sin init_point");
  } catch (err) {
    btn.disabled = false;
    btn.textContent = originalLabel;
    alert(err.message && err.message !== "Sin init_point" ? err.message : "No se pudo iniciar el pago. Probá de nuevo en unos minutos.");
  }
}

/* =========================================================
   FORMULARIO DE CONTACTO
   ========================================================= */
const contactForm = document.getElementById("contact-form");
if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(contactForm);
    const payload = Object.fromEntries(formData.entries());
    const submitBtn = contactForm.querySelector("button[type=submit]");
    const originalLabel = submitBtn.textContent;

    submitBtn.textContent = "Enviando...";
    submitBtn.disabled = true;

    const result =
      typeof sendContactMessage === "function"
        ? await sendContactMessage(payload)
        : { ok: false, reason: "not-configured" };

    if (result.ok) {
      submitBtn.textContent = "¡Mensaje enviado!";
      contactForm.reset();
    } else {
      submitBtn.textContent = "Escribime por WhatsApp mejor";
      window.open("https://wa.me/5491156472298", "_blank");
    }

    setTimeout(() => {
      submitBtn.textContent = originalLabel;
      submitBtn.disabled = false;
    }, 2600);
  });
}
