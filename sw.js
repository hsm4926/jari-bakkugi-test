/* 서비스 워커 — 한 번 열어 두면 인터넷 없이도 돌아가게 해 줍니다.
   버전이 바뀌면 CACHE 이름이 바뀌므로 예전 것은 통째로 버려집니다. */
const VERSION = '1.13.0-0902-234537';
const CACHE = 'jari-test-' + VERSION;
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=1.13.0-0902-234537",
  "./assets/sounds/click.wav?v=1.13.0-0902-234537",
  "./assets/sounds/crack.wav?v=1.13.0-0902-234537",
  "./assets/sounds/hatch.mp3?v=1.13.0-0902-234537",
  "./assets/sounds/page.wav?v=1.13.0-0902-234537",
  "./assets/sounds/reveal.mp3?v=1.13.0-0902-234537",
  "./assets/sounds/shuffle-end.wav?v=1.13.0-0902-234537",
  "./assets/sounds/tick.wav?v=1.13.0-0902-234537",
  "./assets/sounds/whoosh.wav?v=1.13.0-0902-234537",
  "./assets/sprites/desk-icon.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/01.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/02.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/03.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/04.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/05.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/06.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/07.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/08.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/09.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/10.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/11.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/12.png?v=1.13.0-0902-234537",
  "./assets/sprites/egg/13.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/burst01.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/burst02.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/burst03.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/burst04.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/burst05.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/burst06.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/rise01.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/rise02.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/rise03.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/rise04.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/rise05.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/rise06.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/rise07.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/rise08.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/rise09.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/rise10.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/rise11.png?v=1.13.0-0902-234537",
  "./assets/sprites/fx/rise12.png?v=1.13.0-0902-234537",
  "./assets/sprites/icon.png?v=1.13.0-0902-234537",
  "./assets/sprites/mong/a.png?v=1.13.0-0902-234537",
  "./assets/sprites/mong/b.png?v=1.13.0-0902-234537",
  "./assets/sprites/mong/beauty.png?v=1.13.0-0902-234537",
  "./assets/sprites/mong/c.png?v=1.13.0-0902-234537",
  "./assets/sprites/mong/cute.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy1-0.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy1-1.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy1-2.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy1-3.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy1-4.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy1-5.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy1-6.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy1-7.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy1.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy2-0.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy2-1.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy2-2.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy2-3.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy2-4.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy2-5.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy2-6.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy2-7.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/boy2.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl1-0.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl1-1.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl1-2.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl1-3.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl1-4.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl1-5.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl1-6.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl1-7.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl1.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl2-0.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl2-1.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl2-2.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl2-3.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl2-4.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl2-5.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl2-6.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl2-7.png?v=1.13.0-0902-234537",
  "./assets/sprites/student/girl2.png?v=1.13.0-0902-234537",
  "./config.js?v=1.13.0-0902-234537",
  "./css/fonts.css?v=1.13.0-0902-234537",
  "./css/style.css?v=1.13.0-0902-234537",
  "./icons/icon-180.png?v=1.13.0-0902-234537",
  "./icons/icon-192.png?v=1.13.0-0902-234537",
  "./icons/icon-512.png?v=1.13.0-0902-234537",
  "./icons/icon-maskable-512.png?v=1.13.0-0902-234537",
  "./js/arrange.js?v=1.13.0-0902-234537",
  "./js/audio.js?v=1.13.0-0902-234537",
  "./js/editor.js?v=1.13.0-0902-234537",
  "./js/history.js?v=1.13.0-0902-234537",
  "./js/layout.js?v=1.13.0-0902-234537",
  "./js/layouts.js?v=1.13.0-0902-234537",
  "./js/main.js?v=1.13.0-0902-234537",
  "./js/panel.js?v=1.13.0-0902-234537",
  "./js/presets.js?v=1.13.0-0902-234537",
  "./js/render.js?v=1.13.0-0902-234537",
  "./js/seats.js?v=1.13.0-0902-234537",
  "./js/shuffle.js?v=1.13.0-0902-234537",
  "./js/state.js?v=1.13.0-0902-234537",
  "./js/util.js?v=1.13.0-0902-234537",
  "./version.js?v=1.13.0-0902-234537"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 인터넷 응답을 기다려 주는 시간 (밀리초). 이 안에 안 오면 캐시로 보여 줍니다. */
const NET_TIMEOUT = 3500;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); },
                 (e) => { clearTimeout(t); reject(e); });
  });
}

async function pageFirst(req) {
  try {
    const res = await withTimeout(fetch(req), NET_TIMEOUT);
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put('./index.html', copy));
    return res;
  } catch (err) {
    const hit = await caches.match('./index.html');
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 화면(html)은 늘 인터넷을 먼저 봅니다 — 새 버전이 바로 들어오게 하려고.
  // 다만 학교 인터넷이 «끊긴 건 아닌데 응답이 없는» 상태일 때 하염없이 기다리면
  // 화면이 아예 안 뜹니다. 그래서 NET_TIMEOUT 만큼만 기다리고 캐시로 넘어갑니다.
  const isPage = req.mode === 'navigate' || (req.destination === 'document');
  if (isPage) {
    e.respondWith(pageFirst(req));
    return;
  }

  // 나머지는 주소에 ?v=버전 이 붙어 있어 캐시를 먼저 봐도 안전합니다
  e.respondWith(
    caches.match(req).then((hit) => hit || withTimeout(fetch(req), NET_TIMEOUT).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
