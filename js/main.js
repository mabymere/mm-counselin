/* =========================================================
   MAIN.JS — interacción del sitio público
   ========================================================= */

document.getElementById("year").textContent = new Date().getFullYear();

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
    const card = document.createElement("article");
    card.className = "ebook-card reveal";
    card.innerHTML = `
      <div class="ebook-cover">
        ${ebook.cover_url ? `<img src="${ebook.cover_url}" alt="${ebook.title}">` : ""}
      </div>
      <div class="ebook-body">
        <h3>${ebook.title}</h3>
        <p>${ebook.description || ""}</p>
        <a class="ebook-download" href="${ebook.file_url}" target="_blank" rel="noopener">
          ${ebook.price && ebook.price > 0 ? "Comprar" : "Descargar"}
        </a>
      </div>
    `;
    grid.appendChild(card);
    revealObserver.observe(card);
  });
})();

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
