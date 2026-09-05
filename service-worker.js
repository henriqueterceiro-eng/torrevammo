// Service Worker do Vammo Colaborador
// Faz cache dos assets pra abrir offline + sobreviver a quedas de rede
const CACHE_VERSION = 'vammo-colab-v91';   // v91: checkout com timeout — botao nunca mais fica inerte
const CORE_ASSETS = [
  '/',
  '/colab',
  // /tiles.js e DEPENDENCIA DURA do mapa desde 02/09/2026: sem ele, VammoTiles nao existe e o app
  // fica sem mapa. Precacheado no install pra funcionar offline igual ao resto.
  '/tiles.js',
  '/manifest.webmanifest',
  '/icon-192.svg',
  '/icon-512.svg'
];
const LEAFLET_CDN = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];
// ⚠ 04/09/2026 — o SDK do Firebase e a dependencia MAIS critica do app (sem ele nao ha listener de
// chamados NEM de bases) e era a unica grande que NAO era precacheada: o Leaflet estava aqui, o
// Firebase nao. Motorista no 4G ruim que abrisse o app sem conseguir baixar isto ficava o turno
// inteiro sem bases ("nao tem base para descarregar") e sem sync. Agora entra no precache.
const FIREBASE_CDN = [
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(c => Promise.all(
      // addAll e tudo-ou-nada: um CDN fora do ar abortaria o install INTEIRO e o SW nunca ativaria.
      // Um a um, com falha tolerada, garante que o que der pra cachear seja cacheado.
      CORE_ASSETS.concat(LEAFLET_CDN).concat(FIREBASE_CDN).map(u => c.add(u).catch(e => console.warn('[sw] nao cacheou', u, e)))
    )).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Strategy:
// - Tiles (OSM/ESRI/TomTom), Firebase, OSRM, TomTom API: SEMPRE rede direto (não cacheia — dados vivos)
// - HTML / navegação: NETWORK-FIRST (sempre pega a versão nova online; cai pro cache só offline)
//   → evita o app ficar preso numa versão antiga do HTML após cada deploy
// - Demais assets (JS, CSS, ícones): cache-first (rápido, sobrevive a queda)
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  // Não interfere em dados ao vivo
  const isLiveData = (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('tomtom.com') ||
    url.hostname.includes('project-osrm.org') ||
    url.hostname.includes('arcgisonline.com') ||
    url.hostname.includes('openstreetmap.org') ||   // 02/09/2026: virou o provedor de tile (CARTO passou a exigir API key)
    url.hostname.includes('basemaps.cartocdn.com')  // morto, mantido so pra nao reintroduzir cache se alguem voltar
  );
  if(isLiveData){ return; } // deixa o browser tratar normal

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if(isHTML){
    // Network-first COM TIMEOUT: tenta a rede por 3s (atualiza o cache), mas se demorar
    // ou falhar cai pro cache na hora — evita "tela branca/travada" em sinal ruim no campo.
    e.respondWith((async () => {
      const cachedPromise = caches.match(req).then(c => c || caches.match('/colab'));
      try {
        const resp = await Promise.race([
          fetch(req),
          new Promise((_, reject) => setTimeout(() => reject(new Error('net-timeout')), 3000))
        ]);
        if(resp && resp.status === 200){
          caches.open(CACHE_VERSION).then(c => c.put(req, resp.clone()));
          return resp;
        }
        return (await cachedPromise) || resp;
      } catch(_){
        const cached = await cachedPromise;
        if(cached) return cached;
        return fetch(req); // sem cache e sem rede: última tentativa sem timeout
      }
    })());
    return;
  }

  // Demais assets: cache-first
  e.respondWith(
    caches.match(req).then(cached => {
      if(cached) return cached;
      return fetch(req).then(resp => {
        // Cacheia respostas válidas pra próxima
        if(resp && resp.status === 200 && resp.type === 'basic'){
          const clone = resp.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() => {
        // Offline: tenta servir index do cache
        if(req.mode === 'navigate') return caches.match('/colab');
      });
    })
  );
});

// Notificação quando o gestor manda chamado (futuro: push real via Firebase Cloud Messaging)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for(const c of list){ if(c.url.includes('/colab')){ return c.focus(); } }
      return self.clients.openWindow('/colab');
    })
  );
});
