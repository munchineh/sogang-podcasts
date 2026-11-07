// Sogang podcast service worker (6 Nov, cl_224). build_site.py writes this file with the site's build stamp, so every
// publish installs a new worker. Only the app page itself (a navigation to the site's own address) is answered from the
// phone: audio, data files, reports and analytics go to the network exactly as before (the page keeps its data files per
// build itself). Anything unexpected falls back to the network.
const BUILD = "79c7ef2b7cac", SHELL = "sgshell-" + BUILD;
const SCOPE = new URL(self.registration.scope).pathname;          // /sogang-podcasts/

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    // keep this build's page only: GitHub Pages can lag a few seconds behind a push, so check the stamp and retry
    for (let i = 0; i < 6; i++) {
      try {
        const r = await fetch(SCOPE, { cache: "reload" });
        if (r.ok && (await r.clone().text()).includes('data-build="' + BUILD + '"')) {
          await (await caches.open(SHELL)).put(SCOPE, r);
          return self.skipWaiting();
        }
      } catch (x) {}
      await new Promise((ok) => setTimeout(ok, 5000));
    }
    throw new Error("the page for build " + BUILD + " isn't available yet");   // stays on the old worker; retried later
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("sgshell-") && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const q = e.request;
  if (q.method !== "GET" || q.mode !== "navigate") return;
  const u = new URL(q.url);
  if (u.origin !== location.origin || (u.pathname !== SCOPE && u.pathname !== SCOPE + "index.html")) return;
  e.respondWith((async () => {
    try { const hit = await (await caches.open(SHELL)).match(SCOPE); if (hit) return hit; } catch (x) {}
    return fetch(q);
  })());
});
