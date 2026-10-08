// ============================================
// SERVICE WORKER - Mapa Salta Offline
// ============================================

const VERSION = 'v1';
const CACHE_APP = 'salta-app-' + VERSION;     // Archivos de la app
const CACHE_TILES = 'salta-tiles-' + VERSION; // Teselas del mapa

// Archivos que se guardan la primera vez
const APP_URLS = [
    './',
    './index.html',
    './manifest.json',
    './data/calles.geojson',
    './data/hospitales.geojson',
    './data/sitios.geojson',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// ============================================
// INSTALL: guardar archivos básicos
// ============================================
self.addEventListener('install', (event) => {
    console.log('🔧 Instalando Service Worker...');
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
    console.log('✅ Service Worker activado');
    event.waitUntil(
        caches.keys().then((nombres) => {
            return Promise.all(
                nombres.map((nombre) => {
                    if (nombre !== CACHE_APP && nombre !== CACHE_TILES) {
                        return caches.delete(nombre);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ============================================
// FETCH: interceptar todas las peticiones
// ============================================
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. TESELAS DEL MAPA (OpenStreetMap)
    // Estrategia: caché primero, si no está va a la red y guarda
    if (url.hostname.endsWith('tile.openstreetmap.org')) {
        event.respondWith(
            caches.open(CACHE_TILES).then((cache) => {
                return cache.match(event.request).then((respuestaCache) => {
                    if (respuestaCache) {
                        return respuestaCache;
                    }
                    return fetch(event.request).then((respuestaRed) => {
                        if (respuestaRed.ok) {
                            cache.put(event.request, respuestaRed.clone());
                        }
                        return respuestaRed;
                    }).catch(() => {
                        // Sin internet y sin caché: devolvemos una imagen vacía
                        return new Response('', { status: 404 });
                    });
                });
            })
        );
        return;
    }

    // 2. RESTO DE ARCHIVOS (HTML, JS, GeoJSON, Leaflet)
    // Estrategia: caché primero, luego red
    event.respondWith(
        caches.match(event.request).then((respuestaCache) => {
            return respuestaCache || fetch(event.request).then((respuestaRed) => {
                // Guardar en caché para la próxima
                if (respuestaRed.ok && event.request.method === 'GET') {
                    const copia = respuestaRed.clone();
                    caches.open(CACHE_APP).then((cache) => {
                        cache.put(event.request, copia);
                    });
                }
                return respuestaRed;
            });
        }).catch(() => {
            // Si no hay nada, mostrar la página principal
            return caches.match('./index.html');
        })
    );
});
