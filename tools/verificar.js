// Verificación antes de publicar: node tools/verificar.js
// Falla (código 1) si algo básico está roto. Se corre solo en GitHub y conviene correrlo antes de cada push.
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..');
const errores = [];
const err = (m) => errores.push('❌ ' + m);
const leer = (f) => fs.readFileSync(path.join(R, f), 'utf8');

// 1) sw.js: no vacío, sintaxis válida, tiene versión y manejador de fetch
let sw = '';
try { sw = leer('sw.js'); } catch (e) { err('sw.js no existe'); }
if (sw.trim().length < 1000) err(`sw.js está vacío o casi vacío (${sw.length} bytes)`);
try { new vm.Script(sw, { filename: 'sw.js' }); } catch (e) { err('sw.js tiene un error de sintaxis: ' + e.message); }
const vSw = (sw.match(/const VERSION = '(v\d+)'/) || [])[1];
if (!vSw) err('sw.js no tiene VERSION');
if (!/addEventListener\('fetch'/.test(sw)) err("sw.js no tiene el manejador 'fetch'");

// 2) index.html: la etiqueta de versión coincide con sw.js y el script principal compila
const html = leer('index.html');
const vHtml = (html.match(/id="verApp">(v\d+)</) || [])[1];
if (!vHtml) err('index.html no tiene la etiqueta de versión (verApp)');
if (vSw && vHtml && vSw !== vHtml) err(`Versiones distintas: sw.js dice ${vSw} y la etiqueta de la app dice ${vHtml}`);
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
scripts.forEach((s, i) => { try { new vm.Script(s, { filename: `index.html#script${i}` }); } catch (e) { err(`Error de sintaxis en el script ${i} de index.html: ${e.message}`); } });
try { new vm.Script(leer('bus.js'), { filename: 'bus.js' }); } catch (e) { err('bus.js: ' + e.message); }

// 3) todo lo que sw.js precarga existe, y los datos son JSON válido
const lista = (sw.match(/const ARCHIVOS[^=]*=\s*\[([\s\S]*?)\];/) || sw.match(/\[\s*'\.\/'[\s\S]*?\]/) || [])[1] || sw;
const rutas = [...lista.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]).filter((r) => r !== './');
rutas.forEach((r) => { if (!fs.existsSync(path.join(R, r))) err(`sw.js precarga ${r} pero el archivo no existe`); });
const dataDir = path.join(R, 'data');
fs.readdirSync(dataDir).filter((f) => /\.(json|geojson)$/.test(f)).forEach((f) => {
  try { const t = fs.readFileSync(path.join(dataDir, f), 'utf8'); if (!t.trim()) throw new Error('vacío'); JSON.parse(t); } catch (e) { err(`data/${f}: ${e.message}`); }
});

if (errores.length) { console.error(errores.join('\n')); process.exit(1); }
console.log(`✅ Todo bien: versión ${vSw}, sw.js ${sw.length} bytes, ${rutas.length} archivos precargados, datos válidos.`);
