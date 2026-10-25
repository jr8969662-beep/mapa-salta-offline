/* ===== COLECTIVOS: cuánto falta, paradas cerca, cómo llegar en colectivo, avisos =====
   Usa data/redbus_rutas.json (recorrido y paradas de cada línea, de SAETA/RedBus) y las posiciones
   en vivo (pedirVivo, definida en index.html). El tiempo de llegada se calcula con la posición real
   de cada colectivo sobre su recorrido: no depende de que la parada tenga código oficial. */
(function(){
'use strict';
const VEL_DEF=4.4;            // m/s (≈16 km/h promedio urbano con paradas)
const CAMINA=80;              // m/min
const BUS_M_MIN=240;          // m/min de viaje (≈14,5 km/h) para planificar
let RB=null,RBp=null,capaBus=null,vista=null,vistaTimer=null,ocupado=false,selPlan=null;
const Hist={},cache={t:0,k:'',d:null};
const $=id=>document.getElementById(id);
const esc=t=>escHtml(String(t==null?'':t));
const rad=Math.PI/180;
function dist(a,b,c,d){return haversine(a,b,c,d)}
function minTxt(m){return m<1?'<1 min':m<60?Math.round(m)+' min':Math.floor(m/60)+' h '+Math.round(m%60)+' min'}
function mTxt(m){return m<1000?(Math.max(10,Math.round(m/10)*10))+' m':(m/1000).toFixed(1).replace('.',',')+' km'}

/* ---------- datos ---------- */
async function cargarRB(){
if(RB)return RB;
if(RBp)return RBp;
RBp=(async()=>{const r=await fetch('data/redbus_rutas.json');const D=await r.json();return armarRB(D)})();
return RBp}
function armarRB(D){
const o={},lat0=-24.78,kx=111320*Math.cos(lat0*rad),ky=110540;
for(const cod in D){const v=D[cod],n=v.n,pts=[];let a=0,b=0;
for(let i=0;i<n.length;i+=2){a+=n[i];b+=n[i+1];pts.push([a/1e5,b/1e5])}
if(pts.length<2)continue;
const xy=pts.map(p=>[p[1]*kx,p[0]*ky]),cum=[0];
for(let i=1;i<xy.length;i++)cum.push(cum[i-1]+Math.hypot(xy[i][0]-xy[i-1][0],xy[i][1]-xy[i-1][1]));
const stops=v.s.filter(s=>s[0]<pts.length).map((s,k)=>({k,i:s[0],code:s[1],desc:s[2],lat:pts[s[0]][0],lng:pts[s[0]][1],d:cum[s[0]]}));
stops.forEach((s,k)=>s.k=k);
const total=cum[cum.length-1],loop=Math.hypot(xy[0][0]-xy[xy.length-1][0],xy[0][1]-xy[xy.length-1][1])<250;
o[cod]={cod,desc:v.d,pts,xy,cum,stops,total,loop,kx,ky}}
RB=o;return o}
function refDeCod(cod){const al=REDBUS&&REDBUS.alias;if(!al)return null;for(const r in al)if(al[r].includes(cod))return r;return null}
function colorCod(cod){const r=refDeCod(cod);const l=r&&typeof SAETA!=='undefined'&&SAETA&&SAETA.porRef[r];return l?l.color:'#2563eb'}
function nombreLinea(cod){const r=RB&&RB[cod];return r?r.desc:cod}
function corto(cod){const d=String(nombreLinea(cod)).trim(),t=d.split(' ')[0];return /\d/.test(t)?t:d.slice(0,14)}
function badge(cod){return `<span class="bs-badge" style="background:${colorCod(cod)}">${esc(corto(cod))}</span>`}

/* ---------- nombre de calle de una parada ---------- */
const nomCache={};
function calleCerca(lat,lng){
const k=lat.toFixed(4)+','+lng.toFixed(4);if(nomCache[k]!==undefined)return nomCache[k];
let best=null,bd=1e9;
try{if(typeof callesIndex!=='undefined'&&callesIndex.length){
for(const c of callesIndex){
if(Math.abs(c.lat-lat)>0.03||Math.abs(c.lng-lng)>0.03)continue;
for(const t of c.tramos){for(let i=0;i<t.length;i+=2){const p=t[i];const d=(p[0]-lat)*(p[0]-lat)+(p[1]-lng)*(p[1]-lng);if(d<bd){bd=d;best=c.nombreOriginal}}}}}}catch(e){}
const res=best&&bd<(0.0009*0.0009)?best:null;nomCache[k]=res;return res}
function nombreParada(s){const d=(s.desc||'').replace(/\*/g,'').trim();if(d.length>3)return d;const c=calleCerca(s.lat,s.lng);return c?c:'Parada'}

/* ---------- posiciones y tiempos ---------- */
function proyectar(r,lat,lng,rumbo,hint){
const x=lng*r.kx,y=lat*r.ky,xy=r.xy;let best=null;
for(let i=0;i<xy.length-1;i++){
const x1=xy[i][0],y1=xy[i][1],dx=xy[i+1][0]-x1,dy=xy[i+1][1]-y1,l2=dx*dx+dy*dy;if(l2<1)continue;
let t=((x-x1)*dx+(y-y1)*dy)/l2;t=t<0?0:t>1?1:t;
const d=Math.hypot(x-(x1+t*dx),y-(y1+t*dy));if(d>55)continue;
let cost=d;
if(rumbo!=null){const br=(Math.atan2(dx,dy)/rad+360)%360;let df=Math.abs(br-rumbo);df=Math.min(df,360-df);if(df>100)cost+=160;else if(df>60)cost+=30}
const pos=r.cum[i]+t*Math.sqrt(l2);
if(hint!=null)cost+=Math.min(Math.abs(pos-hint),500)*0.05;
if(!best||cost<best.cost)best={pos,d,cost}}
return best}
async function traerBuses(cods){
const k=cods.slice().sort().join(',');const ahora=Date.now();
if(cache.k===k&&ahora-cache.t<3000&&cache.d)return cache.d;
const data=await pedirVivo(cods);cache.k=k;cache.t=ahora;cache.d=data;
if(RB)cods.forEach(cod=>{const r=RB[cod],d=data[cod];if(!r||!d||!d.posiciones)return;
d.posiciones.forEach(b=>{if(b.latitud==null||b.longitud==null)return;
const id=cod+'-'+b.interno,h=Hist[id];
const pr=proyectar(r,b.latitud,b.longitud,b.orientacion,h?h.pos:null);
if(!pr){Hist[id]={pos:null,t:ahora,v:h&&h.v,off:true};b._pos=null;return}
let v=h&&h.v;
if(h&&h.pos!=null&&ahora-h.t>=2500&&ahora-h.t<90000){const inst=(pr.pos-h.pos)/((ahora-h.t)/1000);if(inst>=0&&inst<25)v=v==null?inst:0.6*v+0.4*inst}
Hist[id]={pos:pr.pos,t:ahora,v};b._pos=pr.pos;b._v=v})});
return data}
function velEfectiva(v){if(v==null)return VEL_DEF;return Math.min(8,Math.max(2.5,0.5*v+0.5*VEL_DEF))}
/* mejor llegada a una parada de la línea `cod` (r.stops[k]) */
function etaParada(cod,stop,data){
const r=RB[cod],d=data&&data[cod];if(!r||!d||!d.posiciones)return null;
let best=null;
for(const b of d.posiciones){if(b._pos==null)continue;
let delta=stop.d-b._pos;
if(delta<-60){if(r.loop)delta+=r.total;else continue}
const metros=Math.max(0,delta),seg=metros/velEfectiva(b._v);
if(!best||seg<best.seg)best={seg,min:seg/60,metros,interno:b.interno,llegando:metros<90,b}}
return best}
function etaTxt(e){if(!e)return'<span class="bs-sin">Sin colectivos en camino</span>';
if(e.llegando)return`<b class="bs-ya">Llegando</b> <small>interno ${esc(e.interno)}</small>`;
return`<b>≈ ${Math.max(1,Math.round(e.min))} min</b> <small>interno ${esc(e.interno)} · a ${mTxt(e.metros)}</small>`}

/* ---------- panel inferior ---------- */
function css(){if($('busCss'))return;const s=document.createElement('style');s.id='busCss';s.textContent=`
.bs{position:fixed;left:0;right:0;bottom:0;z-index:2350;background:var(--bg);color:var(--text);border-radius:20px 20px 0 0;box-shadow:0 -10px 36px rgba(0,0,0,.25);padding:8px 14px calc(14px + env(safe-area-inset-bottom,0px));max-height:66vh;overflow:auto;transform:translateY(105%);transition:transform .25s ease}
.bs.activo{transform:none}
.bs-cab{display:flex;align-items:center;gap:8px;position:sticky;top:-8px;background:var(--bg);padding:8px 0 6px;z-index:2}
.bs-cab h3{flex:1;font-size:16px}
.bs-cab button{border:0;background:var(--bg-soft);color:var(--text);border-radius:50%;width:32px;height:32px;font-size:15px}
.bs-badge{display:inline-block;min-width:44px;text-align:center;padding:5px 8px;border-radius:10px;color:#fff;font-weight:800;font-size:14px;text-shadow:0 1px 2px rgba(0,0,0,.25);flex:none}
.bs-card{border:1px solid var(--border);border-radius:14px;padding:10px 12px;margin:8px 0;background:var(--bg-soft)}
.bs-card.sel{border-color:var(--primary-light)}
.bs-par{font-weight:700;font-size:14px}
.bs-par small,.bs-sub{color:var(--text-muted);font-weight:500;font-size:12px}
.bs-fila{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--border);font-size:13px}
.bs-fila:first-of-type{border-top:0}
.bs-fila .bs-eta{flex:1;min-width:0}
.bs-fila button,.bs-btn{border:0;border-radius:10px;background:var(--primary-light);color:#fff;font-weight:700;font-size:13px;padding:8px 10px;flex:none}
.bs-btn.sec{background:var(--bg);color:var(--text);border:1px solid var(--border)}
.bs-fila button.ico{background:var(--bg);color:var(--text);border:1px solid var(--border);padding:7px 9px}
.bs-ya{color:#16a34a}.bs-sin{color:var(--text-muted)}
.bs-op{display:flex;gap:10px;align-items:center}.bs-op .t{flex:1}.bs-op .m{font-size:18px;font-weight:800;text-align:right}
.bs-paso{display:flex;gap:10px;padding:8px 0;font-size:14px;border-top:1px solid var(--border)}
.bs-paso:first-of-type{border-top:0}.bs-paso .i{font-size:20px;width:26px;text-align:center;flex:none}
.bs-nota{color:var(--text-muted);font-size:12px;margin:8px 0}
.bs-acciones{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
#avisoBar{position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 64px);z-index:2200;display:none;flex-direction:column;gap:6px}
#avisoBar.activo{display:flex}
.av-it{background:#111827;color:#fff;border-radius:12px;padding:8px 10px;font-size:13px;display:flex;gap:8px;align-items:center;box-shadow:0 3px 14px rgba(0,0,0,.35)}
.av-it span{flex:1}.av-it button{border:0;background:rgba(255,255,255,.18);color:#fff;border-radius:8px;padding:5px 9px}
.bus-vivo.quieto{filter:grayscale(1);opacity:.7}
.bs-alerta{background:#fef3c7;color:#92400e;border-radius:10px;padding:8px 10px;font-size:12px;margin:6px 0}
`;document.head.appendChild(s);
const d=document.createElement('div');d.className='bs';d.id='busSheet';d.innerHTML='<div class="bs-cab"><h3 id="bsTit"></h3><button onclick="BUS.cerrar()" aria-label="Cerrar">✕</button></div><div id="bsCuerpo"></div>';document.body.appendChild(d);
const a=document.createElement('div');a.id='avisoBar';document.body.appendChild(a)}
function abrir(titulo,vistaId){css();vista=vistaId;$('bsTit').textContent=titulo;$('busSheet').classList.add('activo')}
function cerrar(){const s=$('busSheet');if(s)s.classList.remove('activo');vista=null;clearInterval(vistaTimer);vistaTimer=null;selPlan=null;if(capaBus)capaBus.clearLayers()}
function capa(){if(!capaBus)capaBus=L.layerGroup().addTo(map);return capaBus}
function programar(fn,ms){clearInterval(vistaTimer);vistaTimer=setInterval(()=>{if(document.visibilityState==='visible'&&!ocupado)fn()},ms)}

/* ---------- 3) paradas cerca de mí (con cuánto falta) ---------- */
async function paradasCerca(){
abrir('🚏 Paradas cerca de mí','cerca');$('bsCuerpo').innerHTML='<div class="bs-nota">Buscando paradas y colectivos…</div>';
try{await cargarRB()}catch(e){$('bsCuerpo').innerHTML='<div class="bs-nota">No se pudieron cargar los recorridos.</div>';return}
await pintarCerca();programar(pintarCerca,7000)}
function origen(){return posicionUsuario||(map.getCenter?[map.getCenter().lat,map.getCenter().lng]:CENTRO_SALTA)}
function candidatosCerca(o,radio,maxCl){
const c=[];
for(const cod in RB){const r=RB[cod];let b=null,bd=1e9;
for(const s of r.stops){const d=dist(o[0],o[1],s.lat,s.lng);if(d<bd){bd=d;b=s}}
if(b&&bd<=radio)c.push({cod,s:b,d:bd})}
c.sort((x,y)=>x.d-y.d);
const cl=[];
for(const it of c){let g=cl.find(x=>dist(x.lat,x.lng,it.s.lat,it.s.lng)<70);
if(!g){if(cl.length>=maxCl)continue;g={lat:it.s.lat,lng:it.s.lng,d:it.d,items:[]};cl.push(g)}
g.items.push(it)}
return cl}
async function pintarCerca(){
if(vista!=='cerca'||ocupado)return;ocupado=true;
try{
const o=origen(),radio=600;let cl=candidatosCerca(o,radio,6);
if(!cl.length)cl=candidatosCerca(o,1500,6);
if(!cl.length){$('bsCuerpo').innerHTML='<div class="bs-nota">No hay paradas de SAETA a menos de 1,5 km.</div>';return}
const cods=[...new Set(cl.flatMap(g=>g.items.map(i=>i.cod)))];
let data=null,error=false;try{data=await traerBuses(cods)}catch(e){error=true}
if(vista!=='cerca')return;
cl.forEach(g=>g.items.forEach(i=>{i.e=data?etaParada(i.cod,i.s,data):null}));
let h='';if(!posicionUsuario)h+='<div class="bs-nota">Todavía no tengo tu ubicación: uso el centro del mapa.</div>';
if(error)h+='<div class="bs-alerta">⚠️ Sin conexión con el servidor en vivo. Muestro las paradas, sin tiempos.</div>';
cl.forEach((g,gi)=>{
const nom=nombreParada(g.items[0].s);
g.items.sort((a,b)=>(a.e?a.e.seg:1e9)-(b.e?b.e.seg:1e9));
h+=`<div class="bs-card"><div class="bs-par">🚏 ${esc(nom)} <small>· a ${mTxt(g.d)} (${minTxt(g.d/CAMINA)} a pie)</small> <button class="bs-btn sec" style="padding:3px 8px;font-size:12px;margin-left:4px" onclick="BUS.irParada(${g.lat},${g.lng})">📍 Ver</button></div>`;
g.items.forEach(i=>{const apurate=i.e&&!i.e.llegando&&i.e.min>0&&i.e.min*CAMINA<g.d*0.7&&g.d>150?' <small style="color:#b45309">· no llegás caminando</small>':'';
h+=`<div class="bs-fila">${badge(i.cod)}<div class="bs-eta">${etaTxt(i.e)}${apurate}${nombreLinea(i.cod)!==corto(i.cod)?`<div class="bs-sub">${esc(nombreLinea(i.cod))}</div>`:''}</div><button onclick="BUS.avisarLlega('${i.cod}',${i.s.k})" title="Avisarme">🔔</button></div>`});
h+='</div>'});
h+='<div class="bs-nota">Los minutos son una estimación con la posición real de cada colectivo (se actualiza cada 7 s). Pueden variar con el tránsito.</div>';
$('bsCuerpo').innerHTML=h;
}catch(e){console.warn('cerca',e)}finally{ocupado=false}}
function irParada(lat,lng){map.setView([lat,lng],17);capa().clearLayers();L.circleMarker([lat,lng],{radius:11,color:'#2563eb',weight:3,fillColor:'#fff',fillOpacity:1}).addTo(capa());$('busSheet').scrollTop=0}

/* ---------- 2) cómo llegar en colectivo ---------- */
function paradasCercaDe(p,radio,max){
const out={};
for(const cod in RB){const r=RB[cod],l=[];
for(const s of r.stops){const d=dist(p[0],p[1],s.lat,s.lng);if(d<=radio)l.push({s,w:d})}
if(l.length){l.sort((a,b)=>a.w-b.w);out[cod]=l.slice(0,max)}}
return out}
function rapida(a,b){const dy=(a.lat-b.lat)*111000,dx=(a.lng-b.lng)*100500;return Math.sqrt(dx*dx+dy*dy)}
function viaje(r,a,b){let m=b.d-a.d;if(m<0){if(!r.loop)return null;m+=r.total}return m}
function planear(o,d){
const RAD=800,res=[];
const A=paradasCercaDe(o,RAD,4),B=paradasCercaDe(d,RAD,4);
const directo=dist(o[0],o[1],d[0],d[1]);
/* directo */
for(const cod in A){if(!B[cod])continue;const r=RB[cod];let best=null;
for(const a of A[cod])for(const b of B[cod]){if(a.s===b.s)continue;const m=viaje(r,a.s,b.s);if(m==null||m<150)continue;
const costo=a.w/CAMINA+b.w/CAMINA+m/BUS_M_MIN+7;
if(!best||costo<best.costo)best={costo,legs:[{cod,a:a.s,b:b.s,m}],w1:a.w,w2:b.w,wt:0}}
if(best)res.push(best)}
/* con un transbordo */
const sufMin={};
function sufijo(cod){if(sufMin[cod])return sufMin[cod];const r=RB[cod],bs=B[cod]||[];
const arr=r.stops.map(y=>{let best=null;for(const b of bs){const m=viaje(r,y,b.s);if(m==null||m<120||y===b.s)continue;const c=b.w/CAMINA+m/BUS_M_MIN;if(!best||c<best.c)best={c,b,m}}return best});
sufMin[cod]=arr;return arr}
const vistos=new Set();
for(const c1 in A){const r1=RB[c1];
for(const a of A[c1].slice(0,3)){
for(const x of r1.stops){const m1=viaje(r1,a.s,x);if(m1==null||m1<250||m1>25000)continue;
for(const c2 in B){if(c2===c1)continue;const r2=RB[c2],suf=sufijo(c2);
for(const y of r2.stops){const sf=suf[y.k];if(!sf)continue;const wt=rapida(x,y);if(wt>260)continue;
const costo=a.w/CAMINA+m1/BUS_M_MIN+wt/CAMINA+sf.c+14;
const key=c1+'>'+c2;
const prev=vistos.has(key)?res.find(q=>q.key===key):null;
const cand={costo,key,legs:[{cod:c1,a:a.s,b:x,m:m1},{cod:c2,a:y,b:sf.b.s,m:sf.m}],w1:a.w,w2:sf.b.w,wt};
if(prev){if(costo<prev.costo)Object.assign(prev,cand)}else{vistos.add(key);res.push(cand)}}}}}}
res.sort((p,q)=>p.costo-q.costo);
const directos=res.filter(x=>x.legs.length===1),trans=res.filter(x=>x.legs.length===2);
let sal=directos.slice(0,3);
const mejor=sal.length?sal[0].costo:1e9;
trans.filter(t=>sal.length<4&&(t.costo<mejor-3||!sal.length||t.costo<mejor+12)).slice(0,sal.length?1:3).forEach(t=>{if(sal.length<4)sal.push(t)});
/* quitar variantes casi iguales de la misma línea (misma ref) */
const vr=new Set();sal=sal.filter(x=>{const k=x.legs.map(l=>refDeCod(l.cod)||l.cod).join('+');if(vr.has(k))return false;vr.add(k);return true});
sal.sort((p,q)=>p.costo-q.costo);
return{opciones:sal,aPie:directo<=1500?directo:null}}
async function planificar(lat,lng,nombre){
const o=posicionUsuario||null;
abrir('🚌 Cómo llegar en colectivo','plan');
$('bsCuerpo').innerHTML='<div class="bs-nota">Calculando las mejores combinaciones…</div>';
try{await cargarRB()}catch(e){$('bsCuerpo').innerHTML='<div class="bs-nota">No se pudieron cargar los recorridos.</div>';return}
const origenPt=o||origen();
await new Promise(r=>setTimeout(r,30));
const t0=Date.now();const R=planear(origenPt,[lat,lng]);
selPlan={o:origenPt,d:[lat,lng],nombre:nombre||'tu destino',R,sel:-1,usuario:!!o};
pintarPlan();console.log('plan',Date.now()-t0,'ms')}
function cardPlan(op,i){
const legs=op.legs;const viajeMin=legs.reduce((s,l)=>s+l.m/BUS_M_MIN,0);
const caminar=(op.w1+op.w2+op.wt)/CAMINA;const total=op.costo;
const lin=legs.map(l=>`${badge(l.cod)}`).join(' → ');
const paradas=legs.reduce((s,l)=>s+Math.max(1,l.b.k-l.a.k),0);
return`<div class="bs-card${selPlan.sel===i?' sel':''}" onclick="BUS.verOpcion(${i})"><div class="bs-op"><div class="t">${lin}<div class="bs-sub">🚶 ${minTxt(caminar)} a pie · 🚌 ${minTxt(viajeMin)} en viaje${legs.length>1?' · 1 transbordo':''}</div><div class="bs-sub" id="bsProx${i}"></div></div><div class="m" id="bsTot${i}">${minTxt(total)}</div></div></div>`}
function pintarPlan(){
const P=selPlan;if(!P)return;const R=P.R;let h='';
if(!P.usuario)h+='<div class="bs-nota">No tengo tu ubicación: calculo desde el centro del mapa.</div>';
h+=`<div class="bs-sub" style="margin:2px 0 4px">Hasta <b>${esc(P.nombre)}</b></div>`;
if(R.aPie!=null&&R.aPie<1200)h+=`<div class="bs-card"><div class="bs-op"><div class="t"><b>🚶 Caminando</b><div class="bs-sub">${mTxt(R.aPie)} en línea recta</div></div><div class="m">${minTxt(R.aPie*1.25/CAMINA)}</div></div></div>`;
if(!R.opciones.length)h+='<div class="bs-card">No encontré un colectivo que te acerque a menos de 800 m de ese lugar. Probá con "Cómo llegar" para ir en auto o a pie.</div>';
else h+=R.opciones.map((op,i)=>cardPlan(op,i)).join('');
h+='<div class="bs-nota">Tiempo total estimado = caminata + espera + viaje. Tocá una opción para ver los pasos en el mapa.</div>';
$('bsCuerpo').innerHTML=h}
async function verOpcion(i){
const P=selPlan;if(!P)return;const op=P.R.opciones[i];if(!op)return;P.sel=i;
const L1=op.legs[0];
const pasos=[];
const calleA=nombreParada(L1.a);
pasos.push(`<div class="bs-paso"><div class="i">🚶</div><div>Caminá <b>${mTxt(op.w1)}</b> (${minTxt(op.w1/CAMINA)}) hasta la parada <b>${esc(calleA)}</b></div></div>`);
op.legs.forEach((l,k)=>{
const n=Math.max(1,l.b.k-l.a.k);
pasos.push(`<div class="bs-paso"><div class="i">🚌</div><div>Tomá la línea ${badge(l.cod)}${nombreLinea(l.cod)!==corto(l.cod)?` <span class="bs-sub">${esc(nombreLinea(l.cod))}</span>`:''}<div id="bsEta${k}" class="bs-sub">Buscando colectivos…</div><div class="bs-sub">Viajás unas ${n} paradas (~${minTxt(l.m/BUS_M_MIN)}).</div></div></div>`);
pasos.push(`<div class="bs-paso"><div class="i">🔽</div><div>Bajate en <b>${esc(nombreParada(l.b))}</b>${k<op.legs.length-1?`. Caminá <b>${mTxt(op.wt)}</b> hasta la parada de la ${badge(op.legs[k+1].cod)} en <b>${esc(nombreParada(op.legs[k+1].a))}</b>`:''}</div></div>`)});
const lastB=op.legs[op.legs.length-1].b;
pasos.push(`<div class="bs-paso"><div class="i">🏁</div><div>Caminá <b>${mTxt(op.w2)}</b> (${minTxt(op.w2/CAMINA)}) hasta ${esc(P.nombre)}</div></div>`);
let h=`<div class="bs-acciones"><button class="bs-btn sec" onclick="BUS.volverPlan()">← Opciones</button><button class="bs-btn" onclick="BUS.avisarLlega('${L1.cod}',${L1.a.k})">🔔 Avisarme cuando llegue</button><button class="bs-btn" onclick="BUS.avisarBajar(${i})">🔔 Avisarme para bajar</button></div>`;
h+=pasos.join('')+'<div class="bs-nota">Las caminatas se muestran en línea recta (aproximadas). El tiempo de llegada se actualiza solo.</div>';
$('bsCuerpo').innerHTML=h;
dibujarPlan(op);
await refrescarOpcion(i);programar(()=>refrescarOpcion(i),6000)}
function volverPlan(){clearInterval(vistaTimer);vistaTimer=null;if(capaBus)capaBus.clearLayers();if(selPlan)selPlan.sel=-1;pintarPlan();refrescarProx()}
function dibujarPlan(op){
const c=capa();c.clearLayers();const P=selPlan;
const seg=(l)=>{const r=RB[l.cod];let i0=l.a.i,i1=l.b.i;let pts;
if(i1>=i0)pts=r.pts.slice(i0,i1+1);else pts=r.pts.slice(i0).concat(r.pts.slice(0,i1+1));return pts};
const all=[P.o,P.d];
c.addLayer(L.polyline([P.o,[op.legs[0].a.lat,op.legs[0].a.lng]],{color:'#6b7280',weight:4,dashArray:'2 8',interactive:false}));
op.legs.forEach((l,k)=>{const pts=seg(l);pts.forEach(p=>all.push(p));
c.addLayer(L.polyline(pts,{color:'#fff',weight:10,opacity:.9,interactive:false}));
c.addLayer(L.polyline(pts,{color:colorCod(l.cod),weight:6,opacity:1,interactive:false}));
[[l.a,'🟢 Subís'],[l.b,'🔴 Bajás']].forEach(([s,t])=>c.addLayer(L.circleMarker([s.lat,s.lng],{radius:9,color:colorCod(l.cod),weight:4,fillColor:'#fff',fillOpacity:1}).bindTooltip(`${t} · ${esc(corto(l.cod))}`,{permanent:true,direction:'top',offset:[0,-8]})));
if(k<op.legs.length-1){const n=op.legs[k+1].a;c.addLayer(L.polyline([[l.b.lat,l.b.lng],[n.lat,n.lng]],{color:'#6b7280',weight:4,dashArray:'2 8',interactive:false}))}});
const lb=op.legs[op.legs.length-1].b;
c.addLayer(L.polyline([[lb.lat,lb.lng],P.d],{color:'#6b7280',weight:4,dashArray:'2 8',interactive:false}));
c.addLayer(L.marker(P.d,{icon:L.divIcon({className:'',html:'<div style="font-size:30px;line-height:30px">🏁</div>',iconSize:[30,30],iconAnchor:[6,28]}),interactive:false}));
try{map.fitBounds(L.latLngBounds(all),{paddingTopLeft:[30,90],paddingBottomRight:[30,Math.round(window.innerHeight*0.45)]})}catch(e){}}
let busesOpc=null;
async function refrescarOpcion(i){
if(vista!=='plan'||!selPlan||selPlan.sel!==i||ocupado)return;ocupado=true;
try{const op=selPlan.R.opciones[i];const cods=[...new Set(op.legs.map(l=>l.cod))];
const data=await traerBuses(cods);if(!selPlan||selPlan.sel!==i)return;
op.legs.forEach((l,k)=>{const e=etaParada(l.cod,l.a,data);const el=$('bsEta'+k);
if(el)el.innerHTML=k===0?'🕒 '+etaTxt(e):'🕒 Colectivos de esta línea: '+(e?`el más cercano llegaría a esa parada en ≈ ${Math.max(1,Math.round(e.min))} min`:'ninguno en camino ahora');
});
/* dibujar colectivos */
if(busesOpc)busesOpc.forEach(m=>capa().removeLayer(m));busesOpc=[];
op.legs.forEach(l=>{const d=data[l.cod];if(!d||!d.posiciones)return;d.posiciones.forEach(b=>{if(b.latitud==null||b._pos==null)return;
if(b._pos>l.b.d+50&&!RB[l.cod].loop)return;
const ic=iconoBus(b,colorCod(l.cod),String(b.interno),false);
const m=L.marker([b.latitud,b.longitud],{icon:ic,zIndexOffset:3600}).bindPopup(popupBus(b,l.cod,0,null));capa().addLayer(m);busesOpc.push(m)})});
}catch(e){const el=$('bsEta0');if(el)el.textContent='⚠️ Sin conexión con el servidor en vivo'}
finally{ocupado=false}}
async function refrescarProx(){
const P=selPlan;if(!P||vista!=='plan')return;
try{const cods=[...new Set(P.R.opciones.flatMap(o=>o.legs.slice(0,1).map(l=>l.cod)))];if(!cods.length)return;
const data=await traerBuses(cods);
P.R.opciones.forEach((op,i)=>{const e=etaParada(op.legs[0].cod,op.legs[0].a,data);const el=$('bsProx'+i);
if(el)el.innerHTML='🕒 '+(e?(e.llegando?'Llegando a la parada':'Próximo en ≈ '+Math.max(1,Math.round(e.min))+' min'):'Sin colectivos en camino');
const t=$('bsTot'+i);if(t&&e)t.textContent=minTxt(op.costo-7+(e.llegando?0:Math.max(0,e.min-op.w1/CAMINA)))})}catch(e){}}
const _pp=pintarPlan;pintarPlan=function(){_pp();setTimeout(refrescarProx,0)};

/* ---------- 4) avisos ---------- */
let avisos=[];let avTimer=null,wl=null;
function guardarAvisos(){try{localStorage.setItem('salta_avisos',JSON.stringify(avisos))}catch(e){}}
function cargarAvisos(){try{const a=JSON.parse(localStorage.getItem('salta_avisos')||'[]');avisos=a.filter(x=>Date.now()-x.t<3*3600*1000)}catch(e){avisos=[]}
if(avisos.length){css();pintarAvisos();iniciarAv()}}
function pintarAvisos(){css();const b=$('avisoBar');if(!b)return;
b.classList.toggle('activo',avisos.length>0);
b.innerHTML=avisos.map((a,i)=>`<div class="av-it"><span>🔔 ${esc(a.txt)}${a.estado?' · '+esc(a.estado):''}</span><button onclick="BUS.quitarAviso(${i})">✕</button></div>`).join('')}
function quitarAviso(i){avisos.splice(i,1);guardarAvisos();pintarAvisos();if(!avisos.length)detenerAv()}
function pedirPermiso(){try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission()}catch(e){}}
function iniciarAv(){if(avTimer)return;avTimer=setInterval(chequearAvisos,6000);chequearAvisos();
try{if('wakeLock' in navigator)navigator.wakeLock.request('screen').then(w=>{wl=w}).catch(()=>{})}catch(e){}}
function detenerAv(){clearInterval(avTimer);avTimer=null;try{if(wl){wl.release();wl=null}}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&avisos.length){chequearAvisos();try{if('wakeLock' in navigator&&!wl)navigator.wakeLock.request('screen').then(w=>{wl=w}).catch(()=>{})}catch(e){}}});
function avisarLlega(cod,k,umbral){
if(!RB||!RB[cod]||!RB[cod].stops[k])return;const s=RB[cod].stops[k];umbral=umbral||3;
if(avisos.some(a=>a.tipo==='llega'&&a.cod===cod&&a.k===k)){mostrarNotificacion('Ya tenés ese aviso activo','info',2000);return}
avisos.push({tipo:'llega',cod,k,umbral,t:Date.now(),txt:`Línea ${corto(cod)} en ${nombreParada(s)} (a ${umbral} min)`});
guardarAvisos();pintarAvisos();pedirPermiso();iniciarAv();
mostrarNotificacion(`🔔 Te aviso cuando la ${corto(cod)} esté a ${umbral} min`,'exito',3000)}
function avisarBajar(i){
const P=selPlan;if(!P)return;const op=P.R.opciones[i];const lb=op.legs[op.legs.length-1].b;
const nom=nombreParada(lb);
avisos=avisos.filter(a=>a.tipo!=='bajar');
avisos.push({tipo:'bajar',lat:lb.lat,lng:lb.lng,t:Date.now(),pre:false,txt:`Bajar en ${nom}`});
guardarAvisos();pintarAvisos();pedirPermiso();iniciarAv();
mostrarNotificacion(`🔔 Te aviso cuando estés llegando a ${nom}`,'exito',3000)}
function beep(){try{const c=new (window.AudioContext||window.webkitAudioContext)();[0,0.25,0.5].forEach(t=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=880;g.gain.value=0.25;o.connect(g);g.connect(c.destination);o.start(c.currentTime+t);o.stop(c.currentTime+t+0.15)})}catch(e){}}
function sonar(titulo,cuerpo){
try{if(navigator.vibrate)navigator.vibrate([400,150,400,150,800])}catch(e){}
beep();mostrarNotificacion('🔔 '+titulo+(cuerpo?' · '+cuerpo:''),'exito',8000);
try{if('speechSynthesis' in window){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(titulo+'. '+(cuerpo||''));u.lang='es-AR';speechSynthesis.speak(u)}}catch(e){}
try{if('Notification' in window&&Notification.permission==='granted'){
if(navigator.serviceWorker&&navigator.serviceWorker.ready)navigator.serviceWorker.ready.then(r=>r.showNotification(titulo,{body:cuerpo||'',icon:'icons/icon-192.png',vibrate:[400,150,400],tag:'bus-aviso',renotify:true})).catch(()=>{});
else new Notification(titulo,{body:cuerpo||''})}}catch(e){}}
let chequeando=false;
async function chequearAvisos(){
if(chequeando||!avisos.length)return;chequeando=true;
try{
await cargarRB();
const quitar=[];
const llega=avisos.filter(a=>a.tipo==='llega');
if(llega.length){let data=null;try{data=await traerBuses([...new Set(llega.map(a=>a.cod))])}catch(e){}
if(data)llega.forEach(a=>{const s=RB[a.cod].stops[a.k];const e=etaParada(a.cod,s,data);
a.estado=e?(e.llegando?'llegando':'≈ '+Math.max(1,Math.round(e.min))+' min'):'sin colectivos en camino';
if(e&&(e.llegando||e.min<=a.umbral)){sonar(`Llega la ${corto(a.cod)}`,e.llegando?`Ya está llegando a ${nombreParada(s)}`:`Está a ≈ ${Math.max(1,Math.round(e.min))} min de ${nombreParada(s)}`);quitar.push(a)}})}
avisos.filter(a=>a.tipo==='bajar').forEach(a=>{if(!posicionUsuario)return;const d=dist(posicionUsuario[0],posicionUsuario[1],a.lat,a.lng);
a.estado='a '+mTxt(d);
if(d<130){sonar('¡Bajate en la próxima parada!',a.txt);quitar.push(a)}
else if(d<450&&!a.pre){a.pre=true;sonar('Ya casi llegás',a.txt+' · preparate para bajar')}});
if(quitar.length){avisos=avisos.filter(a=>!quitar.includes(a));if(!avisos.length)detenerAv()}
guardarAvisos();pintarAvisos();
}catch(e){console.warn('avisos',e)}finally{chequeando=false}}

/* ---------- 1) tiempo de llegada en la parada del mapa (línea abierta) ---------- */
async function etaPopup(ref,lat,lng,elId){
try{await cargarRB();const cods=(REDBUS&&REDBUS.alias&&REDBUS.alias[ref])||[];
let best=null;
cods.forEach(cod=>{const r=RB[cod];if(!r)return;r.stops.forEach(s=>{const d=dist(lat,lng,s.lat,s.lng);if(d<60&&(!best||d<best.d))best={cod,s,d}})});
const el=$(elId);if(!el)return;
if(!best){el.innerHTML='<small>Sin datos de tiempo para esta parada.</small>';return}
const data=await traerBuses([best.cod]);const e=etaParada(best.cod,best.s,data);
const el2=$(elId);if(el2)el2.innerHTML=`<div style="margin-top:6px">🕒 ${etaTxt(e)}</div><button class="bs-btn" style="margin-top:6px" onclick="BUS.avisarLlega('${best.cod}',${best.s.k})">🔔 Avisarme</button>`
}catch(e){const el=$(elId);if(el)el.innerHTML='<small>⚠️ No se pudo calcular el tiempo.</small>'}}

window.BUS={paradasCerca,planificar,verOpcion,volverPlan,cerrar,avisarLlega,avisarBajar,quitarAviso,irParada,etaPopup,
  _t:{armarRB,proyectar,planear,etaParada,set:(x)=>{RB=x}}};
cargarAvisos();
})();
