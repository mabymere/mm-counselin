# Mercado Pago + Cloudflare Pages Functions

Esta carpeta (`/functions`) contiene el "backend" del sitio: son
funciones serverless que corren en Cloudflare cuando se despliega
el proyecto como **Cloudflare Pages**. Se despliegan solas, no hay
que instalar ni correr nada aparte — Cloudflare las detecta por
estar en `/functions`.

Existen porque el Access Token de Mercado Pago y la `service_role
key` de Supabase son secretos: **nunca** pueden vivir en `js/main.js`
ni en ningún archivo que llegue al navegador. Estas funciones corren
del lado del servidor de Cloudflare, no en el navegador del comprador.

## Qué hace cada una

- **`api/create-preference.js`** — cuando alguien toca "Comprar" en
  un ebook, crea la preferencia de pago en Mercado Pago y devuelve
  el link de checkout.
- **`api/mp-webhook.js`** — Mercado Pago la llama automáticamente
  cuando cambia el estado de un pago. Acá se confirma el pago DE
  VERDAD contra la API de Mercado Pago (nunca hay que confiar en lo
  que vuelve por la URL al navegador, eso se puede falsificar).
- **`api/purchase-status.js`** — la usa `gracias.html` para saber si
  ya se confirmó el pago y, si es así, entregar el link privado de
  Google Drive.

## Variables de entorno necesarias

Se configuran en **Cloudflare Pages → tu proyecto → Settings →
Environment variables** (como "Secret" las que dicen secreto):

| Variable                     | De dónde sale                                                                 |
|-------------------------------|--------------------------------------------------------------------------------|
| `MP_ACCESS_TOKEN`             | Mercado Pago → tu cuenta → **Tus integraciones** → la aplicación → Credenciales de producción → **Access Token**. (Secret) |
| `SUPABASE_URL`                | Supabase → Project Settings → API → **Project URL**                           |
| `SUPABASE_SERVICE_ROLE_KEY`   | Supabase → Project Settings → API → **service_role key**. (Secret, ¡nunca la anon key!) |
| `SITE_URL`                    | La URL pública final del sitio, ej. `https://mabelmereles.com` (sin barra al final) |
| `VISIT_HASH_SALT`             | Opcional. Cualquier texto random tuyo (ej. `asd8f7sd9f8`). Se usa para "mezclar" la IP de cada visitante antes de guardarla, así ni siquiera nosotros podemos reconstruir la IP real a partir de lo guardado. Si no la cargás, el sitio funciona igual con un valor por defecto. (Secret) |

Importante: `SUPABASE_SERVICE_ROLE_KEY` es distinta de la `anon key`
que usa `js/supabase-client.js`. La service_role se salta todos los
permisos (RLS) — por eso solo se usa acá, del lado del servidor, y
nunca en un archivo que se sirve al navegador.

## Pasos para dejarlo funcionando

1. **Credenciales de Mercado Pago**: entrá a
   https://www.mercadopago.com.ar/developers/panel → "Tus
   integraciones" → creá una aplicación → copiá el **Access Token
   de producción** (para hacer pruebas primero, usá el de *prueba*
   y las tarjetas de test que da Mercado Pago).
2. Cargá las 4 variables de la tabla de arriba en Cloudflare Pages.
3. Volvé a desplegar el sitio (o esperá el próximo deploy) para que
   tome las variables nuevas.
4. Probá el flujo completo: en el panel, creá un ebook con precio
   mayor a 0 y un link de Google Drive. En la web, tocá "Comprar" →
   te debería llevar al checkout de Mercado Pago → al pagar, volvés
   a `gracias.html` y en unos segundos aparece el botón de descarga.
5. Si algo no confirma: revisá en Mercado Pago → Tus integraciones →
   la app → **Webhooks**, que la notification_url le haya llegado
   bien (`https://tu-sitio/api/mp-webhook`), y los logs de la
   Function en Cloudflare Pages → tu proyecto → pestaña "Functions".

## Nota sobre ebooks gratis vs pagos

- **Gratis** (precio 0): se sigue subiendo el PDF/EPUB directo desde
  el panel, tal como ya funcionaba — se guarda en Supabase Storage y
  el botón dice "Descargar".
- **Pago** (precio > 0): en vez de subir un archivo, se carga el
  **link privado de Google Drive** en el panel. El botón dice
  "Comprar", dispara Mercado Pago, y el link de Drive recién se
  entrega en `gracias.html` cuando el webhook confirmó el pago.
