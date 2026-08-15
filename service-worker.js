// Service Worker do Vammo Colaborador
// Faz cache dos assets pra abrir offline + sobreviver a quedas de rede
const CACHE_VERSION = 'vammo-colab-v73';
const CORE_ASSETS = [
  '/',
  '/colab',
  '/manifest.webmanifest',
  '/icon-192.svg',
  '/icon-512.svg'
];
const LEAFLET_CDN = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(c => c.addAll(CORE_ASSETS.concat(LEAFLET_CDN))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Strategy:
// - Tiles (TomTom/CARTO/ESRI), Firebase, OSRM, TomTom API: SEMPRE rede direto (não cacheia — dados vivos)
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
    url.hostname.includes('basemaps.cartocdn.com')
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
