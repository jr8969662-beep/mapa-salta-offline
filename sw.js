// ============================================
// SERVICE WORKER - Mapa Salta Offline
// v21 - colectivos SAETA: líneas, recorridos y paradas (data/saeta_lineas.json)
// Subí VERSION cada vez que cambies index.html o los geojson
// Cambiar también el texto de <div id="verApp"> en index.html
// ============================================

const VERSION = 'v79';
const CACHE_APP = 'salta-app-' + VERSION;
// FIJO: index.html usa este nombre para descargar/borrar teselas. No lo ligues a VERSION.
const CACHE_TILES = 'salta-tiles-v15';
// Fuentes: cache separado y persistente, no se borra al subir VERSION
const CACHE_FONTS = 'salta-fonts-v1';

const APP_URLS = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './data/calles.geojson',
    './data/hospitales.geojson',
    './data/sitios.geojson',
    './data/direcciones.geojson',
    './data/saeta.geojson',
    './data/saeta_lineas.json',
    './data/saeta_recarga.geojson',
    './data/cordon_verde.json',
    './data/barrios.json',
    './data/cerros.geojson',
    './data/redbus_lineas.json',
    './data/redbus_rutas.json',
    './bus.js',
    './data/lugares_extra.geojson',
    './data/lugares_nuevos.geojson',
    './data/lugares_usuario.geojson',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet-rotate@0.2.8/dist/leaflet-rotate.js',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'
];

function esTesela(url) {
    return url.hostname.endsWith('tile.openstreetmap.org');
}

// a.tile / b.tile / c.tile / tile -> siempre la misma clave de cache
function claveTesela(url) {
    return 'https://tile.openstreetmap.org' + url.pathname;
}

function esFuente(url) {
    return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_APP)
            // allSettled: si un archivo falla (404, sin red) igual se instala el resto
            .then((cache) => Promise.allSettled(APP_URLS.map((u) => cache.add(u))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((nombres) =>
            Promise.all(
                nombres.map((nombre) =>
                    nombre !== CACHE_APP && nombre !== CACHE_TILES && nombre !== CACHE_FONTS
                        ? caches.delete(nombre)
                        : null
                )
            )
        ).then(() => self.clients.claim())
    );
});

let _cacheTeselas = null;
function abrirCacheTeselas() { return _cacheTeselas || (_cacheTeselas = caches.open(CACHE_TILES)); }

let _nuevas = 0;
// Zonas del mapa offline descargado ([sur, oeste, norte, este]): estas teselas nunca se recortan
const ZONAS_PROTEGIDAS = [
    { b: [-24.85, -65.48, -24.72, -65.35], z: [13, 14, 15, 16] },
    { b: [-24.82, -65.45, -24.75, -65.38], z: [17] }
];
function teselaXY(lat, lng, z) {
    const n = Math.pow(2, z), r = lat * Math.PI / 180;
    return [Math.floor((lng + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)];
}
const RANGOS_PROTEGIDOS = [];
ZONAS_PROTEGIDAS.forEach((zn) => zn.z.forEach((z) => {
    const mn = teselaXY(zn.b[2], zn.b[1], z), mx = teselaXY(zn.b[0], zn.b[3], z);
    RANGOS_PROTEGIDOS.push({ z, x0: mn[0], x1: mx[0], y0: mn[1], y1: mx[1] });
}));
function esProtegida(urlStr) {
    const m = /\/(\d+)\/(\d+)\/(\d+)\.png/.exec(urlStr);
    if (!m) return false;
    const z = +m[1], x = +m[2], y = +m[3];
    return RANGOS_PROTEGIDOS.some((r) => r.z === z && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
}
function recortarTeselas(cache) {
    // Cada tanto, si hay demasiadas teselas sueltas, se borran las más viejas, pero nunca las del mapa offline descargado
    if (++_nuevas % 300) return;
    cache.keys().then((ks) => {
        const libres = ks.filter((k) => !esProtegida(k.url));
        if (libres.length > 6000) libres.slice(0, libres.length - 4000).forEach((k) => cache.delete(k));
    });
}


// Renovar el mapa sin internet: la app manda la lista de teselas y se vuelven a bajar despacio, de a 2
self.addEventListener('message', (event) => {
    const d = event.data || {};
    if (d.tipo !== 'refrescarTeselas' || !Array.isArray(d.urls)) return;
    event.waitUntil(abrirCacheTeselas().then(async (cache) => {
        const urls = d.urls.slice(0, 3000); let i = 0;
        const w = async () => { while (i < urls.length) { const u = urls[i++];
            try { const k = claveTesela(new URL(u)); const r = await fetch(k, { mode: 'cors', credentials: 'omit', cache: 'reload' }); if (r.ok) await cache.put(k, r); } catch (e) {} } };
        await Promise.all([w(), w()]);
    }));
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Rutas (OSRM): siempre a la red, no se guardan
    if (url.hostname.includes('osrm')) return;
    // Servicios en vivo (buses, rutas, búsquedas): siempre a la red, nunca de caché
    if (url.origin !== self.location.origin && !url.hostname.endsWith('unpkg.com') && !esTesela(url) && !esFuente(url)) return;

    // Fuentes de Google (Inter) - cache-first persistente
    if (esFuente(url)) {
        event.respondWith(
            caches.open(CACHE_FONTS).then((cache) =>
                cache.match(event.request).then((enCache) => {
                    if (enCache) return enCache;
                    return fetch(event.request).then((enRed) => {
                        if (enRed.ok) cache.put(event.request, enRed.clone());
                        return enRed;
                    }).catch(() => new Response('', { status: 404 }));
                })
            )
        );
        return;
    }

    // Teselas del mapa: primero lo guardado; si no está, se baja (con permiso CORS para poder guardarla) y se guarda
    if (esTesela(url)) {
        event.respondWith(
            abrirCacheTeselas().then((cache) =>
                cache.match(claveTesela(url)).then((enCache) => {
                    if (enCache) return enCache;
                    return fetch(claveTesela(url), { mode: 'cors', credentials: 'omit' }).then((enRed) => {
                        if (enRed.ok) { cache.put(claveTesela(url), enRed.clone()); recortarTeselas(cache); }
                        return enRed;
                    }).catch(() => fetch(event.request)).catch(() => new Response('', { status: 404 }));
                })
            )
        );
        return;
    }

    if (event.request.method !== 'GET') return;

    // Abrir la app (cache primero, así abre al instante y sin internet, aunque la URL traiga ?algo)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match('./index.html', { ignoreSearch: true })
                .then((enCache) => enCache || fetch(event.request))
        );
        return;
    }

    // Archivos de la app y librerías
    event.respondWith(
        caches.match(event.request).then((enCache) => {
            return enCache || fetch(event.request).then((enRed) => {
                if (enRed.ok) {
                    const copia = enRed.clone();
                    caches.open(CACHE_APP).then((cache) => cache.put(event.request, copia));
                }
                return enRed;
            });
        }).catch(() => new Response('', { status: 504 }))
    );
});
