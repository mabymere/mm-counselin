/* =========================================================
   GET /:slug   →   página propia de un ebook
   (ej: merelesmabel.com/como_poner_limites_sin_culpa)

   Cloudflare Pages sirve primero los archivos estáticos reales
   (index.html, css/, js/, assets/, etc.); esta Function solo se
   activa para rutas de un solo segmento que NO son un archivo
   existente — como el slug de un ebook. Arma el HTML del lado
   del servidor (mejor para SEO que armarlo con JS en el navegador)
   reusando exactamente los mismos estilos y scripts del sitio.
   ========================================================= */

import { sbSelect, escapeHtml } from "./_lib/supabase.js";

function formatSummary(text) {
  if (!text) return "";
  return text
    .split(/\n\s*\n/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function notFoundPage(siteUrl) {
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Ebook no encontrado · Mabel Mereles</title>
<meta name="robots" content="noindex, nofollow">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500&family=Manrope:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
</head>
<body>
<div class="ebook-not-found">
  <h1>Este ebook no está disponible</h1>
  <p>Puede que se haya movido o ya no esté publicado. Volvé a la web para ver los ebooks disponibles.</p>
  <a class="btn btn-primary" href="${siteUrl}/#ebooks">Ver ebooks</a>
</div>
</body>
</html>`;
}

export async function onRequestGet({ params, env, request }) {
  const slug = String(params.slug || "");

  // rutas reservadas del sitio (con o sin extensión) nunca son un slug
  // de ebook: se delegan a los archivos estáticos reales, tal como
  // Cloudflare Pages los serviría si esta Function no existiera.
  const RESERVED = new Set(["admin", "login", "gracias", "index", "privacidad", "terminos", "favicon.ico", "robots.txt", "sitemap.xml"]);
  if (!slug || slug.includes(".") || RESERVED.has(slug.toLowerCase())) {
    return env.ASSETS.fetch(request);
  }

  const siteUrl = (env.SITE_URL || "").replace(/\/$/, "");

  let ebook;
  try {
    const rows = await sbSelect(
      env,
      "ebooks",
      `slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&select=*`
    );
    ebook = rows[0];
  } catch (err) {
    return new Response("Error interno", { status: 500 });
  }

  if (!ebook) {
    return new Response(notFoundPage(siteUrl), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const isPaid = ebook.price && ebook.price > 0;
  const title = escapeHtml(ebook.title);
  const shortDesc = escapeHtml(ebook.description || "");
  const summaryHtml =
    formatSummary(ebook.long_description) ||
    (ebook.description ? `<p>${escapeHtml(ebook.description)}</p>` : "");
  const coverUrl = ebook.cover_url || "";
  const pageUrl = `${siteUrl}/${ebook.slug}`;

  const html = `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">

<title>${title} | Mabel Mereles</title>
<meta name="description" content="${shortDesc || title}">
${ebook.keywords ? `<meta name="keywords" content="${escapeHtml(ebook.keywords)}">` : ""}
<link rel="canonical" href="${pageUrl}">
<meta name="robots" content="index, follow">

<meta property="og:type" content="website">
<meta property="og:locale" content="es_AR">
<meta property="og:site_name" content="Mabel Mereles · Counselor">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${shortDesc || title}">
<meta property="og:url" content="${pageUrl}">
${
  coverUrl
    ? `<meta property="og:image" content="${coverUrl}">
<meta property="og:image:secure_url" content="${coverUrl}">
<meta property="og:image:alt" content="Tapa de ${title}">`
    : ""
}

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${shortDesc || title}">
${coverUrl ? `<meta name="twitter:image" content="${coverUrl}">\n<meta name="twitter:image:alt" content="Tapa de ${title}">` : ""}

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Book",
  "name": ${JSON.stringify(ebook.title)},
  "description": ${JSON.stringify(ebook.description || "")},
  ${ebook.keywords ? `"keywords": ${JSON.stringify(ebook.keywords)},` : ""}
  ${coverUrl ? `"image": ${JSON.stringify(coverUrl)},` : ""}
  "url": ${JSON.stringify(pageUrl)},
  "author": { "@type": "Person", "name": "Mabel Mereles" },
  "offers": {
    "@type": "Offer",
    "priceCurrency": "ARS",
    "price": ${isPaid ? Number(ebook.price) : 0},
    "availability": "https://schema.org/InStock",
    "url": ${JSON.stringify(pageUrl)}
  }
}
</script>
</head>
<body>

<canvas id="bg-canvas"></canvas>
<div class="grain"></div>

<header class="site-header" id="site-header">
  <a href="/" class="brand">
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" width="30" height="30">
        <path d="M20 33V19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        <path d="M20 22C20 22 12 21.5 10 14C10 14 19 12.5 20 22Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M20 19C20 19 28 18 30 10C30 10 20.5 8 20 19Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" opacity="0.75"/>
        <path d="M20 33C20 33 13.5 32.6 12 28" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none" opacity="0.55"/>
      </svg>
    </span>
    <span class="brand-text">Mabel Mereles</span>
  </a>

  <nav class="main-nav" id="main-nav">
    <a href="/#sobre-mi">Sobre mí</a>
    <a href="/#enfoque">Enfoque</a>
    <a href="/#ebooks">Ebooks</a>
    <a href="/#testimonios">Testimonios</a>
    <a href="/#preguntas-frecuentes">FAQ</a>
    <a href="/#contacto">Contacto</a>
  </nav>

  <button class="nav-toggle" id="nav-toggle" aria-label="Abrir menú" aria-expanded="false">
    <span></span><span></span><span></span>
  </button>
</header>

<div class="back-bar">
  <a href="/#ebooks" class="back-link">← Volver a Ebooks</a>
</div>

<main>
  <section class="section ebook-detail">
    <div class="ebook-detail-cover" ${coverUrl ? `data-cover="${coverUrl}" data-title="${title}"` : ""}>
      ${coverUrl ? `<img src="${coverUrl}" alt="${title}">` : ""}
    </div>
    <div class="ebook-detail-info">
      <h1>${title}</h1>
      ${isPaid ? `<span class="ebook-detail-price">$${ebook.price}</span>` : `<span class="ebook-detail-price">Gratis</span>`}

      <div class="ebook-share">
        <button type="button" class="ebook-share-btn" id="ebook-share-btn">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/>
            <path d="M16 6l-4-4-4 4"/>
            <path d="M12 2v14"/>
          </svg>
          Compartir
        </button>
        <div class="ebook-share-menu" id="ebook-share-menu" hidden>
          <a class="ebook-share-option" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(ebook.title + " — " + pageUrl)}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z"/><path d="M8.5 9.5c.3 2.7 2.3 4.7 5 5"/></svg>
            WhatsApp
          </a>
          <a class="ebook-share-option" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14 8.5h-1.3c-.9 0-1.2.4-1.2 1.2V11h2.4l-.3 2.5h-2.1V19h-2.6v-5.5H7v-2.5h1.9V9.3C8.9 7.4 9.9 6 12 6h2v2.5Z"/></svg>
            Facebook
          </a>
          <a class="ebook-share-option" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(ebook.title)}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg>
            X
          </a>
          <a class="ebook-share-option" href="fb-messenger://share/?link=${encodeURIComponent(pageUrl)}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0-9 8.4c0 2.6 1.3 4.9 3.4 6.4V21l3.1-1.7c.8.2 1.6.3 2.5.3a9 9 0 0 0 0-16.6Z"/><path d="M7.5 13l3-3.4 2 2 3-3.4"/></svg>
            Messenger
          </a>
          <button type="button" class="ebook-share-option" id="ebook-share-copy">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l2-2a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-2 2a4 4 0 0 0 5.7 5.7l1-1"/></svg>
            <span id="ebook-share-copy-label">Copiar link</span>
          </button>
        </div>
      </div>

      <div class="ebook-detail-summary">${summaryHtml}</div>

      <div class="ebook-detail-actions">
        ${
          isPaid
            ? `<button type="button" class="ebook-download ebook-buy-btn" data-ebook-id="${ebook.id}">Comprar · $${ebook.price}</button>
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
            : `<button type="button" class="ebook-download ebook-free-btn" data-ebook-id="${ebook.id}" data-file-url="${ebook.file_url || ""}">Descargar</button>`
        }
        <p class="ebook-terms-note">Al ${isPaid ? "comprar" : "descargar"} aceptás los <a href="/terminos.html" target="_blank" rel="noopener">Términos y Condiciones</a></p>
      </div>
    </div>
  </section>
</main>

<footer class="site-footer">
  <span>© <span id="year"></span> Mabel Mereles · Counselor</span>
  <span>Buenos Aires, Argentina</span>
</footer>

<div class="ebook-lightbox" id="ebook-lightbox" hidden>
  <button type="button" class="ebook-lightbox-close" id="ebook-lightbox-close" aria-label="Cerrar previsualización">&times;</button>
  <img id="ebook-lightbox-img" src="" alt="">
</div>

<a href="https://wa.me/5491156472298" target="_blank" rel="noopener" class="whatsapp-float" aria-label="Escribir por WhatsApp">
  <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
    <path fill="#fff" d="M16.01 3C9.38 3 4 8.38 4 15.01c0 2.35.68 4.53 1.86 6.38L4 29l7.8-1.82a12 12 0 0 0 4.21.76h.01c6.63 0 12.01-5.38 12.01-12.01C28.03 8.38 22.65 3 16.01 3z"/>
    <path fill="#25D366" d="M16.01 4.5c-5.8 0-10.51 4.71-10.51 10.51 0 2.15.64 4.14 1.75 5.81l-1.17 5.2 5.34-1.25a10.44 10.44 0 0 0 4.59 1.05h.01c5.8 0 10.51-4.71 10.51-10.51S21.81 4.5 16.01 4.5z"/>
    <path fill="#fff" d="M21.51 18.24c-.29-.15-1.7-.84-1.96-.93-.26-.1-.46-.15-.65.15-.19.29-.75.93-.92 1.12-.17.19-.34.22-.63.07-.29-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.74-1.63-2.03-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.15-.65-1.58-.9-2.16-.24-.57-.48-.49-.65-.5h-.56c-.19 0-.5.07-.77.36-.26.29-1 .98-1 2.4 0 1.41 1.03 2.78 1.17 2.97.15.19 2.02 3.09 4.9 4.33.68.3 1.22.47 1.63.6.68.22 1.31.19 1.8.11.55-.08 1.7-.7 1.94-1.37.24-.68.24-1.25.17-1.37-.07-.12-.26-.19-.55-.34z"/>
  </svg>
</a>

<script src="https://unpkg.com/three@0.128.0/build/three.min.js"></script>
<script src="https://unpkg.com/@supabase/supabase-js@2"></script>
<script src="/js/supabase-client.js"></script>
<script src="/js/main.js"></script>
<script>
  // esta página no tiene #ebook-grid ni #sections-root, así que main.js
  // se queda con el header/menu/three.js/lightbox/scroll-reveal, y acá
  // conectamos manualmente el único botón de compra/descarga/cupón/tapa.
  document.addEventListener("DOMContentLoaded", () => {
    const buyBtn = document.querySelector(".ebook-buy-btn");
    if (buyBtn) {
      buyBtn.addEventListener("click", () => {
        const box = document.querySelector(".ebook-coupon-box input");
        buyEbook(buyBtn.dataset.ebookId, buyBtn, box ? box.value.trim() : "");
      });
    }
    const couponToggle = document.querySelector(".ebook-coupon-toggle");
    if (couponToggle) {
      couponToggle.addEventListener("click", () => {
        const box = document.querySelector(".ebook-coupon-box");
        box.hidden = !box.hidden;
        if (!box.hidden) box.querySelector("input").focus();
      });
    }
    const recoverToggle = document.querySelector(".ebook-recover-toggle");
    if (recoverToggle) {
      recoverToggle.addEventListener("click", () => {
        const box = document.querySelector(".ebook-recover-box");
        box.hidden = !box.hidden;
        if (!box.hidden) box.querySelector("input").focus();
      });
    }
    const recoverBtn = document.querySelector(".ebook-recover-submit");
    if (recoverBtn) {
      recoverBtn.addEventListener("click", () => {
        const box = recoverBtn.closest(".ebook-recover-box");
        recoverPurchase(recoverBtn.dataset.ebookId, box.querySelector(".ebook-recover-email"), box.querySelector(".ebook-recover-status"), recoverBtn);
      });
    }
    const freeBtn = document.querySelector(".ebook-free-btn");
    if (freeBtn) {
      freeBtn.addEventListener("click", () => {
        incrementEbookDownloads(freeBtn.dataset.ebookId);
        window.open(freeBtn.dataset.fileUrl, "_blank", "noopener");
      });
    }
    const cover = document.querySelector(".ebook-detail-cover[data-cover]");
    if (cover) {
      cover.addEventListener("click", () => openEbookLightbox(cover.dataset.cover, cover.dataset.title));
    }

    // botón de compartir
    const shareBtn = document.getElementById("ebook-share-btn");
    const shareMenu = document.getElementById("ebook-share-menu");
    if (shareBtn && shareMenu) {
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        shareMenu.hidden = !shareMenu.hidden;
      });
      document.addEventListener("click", (e) => {
        if (!shareMenu.hidden && !shareMenu.contains(e.target) && e.target !== shareBtn) {
          shareMenu.hidden = true;
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") shareMenu.hidden = true;
      });
    }
    const copyBtn = document.getElementById("ebook-share-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        const label = document.getElementById("ebook-share-copy-label");
        try {
          await navigator.clipboard.writeText(window.location.href);
          label.textContent = "¡Copiado!";
        } catch (err) {
          label.textContent = "No se pudo copiar";
        }
        setTimeout(() => (label.textContent = "Copiar link"), 2000);
      });
    }
  });
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
