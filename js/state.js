/* 프로그램의 모든 데이터(명단·배치·사전 자리)를 들고 있는 곳.
   바뀔 때마다 이 컴퓨터(브라우저 저장소)에 자동으로 저장됩니다. */
'use strict';

const State = {

  /* 저장 이름.

     ⚠️ 브라우저 저장소는 «주소의 폴더» 가 아니라 «사이트(도메인)» 단위입니다.
        테스트 사이트와 진짜 사이트가 둘 다 hsm4926.github.io 라서,
        폴더가 달라도 그냥 두면 **같은 저장소를 나눠 쓰게 됩니다.**
        (실제로 테스트하다가 진짜 사이트의 명단까지 바뀌었습니다)

        그래서 테스트판은 이름 뒤에 -test 를 붙여 완전히 갈라 둡니다.
        표시는 build_web.py --test 가 넣어 주고, 혹시 그게 빠져도
        주소에 -test 가 있으면 알아서 갈라집니다. */
  KEY: 'woori-jari-bakkugi/v1'
       + ((window.__JARI_TEST || /-test(\/|$)/.test(location.pathname)) ? '-test' : ''),
  data: null,

  /* ---------------- 처음 상태 ---------------- */
  /** 표시점 모양의 기본값. config.js 의 secret 항목에서 가져옵니다. */
  freshDot() {
    const s = CONFIG.secret;
    return {
      fill:  s.dotColor      || '#6b4a2f',   // 안쪽 원 색
      fillA: s.dotOpacityPreset != null ? s.dotOpacityPreset : 0.34,
      ring:  s.dotRingColor  || '#ffffff',   // 테두리 색
      ringA: s.dotRingAlpha  != null ? s.dotRingAlpha : 0.9,
      size:  s.dotSize       || 8,
      ringW: s.dotRingWidth  != null ? s.dotRingWidth : 1.2,
    };
  },

  fresh() {
    const c = CONFIG.classroom;
    const built = Layout.build(c.groups, c.seatsPerGroup, c.width, c.height);
    return {
      v: 1,
      room: { w: c.width, h: c.height },
      board: built.board,
      lockers: built.lockers,
      groups: built.groups,
      desks: built.desks,
      students: [],
      mode: 'random',      // 'random' 또는 'preset'  (선생님만 아는 값)
      preset: {},          // 책상id -> 학생id  (미리 정해둔 자리)
      assignment: {},      // 책상id -> 학생id  (이번에 섞은 결과)
      revealed: {},        // 책상id -> true    (이미 공개한 자리)
      isShuffled: false,
      useGroups: true,     // 모둠으로 묶어 앉힐지 (false 면 책상만 줄 맞춰 놓습니다)
      deskScale: 1,        // 「책상 크기」 1 · 2 · 3 단계 (config.js 의 deskSize)
      // 프리셋 목록. 바로 위의 preset(미리 정해둔 자리)과 이름이 비슷하니 헷갈리지 마세요.
      presets: [],         // [{ id, name, savedAt, data:{교실+명단+사전자리} }]
      /* 섞어서 나온 «지금 이 자리 배치» 를 넣어 두는 칸 5개.
         비어 있으면 null. 각 칸: { name, savedAt, pairs:[[책상id, 학생id, 이름]...] }
         ⚠️ 위의 preset(사전에 정해둔 자리)·presets(교실 통째 저장)와 다른 것입니다.
            이건 «이미 섞여 나온 결과» 를 그대로 기억해 두는 곳입니다. */
      layouts: [null, null, null, null, null],
      settings: {
        sound: CONFIG.sound.on,
        volume: CONFIG.sound.masterVolume,
        dot: this.freshDot(),   // 표시점 모양 (설정 화면에서 눈으로 보며 조절)
      },
      savedAt: null,
    };
  },

  /* ---------------- 불러오기 / 저장 ---------------- */
  init() {
    let loaded = null;
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) loaded = JSON.parse(raw);
    } catch (e) {
      console.warn('저장된 설정을 읽지 못했습니다:', e);
    }
    this.data = (loaded && loaded.v === 1) ? this._heal(loaded) : this.fresh();
    return this.data;
  },

  /** 저장된 자료에 빠진 항목이 있어도 프로그램이 죽지 않게 채워 넣습니다 */
  _heal(d) {
    const base = this.fresh();
    const out = Object.assign({}, base, d);
    out.room     = Object.assign({}, base.room, d.room);
    out.settings = Object.assign({}, base.settings, d.settings);
    // 표시점 모양은 항목이 빠져 있을 수 있으므로 한 겹 더 채워 줍니다
    out.settings.dot = Object.assign({}, this.freshDot(), (d.settings || {}).dot);
    ['groups', 'desks', 'lockers', 'students', 'presets'].forEach(k => {
      if (!Array.isArray(out[k])) out[k] = base[k];
    });
    // 배치 칸은 언제나 5개여야 합니다 (예전 저장 자료에는 아예 없습니다)
    out.layouts = this.fixLayouts(d.layouts);
    // 책상 크기 단계 (예전 저장 자료에는 없습니다 → 1단계)
    if (![1, 2, 3].includes(out.deskScale)) out.deskScale = 1;
    ['preset', 'assignment', 'revealed'].forEach(k => {
      if (!out[k] || typeof out[k] !== 'object') out[k] = {};
    });
    if (!out.board) out.board = base.board;
    // 예전에 저장한 파일에는 이 값이 없습니다 — 실제 모둠이 있는지로 판단합니다
    if (typeof out.useGroups !== 'boolean') out.useGroups = out.groups.length > 0;
    // 없어진 책상·학생을 가리키는 찌꺼기 정리
    const deskIds = new Set(out.desks.map(x => x.id));
    const stuIds  = new Set(out.students.map(x => x.id));
    ['preset', 'assignment'].forEach(k => {
      for (const dk in out[k]) {
        if (!deskIds.has(dk) || !stuIds.has(out[k][dk])) delete out[k][dk];
      }
    });
    for (const dk in out.revealed) if (!deskIds.has(dk)) delete out.revealed[dk];
    return out;
  },

  save: null,   // init 뒤에 아래에서 채워집니다

  _saveNow() {
    try {
      this.data.savedAt = new Date().toISOString();
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
      if (window.Panel && Panel.refreshSavedAt) Panel.refreshSavedAt();
    } catch (e) {
      console.warn('저장 실패:', e);
      toast('설정을 저장하지 못했습니다. 파일로 내보내기를 이용해 주세요.', 4000);
    }
  },

  wipe() {
    try { localStorage.removeItem(this.KEY); } catch (e) {}
    this.data = this.fresh();
  },

  /* ---------------- 찾기 도우미 ---------------- */
  desk(id)    { return this.data.desks.find(d => d.id === id); },
  group(id)   { return this.data.groups.find(g => g.id === id); },

  /** 지금 교실이 모둠으로 묶여 있는지. 설정 화면에서 어떤 칸을 보여줄지 정할 때 씁니다. */
  useGroups() { return this.data.useGroups !== false; },

  /**
   * 이 책상이 누구 자리인지 알려 줍니다.
   *   'b'  = 남학생만 앉는 자리
   *   'g'  = 여학생만 앉는 자리
   *   null = 누구나 앉는 자리 (아무것도 정하지 않은 보통 책상)
   *
   * 책상에 sex 항목 자체가 없는 경우(예전에 저장한 교실)도 있으므로
   * 어디서든 이 함수를 거쳐서 읽습니다. dk.sex 를 직접 보지 마세요.
   */
  deskSex(dk) { return (dk && (dk.sex === 'b' || dk.sex === 'g')) ? dk.sex : null; },

  student(id) { return this.data.students.find(s => s.id === id); },

  /** 모둠 순서 → 책상 번호 순으로 정렬한 책상 목록 */
  orderedDesks() {
    const order = {};
    this.data.groups.forEach((g, i) => { order[g.id] = i; });
    return this.data.desks.slice().sort((a, b) => {
      const ga = order[a.gid] ?? 999, gb = order[b.gid] ?? 999;
      if (ga !== gb) return ga - gb;
      return (a.no || 0) - (b.no || 0);
    });
  },

  /** 모둠에 속한 책상들 */
  desksOf(gid) { return this.data.desks.filter(d => d.gid === gid); },

  /**
   * 모둠을 한 바퀴씩 돌며 자리를 하나씩 고른 순서.
   * 학생 수가 자리 수보다 적을 때 한 모둠만 텅 비지 않고
   * 모든 모둠에 고르게 나눠 앉도록 하기 위한 순서입니다.
   */
  desksRoundRobin() {
    if (!this.data.groups.length) return this.orderedDesks();   // 모둠이 없으면 자리 순서 그대로
    const perGroup = this.data.groups.map(g =>
      this.desksOf(g.id).sort((a, b) => (a.no || 0) - (b.no || 0)));
    const maxSeats = perGroup.reduce((m, ds) => Math.max(m, ds.length), 0);
    const out = [];
    for (let i = 0; i < maxSeats; i++) {
      perGroup.forEach(ds => { if (ds[i]) out.push(ds[i]); });
    }
    // 모둠에 속하지 않은 책상은 맨 뒤로
    const known = new Set(out.map(d => d.id));
    this.data.desks.forEach(d => { if (!known.has(d.id)) out.push(d); });
    return out;
  },

  /** 모둠 하나를 감싸는 사각형 (없으면 null) */
  groupBox(gid) {
    const ds = this.desksOf(gid);
    if (!ds.length) return null;
    const pad = 16;
    const x1 = Math.min(...ds.map(d => d.x)) - pad;
    const y1 = Math.min(...ds.map(d => d.y)) - pad;
    const x2 = Math.max(...ds.map(d => d.x + State.deskW())) + pad;
    const y2 = Math.max(...ds.map(d => d.y + State.deskH())) + pad + 14;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  },

  /** 배치 칸을 언제나 5개짜리 배열로 맞춰 줍니다 */
  fixLayouts(list) {
    const out = Array.isArray(list) ? list.slice(0, Layouts.SLOTS) : [];
    while (out.length < Layouts.SLOTS) out.push(null);
    return out.map(x => (x && Array.isArray(x.pairs)) ? x : null);
  },

  /* ============================================================
     책상 한 개의 크기 — «항상 이 함수를 거쳐서» 씁니다
     ------------------------------------------------------------
     CONFIG.desk.width 를 코드에서 직접 읽으면 「책상 크기」 단계가 반영되지 않습니다.
     (v1.13.0 에서 CONFIG 직접 참조 15곳을 전부 이리로 모았습니다)

     ⚠️ fresh() 가 Layout.build() 를 부르는 시점에는 this.data 가 아직 없습니다.
        그래서 없으면 1단계로 봅니다.
     ============================================================ */
  deskStep()  { const n = this.data && this.data.deskScale; return [1,2,3].includes(n) ? n : 1; },
  deskMul()   { return (CONFIG.deskSize.desk[this.deskStep() - 1]) || 1; },
  nameMul()   { return (CONFIG.deskSize.name[this.deskStep() - 1]) || 1; },
  deskW()     { return Math.round(CONFIG.desk.width  * this.deskMul()); },
  deskH()     { return Math.round(CONFIG.desk.height * this.deskMul()); },

  /** 사전 자리로 이미 정해진 학생 id 모음 */
  presetTakenIds() { return new Set(Object.values(this.data.preset)); },

  /* ---------------- 파일 내보내기 / 불러오기 ---------------- */
  exportFile() {
    // 어느 버전에서 내보낸 파일인지 남겨 둡니다 (문제 생겼을 때 확인용)
    const payload = Object.assign({}, this.data, { appVersion: APP_VERSION.number });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const stamp = d.getFullYear() + ('0'+(d.getMonth()+1)).slice(-2) + ('0'+d.getDate()).slice(-2);
    const a = el('a', { href: url, download: `우리반자리바꾸기_${stamp}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  importText(text) {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.v !== 1) throw new Error('이 프로그램의 설정 파일이 아닙니다.');
    this.data = this._heal(parsed);
    this._saveNow();
  },
};

State.save = debounce(() => State._saveNow(), 350);
