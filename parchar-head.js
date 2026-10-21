// Uso: node parchar-head.js
// Aplica meta tags iOS + apple-touch-icon al <head> de index.html
// Hace copia en index.backup.html

const fs = require('fs');
const ARCHIVO = 'index.html';

let s = fs.readFileSync(ARCHIVO, 'utf8');
let cambios = 0;

// 1) Meta tags para iOS + apple-touch-icon, después de <link rel="manifest">
if (!s.includes('apple-mobile-web-app-capable')) {
  const ancla = '<link rel="manifest" href="manifest.json">';
  if (!s.includes(ancla)) {
    console.error('No encontré <link rel="manifest"> en index.html');
    process.exit(1);
  }
  const extras = ancla + `
<link rel="apple-touch-icon" href="icons/icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Salta">`;
  s = s.replace(ancla, extras);
  cambios++;
}

// 2) theme-color sincronizado con manifest (debe ser #1e40af)
if (s.includes('name="theme-color"') && !s.includes('name="theme-color" content="#1e40af"')) {
  s = s.replace(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#1e40af">');
  cambios++;
}

if (cambios === 0) {
  console.log('Nada para cambiar: el index.html ya tiene los fixes.');
  process.exit(0);
}

fs.copyFileSync(ARCHIVO, 'index.backup.html');
fs.writeFileSync(ARCHIVO, s);
console.log(`✅ Listo: ${cambios} cambio(s). Backup en index.backup.html`);
