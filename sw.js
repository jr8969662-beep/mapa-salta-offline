// ============================================
// SERVICE WORKER - Mapa Salta Offline
// Versión: v5 (soporta modo claro + oscuro)
// ============================================

const VERSION = 'v5';
const CACHE_APP = 'salta-app-' + VERSION;
const CACHE_TILES = 'salta-tiles-' + VERSION;

// Dominios de servidores de teselas (claro + oscuro)
const TILE_HOSTS = [
    'tile.openstreetmap.org',       // Mapa claro
    'basemaps.cartocdn.com',        // Mapa oscuro (CARTO)
    'a.basemaps.cartocdn.com',
    'b.basemaps.cartocdn.com',
    'c.basemaps.cartocdn.com',
    'd.basemaps.cartocdn.com'
];

// Archivos que se guardan la primera vez
const APP_URLS = [
    './',
    './index.html',
    './manifest.json',
    './data/calles.geojson',
    './data/hospitales.geojson',
    './data/sitios.geojson',
    './data/direcciones.geojson',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// ============================================
// INSTALL
// ============================================
self.addEventListener('install', (event) => {
    console.log('🔧 Instalando Service Worker v5...');
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
    console.log('✅ Service Worker v5 activado');
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
// Detectar si es una URL de tesela
// ============================================
function esTesela(url) {
    return TILE_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host));
}

// ============================================
// FETCH
// ============================================
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. TESELAS DEL MAPA (claro y oscuro)
    // Estrategia: caché primero → si no, red y guarda
    if (esTesela(url)) {
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
                if (respuestaRed.ok && event.request.method === 'GET') {
                    const copia = respuestaRed.clone();
                    caches.open(CACHE_APP).then((cache) => {
                        cache.put(event.request, copia);
                    });
                }
                return respuestaRed;
            });
        }).catch(() => {
            return caches.match('./index.html');
        })
    );
});
