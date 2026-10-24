// Intermediario gratuito (Cloudflare Worker) para ver los colectivos de SAETA en vivo.
// El servidor de RedBus (salta.miredbus.com.ar) no deja que otras páginas lean sus datos
// directamente desde el navegador; este Worker los pide por vos y los devuelve con permiso (CORS).
//
// Uso:  https://TU-WORKER.workers.dev/?l=601            (una línea)
//       https://TU-WORKER.workers.dev/?l=601,606        (varias, separadas por coma)
// La app lo consulta en /vivo?l=601 (así también funciona si el Worker además sirve el mapa).
// Solo reenvía las posiciones de buses; nada más.

const ORIGEN = 'https://salta.miredbus.com.ar';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const codigos = (url.searchParams.get('l') || '')
      .split(',').map(s => s.trim()).filter(c => /^\d{3}$/.test(c)).slice(0, 8);
    if (!codigos.length) {
      return new Response(JSON.stringify({ error: 1, mensaje: 'Falta ?l=601' }),
        { status: 400, headers: { ...CORS, 'content-type': 'application/json' } });
    }
    const salida = {};
    await Promise.all(codigos.map(async c => {
      try {
        const r = await fetch(`${ORIGEN}/rest/posicionesBuses/${c}`, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; MapaSalta)' },
          cf: { cacheTtl: 10, cacheEverything: true },
        });
        salida[c] = r.ok ? await r.json() : { error: r.status };
      } catch (e) { salida[c] = { error: 1 }; }
    }));
    return new Response(JSON.stringify(salida), {
      headers: { ...CORS, 'content-type': 'application/json', 'Cache-Control': 'public, max-age=10' },
    });
  },
};
