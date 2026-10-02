#!/usr/bin/env node
/*
 * Sincroniza el header y el footer de todas las paginas con las plantillas
 * de partials/, y regenera sitemap.xml a partir de las paginas publicas y de
 * data/articles.json.
 *
 * Uso (desde la raiz del proyecto, sin instalar nada):
 *   node scripts/sync-layout.js          -> actualiza los archivos
 *   node scripts/sync-layout.js --check  -> solo avisa si algo esta desactualizado (sale con codigo 1)
 *
 * Flujo para cambiar el menu o el footer: editar partials/header.html o
 * partials/footer.html y correr el script. Para publicar un articulo nuevo:
 * crear el HTML en articulos/, sumarlo a data/articles.json y correr el
 * script (agrega el header/footer correctos y la entrada del sitemap).
 *
 * Marcadores de las plantillas:
 *   {{base}}       prefijo relativo hasta la raiz ("" o "../")
 *   {{home}}       link al inicio ("" en index.html, para que "#contacto" no recargue la pagina)
 *   {{active:x}}   se convierte en class="active" aria-current="page" si la pagina pertenece a la seccion x
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://activemosjoven.vercel.app/';
const CHECK = process.argv.includes('--check');

// Paginas de la raiz -> seccion del menu que queda marcada. null = ninguna.
const ROOT_PAGES = {
  'index.html': 'inicio',
  'somos.html': 'somos',
  'abramos-debate.html': 'debate',
  'actividades.html': 'actividades',
  'multimedia.html': 'multimedia',
  'terminos-y-condiciones.html': 'terminos',
  'perfil.html': null,
  'admin.html': null,
  'restablecer-contrasena.html': null,
};
// Carpetas cuyas paginas cuelgan de "Abramos debate".
const SUBDIRS = { articulos: 'debate', tematicas: 'debate' };
// Paginas privadas o de servicio: no van al sitemap.
const NOT_IN_SITEMAP = new Set(['perfil.html', 'admin.html', 'restablecer-contrasena.html']);

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function listPages() {
  const pages = Object.entries(ROOT_PAGES).map(([file, section]) => ({ file, section, base: '' }));
  Object.entries(SUBDIRS).forEach(([dir, section]) => {
    fs.readdirSync(path.join(ROOT, dir))
      .filter((f) => f.endsWith('.html'))
      .sort()
      .forEach((f) => pages.push({ file: `${dir}/${f}`, section, base: '../' }));
  });
  return pages;
}

function render(template, page) {
  const home = page.file === 'index.html' ? '' : `${page.base}index.html`;
  return template
    .replace(/\{\{base\}\}/g, page.base)
    .replace(/\{\{home\}\}/g, home)
    .replace(/\{\{active:([a-z]+)\}\}/g, (_, key) => (key === page.section ? ' class="active" aria-current="page"' : ''));
}

const HEADER_RE = /<header class="site-header"[\s\S]*?<\/header>/;
const FOOTER_RE = /<footer class="site-footer"[\s\S]*?<\/footer>/;

const changed = [];
const problems = [];

function writeIfChanged(rel, next) {
  const prev = fs.existsSync(path.join(ROOT, rel)) ? read(rel) : null;
  if (prev === next) return;
  changed.push(rel);
  if (!CHECK) fs.writeFileSync(path.join(ROOT, rel), next, 'utf8');
}

// --- Header y footer ----------------------------------------------------------
const headerTpl = read('partials/header.html').trimEnd();
const footerTpl = read('partials/footer.html').trimEnd();
const pages = listPages();

pages.forEach((page) => {
  const original = read(page.file);
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const fix = (s) => s.replace(/\r?\n/g, eol);
  let html = original;
  if (!HEADER_RE.test(html)) problems.push(`${page.file}: no tiene <header class="site-header">`);
  if (!FOOTER_RE.test(html)) problems.push(`${page.file}: no tiene <footer class="site-footer">`);
  html = html.replace(HEADER_RE, () => fix(render(headerTpl, page)));
  html = html.replace(FOOTER_RE, () => fix(render(footerTpl, page)));
  writeIfChanged(page.file, html);
});

// --- Coherencia articulos <-> data/articles.json -------------------------------
const articles = JSON.parse(read('data/articles.json')).articles || [];
const articleByUrl = new Map(articles.map((a) => [a.url, a]));
articles.forEach((a) => {
  if (!fs.existsSync(path.join(ROOT, a.url))) problems.push(`data/articles.json: "${a.id}" apunta a ${a.url}, que no existe`);
  if (a.url !== `articulos/${a.id}.html`) problems.push(`data/articles.json: el id "${a.id}" no coincide con el archivo ${a.url}`);
});
pages.filter((p) => p.file.startsWith('articulos/')).forEach((p) => {
  if (!articleByUrl.has(p.file)) problems.push(`${p.file}: no esta cargado en data/articles.json (no aparece en el inicio ni en el sitemap con fecha)`);
});

// --- Sitemap ----------------------------------------------------------------------
// Se conservan lastmod/changefreq/priority de las entradas que ya existian;
// los articulos toman la fecha de publicacion (o "updatedDate" si existe).
const previous = new Map();
if (fs.existsSync(path.join(ROOT, 'sitemap.xml'))) {
  const xml = read('sitemap.xml');
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const get = (tag) => (m[1].match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1];
    previous.set(get('loc'), { lastmod: get('lastmod'), changefreq: get('changefreq'), priority: get('priority') });
  }
}

const today = new Date().toISOString().slice(0, 10);
const defaultsFor = (file) => {
  if (file === 'index.html') return { changefreq: 'weekly', priority: '1.0' };
  if (file.startsWith('articulos/')) return { changefreq: 'monthly', priority: '0.8' };
  if (file.startsWith('tematicas/')) return { changefreq: 'weekly', priority: '0.7' };
  return { changefreq: 'monthly', priority: '0.6' };
};

const entries = pages
  .filter((p) => !NOT_IN_SITEMAP.has(p.file))
  .map((p) => {
    const loc = SITE_URL + (p.file === 'index.html' ? '' : p.file);
    const prev = previous.get(loc) || {};
    const article = articleByUrl.get(p.file);
    const def = defaultsFor(p.file);
    return {
      loc,
      lastmod: (article && (article.updatedDate || article.publishDate)) || prev.lastmod || today,
      changefreq: prev.changefreq || def.changefreq,
      priority: prev.priority || def.priority,
    };
  });

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries.map((e) => [
    '  <url>',
    `    <loc>${e.loc}</loc>`,
    `    <lastmod>${e.lastmod}</lastmod>`,
    `    <changefreq>${e.changefreq}</changefreq>`,
    `    <priority>${e.priority}</priority>`,
    '  </url>',
  ].join('\n')),
  '</urlset>',
  '',
].join('\n');
writeIfChanged('sitemap.xml', sitemap);

// --- Resultado ----------------------------------------------------------------------
problems.forEach((p) => console.warn(`AVISO  ${p}`));
if (!changed.length) {
  console.log('Todo al dia: header, footer y sitemap ya coinciden con las plantillas.');
} else if (CHECK) {
  console.log(`Desactualizados (${changed.length}):\n  ${changed.join('\n  ')}\nCorré: node scripts/sync-layout.js`);
  process.exit(1);
} else {
  console.log(`Actualizados (${changed.length}):\n  ${changed.join('\n  ')}`);
}
