# Activemos Joven

Sitio estático (HTML + CSS + JS sin framework) publicado en Vercel, con Supabase para cuentas, perfiles, comentarios, likes, vistas y newsletter.

## Publicar un artículo nuevo

1. Crear `articulos/<id>.html` (copiar uno existente como base).
2. Sumar la entrada en `data/articles.json`. El `id` tiene que coincidir con el nombre del archivo. `secondaryCategories` es opcional y hace que la nota aparezca también en otras temáticas.
3. Correr `node scripts/sync-layout.js`: le pone el header y el footer correctos y lo agrega al `sitemap.xml`.

## Cambiar el menú o el footer

Editar `partials/header.html` o `partials/footer.html` y correr `node scripts/sync-layout.js`. No hay que tocar cada página a mano.
`node scripts/sync-layout.js --check` solo avisa si alguna página quedó desactualizada.

## Base de datos

Todo el esquema está en `supabase/schema.sql`. Después de cambiarlo, hay que volver a correrlo completo en el SQL Editor de Supabase (es idempotente). Al final del archivo se explica cómo dar permisos de administradora a una cuenta.

Desde el panel de moderación (`admin.html`), las administradoras pueden:
- editar y eliminar comentarios, y revisar o descartar los reportes de comentarios;
- ver, dar de baja y exportar a CSV los suscriptores del newsletter.

## Qué no se publica

`.vercelignore` excluye `supabase/`, `scripts/`, `partials/`, `assets/images/sin-usar/` y este README.
