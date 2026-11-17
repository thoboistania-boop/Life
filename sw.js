// Garde une copie des fichiers de l'appli pour l'ouvrir même avec une connexion faible.
// Réseau d'abord, pour toujours avoir la dernière version quand internet est là.
const CACHE = 'life-v13';

// Notifications envoyées par la fonction Supabase life-push.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Life', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined, data: { url: './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
const SHELL = ['./', './index.html', './planner.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Fichiers externes à version fixe (bibliothèque Supabase, polices) : copie locale d'abord, ils ne changent jamais.
const STATIC_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (STATIC_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Fichiers de l'appli : réseau d'abord pour avoir la dernière version,
  // mais si le réseau met plus de 2,5 s, on ouvre la copie locale (la nouvelle version servira la fois suivante).
  e.respondWith(new Promise(resolve => {
    let done = false;
    const net = fetch(e.request)
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; });
    const timer = setTimeout(() => caches.match(e.request).then(hit => { if (hit && !done) { done = true; resolve(hit); } }), 2500);
    net.then(r => { clearTimeout(timer); if (!done) { done = true; resolve(r); } })
      .catch(() => { clearTimeout(timer); caches.match(e.request).then(hit => { if (!done) { done = true; resolve(hit || Response.error()); } }); });
  }));
});
