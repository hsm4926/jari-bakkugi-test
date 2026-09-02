/* 교실 화면을 실제로 그리는 곳. */
'use strict';

/* ---------- 학생 캐릭터 그림 고르기 ----------
   네모(남)·루루(여) 는 옷 색만 바꾼 그림을 8가지씩 미리 만들어 두었습니다.
   (얼굴색은 그대로 두려고 화면 효과 대신 그림 자체를 바꿔 두었습니다) */
const Avatars = {
  VARIANTS: 8,

  nemo(sex, v) {
    const base = (sex === 'g') ? 'girl' : 'boy';
    return [
      asset(`assets/sprites/student/${base}1-${v}.png`),
      asset(`assets/sprites/student/${base}2-${v}.png`),
    ];
  },
  momomong: [
    [asset('assets/sprites/mong/a.png')], [asset('assets/sprites/mong/b.png')],
    [asset('assets/sprites/mong/c.png')], [asset('assets/sprites/mong/cute.png')],
    [asset('assets/sprites/mong/beauty.png')],
  ],

  framesFor(student, idx) {
    if (CONFIG.avatar.set === 'momomong') {
      return this.momomong[idx % this.momomong.length];
    }
    const v = CONFIG.avatar.colorize ? (idx % this.VARIANTS) : 0;
    return this.nemo(student.sex, v);
  },
};

/* ---------- 애니메이션 프레임 목록 ---------- */
/* 잘라 낸 알 그림의 원본 픽셀 크기 (assets/sprites/egg/*.png) */
const EGG_SRC = { w: 32, h: 42 };

const Frames = {
  egg:  Array.from({ length: 13 }, (_, i) => asset(`assets/sprites/egg/${String(i+1).padStart(2,'0')}.png`)),
  rise: Array.from({ length: 12 }, (_, i) => asset(`assets/sprites/fx/rise${String(i+1).padStart(2,'0')}.png`)),
  burst:Array.from({ length:  6 }, (_, i) => asset(`assets/sprites/fx/burst${String(i+1).padStart(2,'0')}.png`)),
};

const Render = {

  cards: {},          // 책상id -> 카드 DOM
  _avatarImgs: [],    // 두 프레임을 번갈아 보여주기 위한 목록
  _frameFlip: 0,

  /* ---------------- 이미지 미리 불러오기 ---------------- */
  preload() {
    const list = [].concat(Frames.egg, Frames.rise, Frames.burst, ...Avatars.momomong);
    for (let v = 0; v < Avatars.VARIANTS; v++) {
      list.push(...Avatars.nemo('b', v), ...Avatars.nemo('g', v));
    }
    // 참조를 붙들어 두지 않으면 다 받기 전에 정리되어 요청이 취소됩니다
    this._preloaded = list.map(src => { const i = new Image(); i.src = src; return i; });
  },

  /* ---------------- 전체 다시 그리기 ---------------- */
  all() {
    const d = State.data;
    const stage = $('#stage');
    stage.style.width  = d.room.w + 'px';
    stage.style.height = d.room.h + 'px';

    this.grid();
    this.room();
    this.groups();
    this.desks();
    this.cards_();
    View.applyZoom();
  },

  /* ---------------- 격자 ---------------- */
  grid() {
    const g = CONFIG.classroom.grid;
    const big = g * 5;
    $('#gridLayer').style.background =
      `repeating-linear-gradient(0deg, var(--grid) 0 1px, transparent 1px ${g}px),` +
      `repeating-linear-gradient(90deg, var(--grid) 0 1px, transparent 1px ${g}px),` +
      `repeating-linear-gradient(0deg, rgba(74,53,32,.22) 0 1px, transparent 1px ${big}px),` +
      `repeating-linear-gradient(90deg, rgba(74,53,32,.22) 0 1px, transparent 1px ${big}px)`;
  },

  /* ---------------- 칠판 · 사물함 ---------------- */
  room() {
    const layer = $('#roomLayer');
    layer.innerHTML = '';
    const d = State.data;

    const board = el('div', { class: 'board', 'data-kind': 'board', text: '칠 판' });
    const bp = View.place(d.board.x, d.board.y, d.board.w, d.board.h);
    Object.assign(board.style, {
      left: bp.x + 'px', top: bp.y + 'px',
      width: d.board.w + 'px', height: d.board.h + 'px',
      fontSize: Math.round(d.board.h * 0.42) + 'px',
    });
    layer.appendChild(board);

    d.lockers.forEach(lk => {
      const n = el('div', { class: 'locker', 'data-kind': 'locker', 'data-id': lk.id, text: '사 물 함' });
      const p = View.place(lk.x, lk.y, lk.w, lk.h);
      Object.assign(n.style, {
        left: p.x + 'px', top: p.y + 'px',
        width: lk.w + 'px', height: lk.h + 'px',
        fontSize: Math.round(lk.h * 0.4) + 'px', letterSpacing: '4px',
      });
      layer.appendChild(n);
    });
  },

  /* ---------------- 모둠 영역 · 이름표 ---------------- */
  groups() {
    const layer = $('#groupLayer');
    layer.innerHTML = '';
    State.data.groups.forEach(g => {
      const box = State.groupBox(g.id);
      if (!box) return;

      const zone = el('div', { class: 'group-zone', 'data-kind': 'zone', 'data-id': g.id });
      const bp = View.place(box.x, box.y, box.w, box.h);
      Object.assign(zone.style, {
        left: bp.x + 'px', top: bp.y + 'px',
        width: box.w + 'px', height: box.h + 'px',
        borderColor: g.color, backgroundColor: g.color + '14', color: g.color,
      });
      layer.appendChild(zone);

      const tag = el('div', { class: 'group-tag', 'data-kind': 'group', 'data-id': g.id, text: g.name });
      // 이름표는 뒤집어도 «화면 기준 위쪽» 에 둡니다 (아래에 붙으면 옆 모둠과 겹칩니다)
      Object.assign(tag.style, {
        left: bp.x + 'px', top: (bp.y - 36) + 'px', backgroundColor: g.color,
      });
      layer.appendChild(tag);
    });
  },

  /* ---------------- 책상 ---------------- */
  desks() {
    const layer = $('#deskLayer');
    layer.innerHTML = '';
    this.deskNodes = {};          // 책상id -> 화면 요소 (자리 번호를 켜고 끌 때 씁니다)
    const dw = CONFIG.desk.width, dh = CONFIG.desk.height;

    State.orderedDesks().forEach((dk, i) => {
      const g = State.group(dk.gid);
      const node = el('div', { class: 'desk', 'data-kind': 'desk', 'data-id': dk.id });
      const p = View.place(dk.x, dk.y, dw, dh);
      Object.assign(node.style, {
        left: p.x + 'px', top: p.y + 'px', width: dw + 'px', height: dh + 'px',
        borderColor: g ? g.color : 'var(--desk-edge)',
      });

      // 편집할 때만 보이는 번호
      node.appendChild(el('div', {
        class: 'desk-no',
        text: (g ? g.no + '-' : '') + (dk.no || (i + 1)),
      }));

      // 사전 자리 정하기 모드일 때 보이는 이름.
      // 그 학생의 성별이 이 자리와 다르면 눈에 띄게 표시합니다 (막지는 않습니다)
      const sid = State.data.preset[dk.id];
      const stu = sid ? State.student(sid) : null;
      const want = State.deskSex(dk);
      const odd = stu && want && (stu.sex === 'g' ? 'g' : 'b') !== want;
      node.appendChild(el('div', {
        class: 'desk-preset' + (stu ? '' : ' empty') + (odd ? ' bad' : ''),
        text: stu ? stu.name : '비어 있음',
      }));

      // 남자 자리 · 여자 자리 딱지 (내용은 paintDeskSex() 가 정합니다)
      node.appendChild(el('div', { class: 'sex-no' }));

      // 알에 붙는 자리 번호 (내용과 표시 여부는 seatNumbers() 가 정합니다)
      const badge = el('div', { class: 'seat-no' });
      if (g) badge.style.borderColor = g.color;
      badge.style.display = 'none';
      node.appendChild(badge);

      layer.appendChild(node);
      this.deskNodes[dk.id] = node;
      this.paintDeskSex(dk.id);
    });

    this.applyEditVisuals();
  },

  /* ============================================================
     남자 자리 · 여자 자리 표시
     ------------------------------------------------------------
     책상 하나만 다시 칠합니다. 편집 중에 책상을 연달아 누를 때
     교실 전체를 다시 그리면 눈에 띄게 버벅이기 때문입니다.
     ============================================================ */
  paintDeskSex(deskId) {
    const node = this.deskNodes && this.deskNodes[deskId];
    if (!node) return;
    const want = State.deskSex(State.desk(deskId));

    node.classList.toggle('sex-b', want === 'b');
    node.classList.toggle('sex-g', want === 'g');

    // 보일지 말지는 CSS(body.show-sex)가 정합니다. 여기서는 내용만 씁니다.
    const badge = node.querySelector('.sex-no');
    if (badge) badge.textContent = want === 'g' ? '여' : '남';
  },

  /**
   * 남·여 색과 딱지를 보여 줄지 정합니다.
   *
   * 평소 교실 화면에서는 **감춥니다.** 책상이 알록달록하면 알과 이름표가 묻히고,
   * 아이들에게 굳이 알릴 정보도 아니기 때문입니다.
   * 배정 규칙은 색이 보이든 안 보이든 똑같이 지켜집니다.
   */
  applySexVisible() {
    const always = CONFIG.deskSex && CONFIG.deskSex.showAlways;
    document.body.classList.toggle('show-sex', !!Editor.mode || !!always);
  },

  /** 모든 책상의 남·여 딱지를 다시 칠합니다 (편집 모드가 바뀔 때) */
  paintAllSex() {
    if (!this.deskNodes) return;
    for (const id in this.deskNodes) this.paintDeskSex(id);
  },

  /* ============================================================
     자리 번호
     ------------------------------------------------------------
     "몇 번 알을 열어 볼까?" 하고 아이들이 고르게 하는 번호입니다.

     · 자리를 섞은 뒤에만 보입니다
     · 학생이 앉은 자리에만 1번부터 차례로 붙습니다 (빈 책상은 건너뜁니다)
     · 이름이 공개된 자리는 번호가 사라집니다 — 남은 번호만 보이니 깔끔합니다
     · 번호는 이름이 공개돼도 다시 매기지 않습니다.
       (중간에 번호가 바뀌면 아이들이 부른 번호와 달라져 버립니다)
     ============================================================ */
  seatNumbers() {
    if (!this.deskNodes) return;
    const d = State.data;
    const show = !CONFIG.seatNumber || CONFIG.seatNumber.show !== false;
    let n = 0;

    State.orderedDesks().forEach(dk => {
      const node = this.deskNodes[dk.id];
      if (!node) return;
      const badge = node.querySelector('.seat-no');
      if (!badge) return;

      const seated = show && d.isShuffled && !!d.assignment[dk.id];
      if (!seated) { badge.style.display = 'none'; return; }

      n++;                       // 앉은 자리마다 번호를 하나씩 소비합니다
      badge.textContent = n;
      badge.style.display = (d.revealed[dk.id] || Editor.mode) ? 'none' : '';
    });
  },

  /** 편집 모드에 따라 책상 위 글자를 보이거나 감춥니다 */
  applyEditVisuals() {
    const mode = Editor.mode;   // null | 'layout' | 'preset'
    $$('.desk-no').forEach(n => n.style.display = mode === 'layout' ? '' : 'none');
    $$('.desk-preset').forEach(n => n.style.display = mode === 'preset' ? '' : 'none');
    this.applySexVisible();
    this.paintAllSex();
    this.seatNumbers();
  },

  /* ---------------- 카드(알 / 학생) ---------------- */
  cards_() {
    const layer = $('#cardLayer');
    layer.innerHTML = '';
    this.cards = {};
    this._avatarImgs = [];
    if (!State.data.isShuffled) return;

    const dh = CONFIG.desk.height, dw = CONFIG.desk.width;
    const students = State.data.students;

    State.orderedDesks().forEach(dk => {
      const sid = State.data.assignment[dk.id];
      if (!sid) return;
      const stu = State.student(sid);
      if (!stu) return;
      const idx = students.findIndex(s => s.id === sid);

      const card = el('div', { class: 'card', 'data-desk': dk.id });
      const p = View.place(dk.x, dk.y, dw, dh);
      Object.assign(card.style, {
        width: dw + 'px', height: dh + 'px',
        transform: `translate(${p.x}px, ${p.y}px)`,
      });
      const inner = el('div', { class: 'card-in' });
      card.appendChild(inner);

      // 덮여 있는 상태 = 모모몽 알
      const egg = el('img', { class: 'egg', src: Frames.egg[0], alt: '' });
      View.sizeSprite(egg, EGG_SRC.w, EGG_SRC.h, CONFIG.avatar.eggScale, false);
      inner.appendChild(egg);

      layer.appendChild(card);
      this.cards[dk.id] = { root: card, in: inner, egg, studentId: sid, index: idx };

      // «배치 관리» 모드에서는 아직 안 연 자리도 학생으로 보여 줍니다
      if (State.data.revealed[dk.id] || Arrange.on) this.showStudent(dk.id, false);
    });

    this.seatNumbers();
  },

  /** 카드를 학생 모습으로 바꿉니다 */
  showStudent(deskId, animate) {
    const c = this.cards[deskId];
    if (!c) return;
    const stu = State.student(c.studentId);
    if (!stu) return;

    c.root.classList.remove('wobble');
    c.in.innerHTML = '';

    const frames = Avatars.framesFor(stu, c.index);
    const img = el('img', { class: 'avatar', src: frames[0], alt: '' });
    View.sizeSprite(img, 16, 16, CONFIG.avatar.scale);
    img._frames = frames;
    this._avatarImgs.push(img);

    const tag = el('div', { class: 'nametag', text: stu.name });
    const dk = State.desk(deskId);
    const grp = dk ? State.group(dk.gid) : null;
    if (grp) tag.style.borderColor = grp.color;
    c.in.appendChild(img);
    c.in.appendChild(tag);
    // 이름표가 붙으면서 세로 위치가 달라지므로 픽셀 격자에 다시 맞춥니다
    View.alignSprite(img);
    if (animate) {
      // 애니메이션은 카드 안쪽에만 겁니다. 카드 본체에 걸면
      // transform 이 덮어써져 자리 위치를 잃고 왼쪽 위로 튑니다.
      c.in.classList.add('pop');
      setTimeout(() => c.in.classList.remove('pop'), 420);
    }

    // 이름이 나왔으니 이 자리의 번호는 지웁니다
    this.seatNumbers();
  },

  /** 카드를 다시 알로 덮습니다 */
  showEgg(deskId) {
    const c = this.cards[deskId];
    if (!c) return;
    c.in.innerHTML = '';
    c.in.classList.remove('pop');
    const egg = el('img', { class: 'egg', src: Frames.egg[0], alt: '' });
    View.sizeSprite(egg, EGG_SRC.w, EGG_SRC.h, CONFIG.avatar.eggScale, false);
    c.in.appendChild(egg);
    c.egg = egg;
    this.seatNumbers();   // 다시 덮였으니 번호도 되살립니다
  },

  /** 알들이 조금씩 흔들리게 */
  setWobble(on) {
    for (const id in this.cards) {
      if (State.data.revealed[id]) continue;
      this.cards[id].root.classList.toggle('wobble', !!on);
    }
  },

  /** 카드를 특정 책상 위치로 옮깁니다 (transition 은 호출한 쪽에서 지정) */
  moveCard(deskId, x, y, ms) {
    const c = this.cards[deskId];
    if (!c) return;
    const p = View.place(x, y, CONFIG.desk.width, CONFIG.desk.height);
    c.root.style.transition = ms ? `transform ${ms}ms cubic-bezier(.4,.05,.35,1)` : 'none';
    c.root.style.transform = `translate(${p.x}px, ${p.y}px)`;
  },

  /* ---------------- 프레임 애니메이션 이펙트 ---------------- */
  /** 지정한 위치에서 그림 여러 장을 순서대로 보여줍니다 */
  playFrames(srcs, x, y, size, frameMs) {
    return new Promise(resolve => {
      const img = el('img', { class: 'fx', src: srcs[0], alt: '' });
      Object.assign(img.style, {
        left: (x - size / 2) + 'px', top: (y - size / 2) + 'px',
        width: size + 'px', height: size + 'px',
      });
      $('#fxLayer').appendChild(img);
      let i = 0;
      const t = setInterval(() => {
        i++;
        if (i >= srcs.length) { clearInterval(t); img.remove(); resolve(); return; }
        img.src = srcs[i];
      }, frameMs);
    });
  },

  /** 책상 한가운데 좌표 */
  deskCenter(dk) {
    const w = CONFIG.desk.width, h = CONFIG.desk.height;
    const p = View.place(dk.x, dk.y, w, h);
    return { x: p.x + w / 2, y: p.y + h / 2 };
  },

  /* ---------------- 캐릭터 두 프레임 번갈아 보이기 ---------------- */
  startAvatarTicker() {
    setInterval(() => {
      this._frameFlip ^= 1;
      this._avatarImgs.forEach(img => {
        if (img._frames && img._frames.length > 1 && img.isConnected) {
          img.src = img._frames[this._frameFlip % img._frames.length];
        }
      });
      this._avatarImgs = this._avatarImgs.filter(i => i.isConnected);
    }, 520);
  },
};
