// ============================================
// SERVICE WORKER - Mapa Salta Offline
// ============================================

const VERSION = 'v4';
const CACHE_APP = 'salta-app-' + VERSION;
const CACHE_TILES = 'salta-tiles-' + VERSION;

// Archivos que se guardan la primera vez
const APP_URLS = [
    './',
    './index.html',
    './manifest.json',
    './data/calles.geojson',
    './data/hospitales.geojson',
    './data/sitios.geojson',
    './data/direcciones.geojson',           // ← AGREGADO
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// ============================================
// INSTALL
// ============================================
self.addEventListener('install', (event) => {
    console.log('🔧 Instalando Service Worker v4...');
    event.waitUntil(
        caches.open(CACHE_APP).then((cache) => {
            return cache.addAll(APP_URLS);
        }).then(() => self.skipWaiting())
    );
});

// ============================================
// ACTIVATE: limpiar versiones viejas
// ============================================
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker v4 activado');
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

// ============================================
// FETCH
// ============================================
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Teselas del mapa
    if (url.hostname.endsWith('tile.openstreetmap.org')) {
        event.respondWith(
            caches.open(CACHE_TILES).then((cache) => {
                return cache.match(event.request).then((respuestaCache) => {
                    if (respuestaCache) return respuestaCache;
                    return fetch(event.request).then((respuestaRed) => {
                        if (respuestaRed.ok) {
                            cache.put(event.request, respuestaRed.clone());
                        }
                        return respuestaRed;
                    }).catch(() => new Response('', { status: 404 }));
                });
            })
        );
        return;
    }

    // Resto de archivos
    event.respondWith(
        caches.match(event.request).then((respuestaCache) => {
            return respuestaCache || fetch(event.request).then((respuestaRed) => {
                if (respuestaRed.ok && event.request.method === 'GET') {
                    const copia = respuestaRed.clone();
                    caches.open(CACHE_APP).then((cache) => {
                        cache.put(event.request, copia);
                    });
                }
                return respuestaRed;
            });
        }).catch(() => caches.match('./index.html'))
    );
});
