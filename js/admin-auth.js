/* =========================================================
   ADMIN-AUTH.JS — protege login.html y admin.html
   ========================================================= */

/** En login.html: si ya hay sesión activa, va directo al panel. */
async function guardLoginPage() {
  const session = await authGetSession();
  if (session) window.location.replace("admin.html");
}

/** En admin.html: si NO hay sesión, redirige a login.html. Devuelve la sesión. */
async function guardAdminPage() {
  const session = await authGetSession();
  if (!session) {
    window.location.replace("login.html");
    return null;
  }
  return session;
}

/** Conecta el botón de logout de admin.html. */
function wireLogoutButton(buttonEl) {
  if (!buttonEl) return;
  buttonEl.addEventListener("click", async () => {
    await authSignOut();
    window.location.href = "login.html";
  });
}
