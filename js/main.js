/* 프로그램 시작 · 화면 확대/축소 · 단축키 · 선생님 전용 기능 */
'use strict';

/* ============================================================
   화면 확대 / 축소 / 이동
   ============================================================ */
const View = {
  zoom: 1,
  auto: true,
  panX: 0,
  panY: 0,

  /* ============================================================
     교실 뒤집기 (180°) — 학생 시점 ↔ 교사 시점
     ------------------------------------------------------------
     평소 화면은 **학생 시점**입니다. 아이들이 교실 TV 를 보면서
     «내 자리가 어디지?» 를 찾아야 하니, 칠판이 위에 있는 그림이 맞습니다.

     그런데 선생님은 교실 뒤에서 아이들을 마주 보고 서 있습니다.
     그때는 화면과 실제 교실이 좌우·앞뒤가 반대라 한눈에 안 들어옵니다.
     그래서 «교실 뒤집기» 를 누르면 **선생님이 보는 방향**으로 돌려 줍니다.

     ★ 화면을 통째로 rotate(180deg) 하지 않습니다.
       그러면 이름·번호·캐릭터까지 거꾸로 서서 읽을 수가 없습니다.
       대신 **놓이는 자리(좌표)만 뒤집어 다시 그립니다.**
       덕분에 글씨는 똑바로 서 있고 픽셀 그림도 그대로입니다.

     ⚠️ 저장하지 않습니다. «지금 잠깐 보는 시점» 이지 교실 설정이 아니라서,
        다음에 프로그램을 켰을 때 뒤집힌 채로 뜨면 오히려 당황합니다.
     ============================================================ */
  flipped: false,

  /**
   * 교실 안의 논리 좌표 → 화면에 실제로 놓을 자리.
   * 뒤집지 않았으면 그대로 돌려줍니다.
   *
   * @param w,h  그 물건의 크기. 사각형은 «왼쪽 위 모서리» 로 놓이므로,
   *             뒤집으면 반대쪽 모서리가 기준이 되어 크기만큼 빼 줘야 합니다.
   *             점(크기 없음)이면 0 을 넘기거나 생략하세요.
   */
  place(x, y, w, h) {
    if (!this.flipped) return { x: x, y: y };
    const r = State.data.room;
    return { x: r.w - x - (w || 0), y: r.h - y - (h || 0) };
  },

  toggleFlip() {
    this.flipped = !this.flipped;
    document.body.classList.toggle('flipped', this.flipped);
    $('#btnFlip').classList.toggle('active', this.flipped);
    Render.all();
    // 편집 중이었다면 골라 둔 것의 표시를 되살립니다 (다시 그리면서 지워집니다)
    if (Editor.mode) Editor.select(Editor.sel);
    Sound.play('page');
    banner(this.flipped ? '교사 시점 — 아이들을 마주 본 방향입니다'
                        : '학생 시점 — 아이들이 TV 로 보는 방향입니다', 2600);
  },

  /* ============================================================
     안전한 배율만 쓰기
     ------------------------------------------------------------
     픽셀 그림은 '원본 1픽셀 = 화면 정수 칸' 일 때만 반듯하게 나옵니다.
     배율이 0.9 처럼 어중간하면 2칸짜리와 3칸짜리 픽셀이 섞여 깨져 보이고,
     확대·축소하는 도중에 그림 크기가 들쭉날쭉 튑니다.

     그래서 배율을 아무 값이나 쓰지 않고, 안전한 값(계단)만 골라 씁니다.
     캐릭터 배율이 3이면 → 1/3 · 2/3 · 1 · 4/3 … 이 안전한 값입니다.
     ============================================================ */
  step() { return 1 / Math.max(1, CONFIG.avatar.scale || 4); },

  /** z 보다 크지 않은 가장 큰 안전 배율 */
  snapDown(z) {
    const st = this.step();
    const n = Math.max(1, Math.floor(z / st + 1e-6));
    return clamp(n * st, CONFIG.view.minZoom, CONFIG.view.maxZoom);
  },

  /** 안전 배율 계단에서 한 칸 위/아래 */
  stepZoom(dir) {
    const st = this.step();
    const n = Math.round(this.zoom / st) + dir;
    return clamp(Math.max(1, n) * st, CONFIG.view.minZoom, CONFIG.view.maxZoom);
  },

  fitZoom() {
    const vp = $('#viewport').getBoundingClientRect();
    const d = State.data;
    if (!vp.width || !vp.height) return 1;
    const raw = Math.min(vp.width / d.room.w, vp.height / d.room.h);
    // 100%(설정의 defaultZoom)를 기본으로 하고, 화면이 좁으면 한 단계씩 줄입니다
    const cap = CONFIG.view.defaultZoom || 1;
    return Math.min(this.snapDown(raw * 0.995), cap);
  },

  applyZoom() {
    if (this.auto) { this.zoom = this.fitZoom(); this.panX = this.panY = 0; }
    $('#stage').style.transform =
      `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    $('#zoomLabel').textContent = Math.round(this.zoom * 100) + '%';
    this.resizeSprites();
  },

  /* ============================================================
     픽셀 그림이 깨져 보이지 않게 하기
     ------------------------------------------------------------
     교실 전체는 화면 크기에 맞추느라 0.85배 · 0.94배처럼 어중간한
     배율로 그려집니다. 이때 그림 원본의 1픽셀이 화면에서 1.7픽셀 같은
     크기가 되면서, 어떤 픽셀은 1칸 어떤 픽셀은 2칸이 되어 울퉁불퉁해
     보입니다. (성민이 말한 '픽셀이 깨져 보인다'가 이것입니다)

     그래서 그림 크기를 '원본 1픽셀이 화면에서 정확히 정수 칸'이 되도록
     화면 배율에 맞춰 매번 다시 계산합니다. 크기가 몇 % 달라지지만
     눈에 띄지 않고, 대신 픽셀이 항상 반듯하게 떨어집니다.
     ============================================================ */
  /**
   * @param snap  true  = 원본 1픽셀이 화면 정수 칸이 되게 크기를 맞춥니다(캐릭터).
   *              false = 교실과 똑같은 비율로 커지고 작아집니다(알).
   *
   * 알은 캐릭터보다 3배 촘촘하게 그려진 그림이라, 캐릭터와 같은 방식으로
   * 정수 칸에 맞추면 확대할 때 «그대로 → 갑자기 두 배» 로 튑니다.
   * 그래서 알은 교실과 함께 매끄럽게 커지도록 둡니다.
   * (배율 1배 — 교실 TV 전체 화면 — 에서는 알도 정확히 1:1 로 떨어집니다)
   */
  sizeSprite(img, srcW, srcH, wantScale, snap) {
    const z = this.zoom || 1;
    let k = wantScale;
    if (snap !== false) {
      k = Math.max(1, Math.round(wantScale * z));
      img.style.width  = (srcW * k) / z + 'px';
      img.style.height = (srcH * k) / z + 'px';
    } else {
      img.style.width  = (srcW * wantScale) + 'px';
      img.style.height = (srcH * wantScale) + 'px';
    }
    // 위아래로 살짝 움직이는 연출도 '화면 정수 칸' 단위로 (원본 1픽셀만큼)
    img.style.setProperty('--bob-y', (-k / z) + 'px');
    img._src = { w: srcW, h: srcH, s: wantScale, snap: snap !== false };
    this.alignSprite(img);
  },

  /* ------------------------------------------------------------
     크기가 딱 맞아도 '놓이는 위치' 가 반 픽셀 어긋나면 픽셀이 깨집니다.
     이름표 높이가 글꼴에 따라 소수라서, 카드 안에서 세로 가운데를 맞출 때
     캐릭터가 소수점 위치에 놓이기 때문입니다.
     그래서 실제로 그려진 위치를 재서, 어긋난 만큼 되밀어 줍니다.
     ------------------------------------------------------------ */
  alignSprite(img) {
    if (!img.isConnected) return;
    const z = this.zoom || 1;
    img.style.left = '0px';
    img.style.top  = '0px';
    const r = img.getBoundingClientRect();
    if (!r.width) return;
    img.style.left = ((Math.round(r.left) - r.left) / z) + 'px';
    img.style.top  = ((Math.round(r.top)  - r.top)  / z) + 'px';
  },

  /** 배율이 바뀌면 화면에 떠 있는 그림들의 크기와 위치를 다시 맞춥니다 */
  resizeSprites() {
    const imgs = $$('#cardLayer img').filter(i => i._src);
    // 크기 먼저 전부 정하고 (이때 위치 보정은 0 으로 초기화)
    imgs.forEach(img => {
      const z = this.zoom || 1;
      const d = img._src;
      let k = d.s;
      if (d.snap) {
        k = Math.max(1, Math.round(d.s * z));
        img.style.width  = (d.w * k) / z + 'px';
        img.style.height = (d.h * k) / z + 'px';
      } else {
        img.style.width  = (d.w * d.s) + 'px';
        img.style.height = (d.h * d.s) + 'px';
      }
      img.style.setProperty('--bob-y', (-k / z) + 'px');
      img.style.left = '0px';
      img.style.top  = '0px';
    });
    // 그 다음 한꺼번에 재서 보정 (읽기·쓰기를 나눠야 화면이 덜 버벅입니다)
    const z = this.zoom || 1;
    const rects = imgs.map(img => img.getBoundingClientRect());
    imgs.forEach((img, i) => {
      const r = rects[i];
      if (!r.width) return;
      img.style.left = ((Math.round(r.left) - r.left) / z) + 'px';
      img.style.top  = ((Math.round(r.top)  - r.top)  / z) + 'px';
    });
  },

  setZoom(z, keepAuto) {
    this.auto = !!keepAuto;
    this.zoom = this.snapDown(clamp(z, CONFIG.view.minZoom, CONFIG.view.maxZoom) + this.step() / 2);
    this.applyZoom();
  },

  /** 확대(+1) · 축소(-1). 안전 배율 계단을 한 칸씩 오르내립니다 */
  zoomBy(dir) {
    this.auto = false;
    this.zoom = this.stepZoom(dir > 0 ? 1 : -1);
    this.applyZoom();
  },

  fit() { this.auto = true; this.applyZoom(); toast('화면에 맞췄습니다'); },

  /** 화면 좌표 → 교실 안의 좌표 */
  toStage(clientX, clientY) {
    const r = $('#stage').getBoundingClientRect();
    const x = (clientX - r.left) / this.zoom;
    const y = (clientY - r.top) / this.zoom;
    if (!this.flipped) return { x: x, y: y };
    // 뒤집힌 상태에서는 화면의 오른쪽 아래가 교실의 왼쪽 위입니다.
    // 여기서 되돌려 놓으면 끌기 계산(dx·dy)은 아무것도 안 고쳐도 맞아떨어집니다.
    const rm = State.data.room;
    return { x: rm.w - x, y: rm.h - y };
  },
};

/* ============================================================
   선생님 전용 — 공개 방식 바꾸기 (화면엔 거의 드러나지 않습니다)
   ============================================================ */
const Secret = {
  _timer: null,

  _x: 0,
  _y: 0,

  init() {
    // 구석 영역을 '보이지 않는 버튼' 으로 깔면 그 자리의 책상 클릭까지 삼켜 버립니다.
    // 그래서 화면 전체의 누름을 지켜보다가 '눌린 좌표' 가 구석인지로만 판단합니다.
    // (덕분에 범위를 아무리 넓혀도 다른 것을 가리지 않습니다)
    const inCorner = (e) => {
      const s = CONFIG.secret.hotspotSize;
      return e.clientX <= s && e.clientY >= window.innerHeight - s;
    };
    const cancel = () => clearTimeout(this._timer);

    document.addEventListener('pointerdown', (e) => {
      cancel();
      if (!inCorner(e)) return;
      this._x = e.clientX; this._y = e.clientY;
      this._timer = setTimeout(() => this.toggle(), CONFIG.secret.holdMs);
    }, true);

    document.addEventListener('pointermove', (e) => {
      if (!this._timer) return;
      const tol = CONFIG.secret.moveTolerance || 12;
      if (Math.abs(e.clientX - this._x) > tol || Math.abs(e.clientY - this._y) > tol) cancel();
    }, true);

    ['pointerup', 'pointercancel'].forEach(ev =>
      document.addEventListener(ev, cancel, true));

    this.refreshDot();
  },

  /** 설정 화면에서 모양을 맞출 때만 켜는 미리 보기 (저장되지 않습니다) */
  preview: false,

  setPreview(on) {
    this.preview = !!on;
    $('#btnDotPreview').textContent = this.preview ? '미리 보기 끄기' : '미리 보기 켜기';
    $('#btnDotPreview').classList.toggle('active', this.preview);
    this.refreshDot();
  },

  toggle() {
    State.data.mode = (State.data.mode === 'preset') ? 'random' : 'preset';
    this.refreshDot(true);
    Panel.refreshMode();
    State.save();
    // 일부러 소리도 알림도 내지 않습니다. 표시점만 두 번 깜빡입니다.
  },

  refreshDot(blink) {
    const dot = $('#modeDot');
    // '미리 보기' 를 켜 두면 무작위 모드에서도 보이는 모습 그대로 보여 줍니다
    const preset = State.data.mode === 'preset' || this.preview;
    const sz = (State.data.settings.dot || State.freshDot()).size || 8;
    dot.style.width = sz + 'px';
    dot.style.height = sz + 'px';
    dot.classList.remove('blink');

    // 모양은 설정 화면에서 조절한 값을 씁니다 (없으면 config.js 의 기본값)
    const c = State.data.settings.dot || State.freshDot();
    const paint = (fillA, ringA) => {
      dot.style.background = rgba(c.fill, fillA);
      dot.style.boxShadow  = `0 0 0 ${c.ringW}px ${rgba(c.ring, ringA)}`;
    };

    if (!preset) {
      // 표시점을 끌 때: 깜빡이거나 서서히 사라지면 그 '움직임' 때문에
      // 오히려 아이들 눈에 띕니다. 아무 연출 없이 그 순간 바로 사라지게 합니다.
      dot.classList.add('instant');
      paint(CONFIG.secret.dotOpacityRandom, 0);   // 테두리도 같이 사라집니다
      void dot.offsetWidth;              // 지금 바로 반영
      dot.classList.remove('instant');
      return;
    }

    // 표시점을 켤 때: 선생님이 직접 누른 순간이므로 살짝 깜빡여 확인시켜 줍니다.
    paint(c.fillA, c.ringA);
    if (blink) {
      void dot.offsetWidth;
      dot.classList.add('blink');
      setTimeout(() => dot.classList.remove('blink'), 800);
    }
  },
};

/* ============================================================
   시작
   ============================================================ */
/* ============================================================
   시작 화면
   ------------------------------------------------------------
   브라우저 보안 규칙상 전체 화면은 '사용자가 직접 누른 순간'에만
   켤 수 있습니다. 그래서 시작 버튼을 한 번 누르게 합니다.
   이미 전체 화면이거나 주소창 없는 창(앱 모드)이면 건너뜁니다.
   ============================================================ */
const StartCover = {
  init() {
    const cover = $('#startCover');
    $('#scVer').textContent = 'v' + APP_VERSION.number;

    const noChrome = window.matchMedia('(display-mode: standalone)').matches
                  || window.matchMedia('(display-mode: fullscreen)').matches
                  || document.fullscreenElement;
    if (noChrome) { cover.remove(); return; }

    const close = () => {
      cover.classList.add('gone');
      setTimeout(() => cover.remove(), 400);
      View.applyZoom();
    };

    $('#scStart').onclick = () => {
      Sound.play('click');
      const el = document.documentElement;
      try {
        const p = el.requestFullscreen && el.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* 막혀 있으면 그냥 넘어갑니다 */ }
      close();
    };
    $('#scPlain').onclick = () => { Sound.play('click'); close(); };
  },
};

function boot() {
  $('#tbVer').textContent = 'v' + APP_VERSION.number;
  document.documentElement.style.setProperty(
    '--nametag-size', (CONFIG.nametag && CONFIG.nametag.fontSize || 28) + 'px');
  const sn = CONFIG.seatNumber || {};
  document.documentElement.style.setProperty('--seatno-size', (sn.size || 40) + 'px');
  document.documentElement.style.setProperty('--seatno-font', (sn.fontSize || 24) + 'px');
  State.init();
  Sound.init();
  Sound.setOn(State.data.settings.sound);
  Sound.setMaster(State.data.settings.volume);
  Render.preload();
  Render.startAvatarTicker();

  document.body.classList.toggle('show-grid', CONFIG.view.showGridAlways);
  Render.all();
  Panel.syncFromState();
  Secret.init();
  wireEvents();
  StartCover.init();

  if (!State.data.students.length) {
    banner('설정 ▸ 학생 명단부터 입력해 주세요', 6000);
  }
}

function wireEvents() {

  /* ---------- 툴바 ---------- */
  // 이 세 개는 누른 직후 바로 자기 소리(섞는 소리·알 깨지는 소리)가 나므로
  // 버튼 클릭음을 내면 겹쳐서 지저분해집니다. 그래서 클릭음을 내지 않습니다.
  $('#btnShuffle').onclick    = () => Shuffle.run();
  $('#btnRevealSeq').onclick  = () => Shuffle.revealAll('seq');    // 앞자리부터 차례대로
  $('#btnRevealRand').onclick = () => Shuffle.revealAll('random'); // 뒤죽박죽 순서로
  $('#btnRevealNow').onclick  = () => Shuffle.revealNow();
  $('#btnReset').onclick     = () => Shuffle.reset();
  $('#btnFlip').onclick      = () => View.toggleFlip();
  $('#btnEdit').onclick      = () => { Sound.play('click'); Editor.toggle(); };
  $('#btnPanel').onclick     = () => Panel.toggle();
  $('#btnZoomIn').onclick    = () => View.zoomBy(+1);
  $('#btnZoomOut').onclick   = () => View.zoomBy(-1);
  $('#btnZoomFit').onclick   = () => View.fit();
  $('#btnFull').onclick      = () => toggleFullscreen();

  /* ---------- 편집 서브 툴바 ---------- */
  $$('.eb-mode').forEach(b => b.onclick = () => { Sound.play('click'); Editor.enter(b.dataset.editmode); });
  $('#btnAddGroup').onclick    = () => Editor.addGroup();
  // 남·여 자리 붓 (같은 버튼을 다시 누르면 꺼집니다)
  $$('.eb-brush').forEach(b => b.onclick = () => Editor.setBrush(b.dataset.brush));
  $('#btnSexClear').onclick    = () => Editor.clearSex();
  $('#btnAddDesk').onclick     = () => Editor.addDesk();
  $('#btnAddLocker').onclick   = () => Editor.addLocker();
  $('#btnDelete').onclick      = () => Editor.deleteSelected();
  $('#btnAutoArrange').onclick = () => Editor.relayout();

  /* ---------- 설정 패널 ---------- */
  $('#btnPanelClose').onclick = () => Panel.close();
  $$('.ptab').forEach(b => b.onclick = () => Panel.showTab(b.dataset.tab));
  $('#btnApplyNames').onclick = () => Panel.applyNames();
  $('#btnAllBoy').onclick     = () => Panel.setAllSex('b');
  $('#btnAllGirl').onclick    = () => Panel.setAllSex('g');
  $('#btnGroupsOn').onclick   = () => Panel.setUseGroups(true);
  $('#btnGroupsOff').onclick  = () => Panel.setUseGroups(false);
  $('#btnRebuild').onclick    = () => Panel.rebuildClassroom();
  $('#btnRoomDefault').onclick = () => Panel.resetRoomSize();
  $('#inRoomW').onchange      = () => Panel.applyRoomSize();
  $('#inRoomH').onchange      = () => Panel.applyRoomSize();
  $('#inSound').onchange      = (e) => {
    State.data.settings.sound = e.target.checked; Sound.setOn(e.target.checked); State.save();
  };
  $('#inVolume').oninput      = (e) => {
    State.data.settings.volume = parseFloat(e.target.value); Sound.setMaster(e.target.value); State.save();
  };
  /* ---------- 표시점 모양 ---------- */
  $('#btnDotPreview').onclick = () => Secret.setPreview(!Secret.preview);
  $('#btnDotReset').onclick   = () => Panel.resetDot();
  ['inDotFill', 'inDotRing'].forEach(id =>
    $('#' + id).oninput = () => Panel.applyDot());
  ['inDotFillA', 'inDotRingA', 'inDotRingW', 'inDotSize'].forEach(id =>
    $('#' + id).oninput = () => Panel.applyDot());

  $('#btnPresetSave').onclick = () => Presets.saveNew();
  $('#inPresetName').onkeydown = (e) => { if (e.key === 'Enter') Presets.saveNew(); };

  $('#btnExport').onclick = () => { State.exportFile(); toast('설정 파일을 내려받았습니다'); };
  $('#btnImport').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = (e) => {
    if (e.target.files[0]) Panel.importFrom(e.target.files[0]);
    e.target.value = '';
  };
  $('#btnWipe').onclick = () => Panel.wipe();
  $('#pickerClose').onclick = () => Picker.close();

  /* ---------- 화면 한가운데 알림 ---------- */
  $('#alertClose').onclick = () => Alert.close();
  // 바깥의 어두운 곳을 눌러도 닫힙니다 (상자 안쪽을 누른 건 무시)
  $('#alert').onclick = (e) => { if (e.target.id === 'alert') Alert.close(); };

  /* ---------- 교실 위에서의 마우스 ----------
     빈 바닥을 끌면 화면이 움직입니다. 편집 중에도 마찬가지라,
     책상·모둠을 잡지 않았다면 화면을 옮길 수 있습니다.
     교실 바깥 여백에서도 끌 수 있도록 viewport 에 답니다. */
  $('#viewport').addEventListener('pointerdown', (e) => {
    // 편집 중이고 책상·모둠·칠판·사물함을 잡았으면 그쪽이 처리합니다
    if (Editor.onPointerDown(e)) return;

    // 편집 중이 아닐 때만 책상 클릭 = 자리 공개
    if (!Editor.mode) {
      const desk = e.target.closest('.desk');
      if (desk) { Shuffle.reveal(desk.dataset.id); return; }
    }
    Pan.start(e);
  });

  window.addEventListener('pointermove', (e) => { Editor.onPointerMove(e); Pan.move(e); });
  window.addEventListener('pointerup',   () => { Editor.onPointerUp(); Pan.end(); });

  // 휠로 확대/축소
  $('#viewport').addEventListener('wheel', (e) => {
    e.preventDefault();
    View.zoomBy(e.deltaY < 0 ? +1 : -1);
  }, { passive: false });

  // 팝업 바깥을 누르면 닫기
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#picker') && !e.target.closest('.desk')) Picker.close();
  }, true);

  window.addEventListener('resize', () => View.applyZoom());
  document.addEventListener('fullscreenchange', () => setTimeout(() => View.applyZoom(), 120));

  /* ---------- 단축키 ---------- */
  window.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

    // 알림창이 떠 있으면 Esc 말고는 아무 단축키도 듣지 않습니다.
    // (자리가 모자란 걸 알리는 중에 S 키로 또 섞으려 하면 혼란스럽습니다)
    if (Alert.isOpen() && e.key !== 'Escape') return;

    if (CONFIG.secret.hotkey && e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
      e.preventDefault(); Secret.toggle(); return;
    }
    if (typing) return;

    switch (e.key) {
      case 'Escape':
        if (Alert.isOpen()) Alert.close();
        else if (!$('#picker').classList.contains('hidden')) Picker.close();
        else if (Editor.mode) Editor.exit();
        else if (!$('#panel').classList.contains('hidden')) Panel.close();
        break;
      case 's': case 'S': case 'ㄴ': Shuffle.run(); break;
      case 'a': case 'A': case 'ㅁ': Shuffle.revealAll('seq'); break;
      case 'w': case 'W': case 'ㅈ': Shuffle.revealAll('random'); break;
      case 'd': case 'D': case 'ㅇ': Shuffle.revealNow(); break;
      case 'r': case 'R': case 'ㄱ': Shuffle.reset(); break;
      case 't': case 'T': case 'ㅅ': View.toggleFlip(); break;
      case 'e': case 'E': case 'ㄷ': Editor.toggle(); break;
      case 'f': case 'F': case 'ㄹ': toggleFullscreen(); break;
      case '+': case '=': View.zoomBy(+1); break;
      case '-': case '_': View.zoomBy(-1); break;
      case '0': View.fit(); break;
      case 'Delete': case 'Backspace':
        if (Editor.mode === 'layout') { e.preventDefault(); Editor.deleteSelected(); }
        break;
    }
  });
}

/* ---------- 확대했을 때 화면 끌어서 옮기기 ---------- */
const Pan = {
  on: false, sx: 0, sy: 0, ox: 0, oy: 0,
  start(e) {
    this.on = true;
    this.sx = e.clientX; this.sy = e.clientY;
    this.ox = View.panX;  this.oy = View.panY;
  },
  _grabbed: false,
  move(e) {
    if (!this.on) return;
    const dx = e.clientX - this.sx, dy = e.clientY - this.sy;
    if (Math.abs(dx) + Math.abs(dy) < 3) return;
    if (!this._grabbed) { this._grabbed = true; document.body.classList.add('panning'); }
    View.auto = false;
    View.panX = this.ox + dx;
    View.panY = this.oy + dy;
    View.applyZoom();
  },
  end() {
    this.on = false;
    if (this._grabbed) { this._grabbed = false; document.body.classList.remove('panning'); }
  },
};

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen && document.exitFullscreen();
  }
}

window.addEventListener('DOMContentLoaded', boot);
