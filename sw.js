// ============================================
// SERVICE WORKER - Mapa Salta Offline
// Versión: v15 (con estacionamiento gratis)
// ============================================

const VERSION = 'v15';
const CACHE_APP = 'salta-app-' + VERSION;
const CACHE_TILES = 'salta-tiles-' + VERSION;

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
    console.log('🔧 Instalando Service Worker v15...');
    event.waitUntil(
        caches.open(CACHE_APP)
            .then((cache) => cache.addAll(APP_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker v15 activado');
    event.waitUntil(
        caches.keys().then((nombres) => {
            return Promise.all(
                nombres.map((nombre) => {
                    if (nombre !== CACHE_APP && nombre !== CACHE_TILES) {
                        console.log('🗑️ Borrando caché vieja:', nombre);
                        return caches.delete(nombre);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Manejo de Teselas (Mapa)
    if (esTesela(url)) {
        event.respondWith(
            caches.open(CACHE_TILES).then((cache) => {
                return cache.match(event.request).then((respuestaCache) => {
                    if (respuestaCache) return respuestaCache;
                    return fetch(event.request).then((respuestaRed) => {
                        if (respuestaRed.ok) cache.put(event.request, respuestaRed.clone());
                        return respuestaRed;
                    }).catch(() => new Response('', { status: 404 }));
                });
            })
        );
        return;
    }

    // 2. Manejo de archivos locales y librerías (HTML, JS, GeoJSON)
    event.respondWith(
        caches.match(event.request).then((respuestaCache) => {
            return respuestaCache || fetch(event.request).then((respuestaRed) => {
                if (respuestaRed.ok && event.request.method === 'GET') {
                    const copia = respuestaRed.clone();
                    caches.open(CACHE_APP).then((cache) => cache.put(event.request, copia));
                }
                return respuestaRed;
            });
        }).catch(() => caches.match('./index.html'))
    );
});
