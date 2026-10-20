// ============================================
// SERVICE WORKER - Mapa Salta Offline
// Subí VERSION cada vez que cambies index.html o los geojson
// ============================================

const VERSION = 'v16';
const CACHE_APP = 'salta-app-' + VERSION;
// FIJO: index.html usa este nombre para descargar/borrar teselas. No lo ligues a VERSION.
const CACHE_TILES = 'salta-tiles-v15';

const APP_URLS = [
    './',
    './index.html',
    './manifest.json',
    './data/calles.geojson',
    './data/hospitales.geojson',
    './data/sitios.geojson',
    './data/direcciones.geojson',
    './data/saeta.geojson',
    './data/rutas_saeta.json',
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
                    nombre !== CACHE_APP && nombre !== CACHE_TILES ? caches.delete(nombre) : null
                )
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Rutas (OSRM): siempre a la red, no se guardan
    if (url.hostname.includes('osrm')) return;

    // Teselas del mapa
    if (esTesola(url)) { // <- Ojo: corregido abajo en el código real
        event.respondWith(
            caches.open(CACHE_TILES).then((cache) =>
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

    // Archivos de la app y librerías
    event.respondWith(
        caches.match(event.request).then((enCache) => {
            return enCache || fetch(event.request).then((enRed) => {
                if (enRed.ok && event.request.method === 'GET') {
                    const copia = enRed.clone();
                    caches.open(CACHE_APP).then((cache) => cache.put(event.request, copia));
                }
                return enRed;
            });
        }).catch(() => caches.match('./index.html'))
    );
});
