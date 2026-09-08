const CACHE="caminho-v131";const CORE=["./","index.html","styles.css","app.js","manifest.webmanifest","questions.json","journey.json","teaching.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE))));
self.addEventListener("fetch",e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));