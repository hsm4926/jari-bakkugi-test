/* 여기저기서 쓰는 작은 도구들 */
'use strict';

const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/** 새 DOM 요소 만들기: el('div', {class:'x'}, [자식...]) */
function el(tag, attrs, children) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'style' && typeof attrs[k] === 'object') Object.assign(n.style, attrs[k]);
    else if (k === 'text') n.textContent = attrs[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  }
  if (children) [].concat(children).forEach(c => c && n.appendChild(c));
  return n;
}

/**
 * 파일 주소 뒤에 프로그램 버전을 붙입니다.
 *
 * 브라우저는 '주소가 같으면 같은 파일' 이라고 보고 예전에 받아 둔 것을 다시 씁니다.
 * 그래서 프로그램을 새로 받아도 그림·소리·코드가 옛 것 그대로인 일이 생깁니다.
 * 주소 끝에 ?v=버전 을 붙이면 버전이 오를 때마다 '다른 주소' 가 되어
 * 브라우저가 반드시 새 파일을 읽습니다.  (index.html 쪽은 배포할 때 자동으로 붙습니다)
 */
/** '#rrggbb' 색과 투명도를 합쳐 rgba() 문자열로 만듭니다.
    요소 전체에 opacity 를 걸면 테두리까지 같이 흐려지므로,
    색마다 투명도를 따로 주고 싶을 때 씁니다. */
function rgba(hex, a) {
  const h = String(hex || '').replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const v = parseInt(n, 16);
  if (n.length !== 6 || !isFinite(v)) return `rgba(0,0,0,${a})`;
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

function asset(path) {
  // '한 파일' 판에서는 그림·소리가 HTML 안에 통째로 들어 있습니다.
  // 그럴 때는 파일을 새로 부르지 않고 아래 지도에서 바로 꺼내 씁니다.
  if (window.__ASSETS && window.__ASSETS[path]) return window.__ASSETS[path];
  return path + '?v=' + APP_VERSION.number;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const snap  = (v, step) => Math.round(v / step) * step;
const uid   = (p) => p + '_' + Math.random().toString(36).slice(2, 9);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** 배열을 무작위로 섞어 새 배열로 돌려줍니다 (Fisher-Yates) */
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function debounce(fn, ms) {
  let t;
  return function () {
    clearTimeout(t);
    const args = arguments;
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}

/* ---- 화면 아래쪽에 잠깐 뜨는 알림 ---- */
let toastTimer = null;
function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms || 2200);
}

/* ---- 화면 위쪽 큰 배너 (학생들에게 보여주는 안내) ---- */
let bannerTimer = null;
function banner(msg, ms) {
  const b = $('#banner');
  if (!msg) { b.classList.add('hidden'); return; }
  $('#bannerText').textContent = msg;
  b.classList.remove('hidden');
  b.style.animation = 'none';
  void b.offsetWidth;
  b.style.animation = '';
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => b.classList.add('hidden'), ms);
}
