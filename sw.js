// ============================================
// SERVICE WORKER - Mapa Salta Offline
// v21 - colectivos SAETA: líneas, recorridos y paradas (data/saeta_lineas.json)
// Subí VERSION cada vez que cambies index.html o los geojson
// ============================================

const VERSION = 'v42';
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
    './data/cerros.geojson',
    './data/redbus_lineas.json',
    './data/redbus_rutas.json',
    './bus.js',
    './data/lugares_extra.geojson',
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

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Rutas (OSRM): siempre a la red, no se guardan
    if (url.hostname.includes('osrm')) return;

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

    // Teselas del mapa
    if (esTesela(url)) {
        event.respondWith(
            caches.open(CACHE_TILES).then((cache) =>
                cache.match(claveTesela(url)).then((enCache) => {
                    if (enCache) return enCache;
                    return fetch(event.request).then((enRed) => {
                        if (enRed.ok) cache.put(claveTesela(url), enRed.clone());
                        return enRed;
                    }).catch(() => new Response('', { status: 404 }));
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
