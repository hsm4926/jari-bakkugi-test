/* 교실 편집: 책상·모둠·칠판·사물함을 마우스로 옮기고, 사전 자리를 정합니다. */
'use strict';

const Editor = {

  mode: null,          // null(편집 아님) | 'layout' | 'sex' | 'preset'
  sel: null,           // {kind, id}
  _drag: null,

  /* «남·여 자리» 모드에서 지금 골라 둔 붓.
       'b'  = 누르는 책상을 남자 자리로
       'g'  = 여자 자리로
       ''   = 지정 해제
       null = 아무것도 안 골랐음 (책상을 눌러도 바뀌지 않습니다)
     같은 버튼을 다시 누르면 꺼져서 null 이 됩니다. */
  brush: null,

  /* ---------------- 편집 켜고 끄기 ---------------- */
  toggle() { this.mode ? this.exit() : this.enter('layout'); },

  enter(mode) {
    // 둘 다 마우스로 끄는 모드라 겹치면 무엇을 끄는지 헷갈립니다.
    // (편집은 «책상» 을, 배치 관리는 «학생» 을 끕니다) 한 번에 하나만 켭니다.
    if (typeof Arrange !== 'undefined' && Arrange.on) Arrange.exit(true);
    this.mode = mode;
    document.body.classList.add('editing');
    document.body.classList.toggle('show-grid', mode === 'layout' || CONFIG.view.showGridAlways);
    $('#editbar').classList.remove('hidden');
    $('#btnEdit').classList.add('active');
    $$('.eb-mode').forEach(b => b.classList.toggle('active', b.dataset.editmode === mode));
    $('#ebLayoutTools').classList.toggle('hidden', mode !== 'layout');
    $('#ebSexTools').classList.toggle('hidden', mode !== 'sex');
    document.body.classList.toggle('editing-sex', mode === 'sex');

    // «남·여 자리» 로 들어오면 «남자 자리로» 붓을 미리 쥐어 줍니다.
    // (들어오자마자 바로 책상을 누를 수 있게. 다시 누르면 꺼집니다)
    if (mode === 'sex') { if (this.brush === null) this.setBrush('b'); else this.refreshBrush(); }
    else this.brush = null;

    const hasGroups = State.data.groups.length > 0;
    $('#btnAddGroup').textContent = hasGroups ? '모둠' : '모둠 만들기';
    $('#ebHint').textContent =
        mode === 'layout' ? (hasGroups
          ? '책상을 끌어서 옮기세요. 모둠 이름표를 끌면 모둠 전체가 움직입니다. Shift+드래그 = 칠판·사물함 크기 조절'
          : '책상을 끌어서 옮기세요. Shift+드래그 = 칠판·사물함 크기 조절')
      : mode === 'sex'
          ? '표시가 없는 책상에는 누구나 앉습니다. (색은 편집 중에만 보입니다)'
          : '책상을 눌러 앉힐 학생을 미리 정해 두세요.  ▸ 지금 공개 방식: '
            + (State.data.mode === 'preset' ? '사전 설정' : '무작위');
    banner(null);
    Render.applyEditVisuals();
    this.refreshSexCount();
    this.refreshDeskSize();
    History.refresh();
    View.applyZoom();
  },

  exit() {
    this.mode = null;
    this.select(null);
    document.body.classList.remove('editing');
    document.body.classList.remove('editing-sex');
    document.body.classList.toggle('show-grid', CONFIG.view.showGridAlways);
    $('#editbar').classList.add('hidden');
    $('#btnEdit').classList.remove('active');
    Picker.close();
    Render.applyEditVisuals();
    View.applyZoom();
    State.save();
  },

  /* ---------------- 선택 ---------------- */
  select(target) {
    $$('.selected').forEach(n => n.classList.remove('selected'));
    this.sel = target;
    if (!target) return;

    const node = $(`[data-kind="${target.kind}"][data-id="${target.id}"]`)
              || (target.kind === 'board' ? $('.board') : null);
    if (node) node.classList.add('selected');

    // 모둠은 이름표만 고르지만, 눈에 잘 띄도록 모둠 영역까지 함께 표시합니다
    if (target.kind === 'group') {
      const zone = $(`.group-zone[data-id="${target.id}"]`);
      if (zone) zone.classList.add('selected');
    }
  },

  /* ---------------- 마우스로 끌기 ---------------- */
  onPointerDown(e) {
    if (!this.mode) return false;
    const node = e.target.closest('[data-kind]');
    if (!node) { this.select(null); return false; }
    const kind = node.dataset.kind;
    const id = node.dataset.id || null;

    /* 사전 자리 정하기: 책상을 누르면 학생 고르기 팝업 */
    if (this.mode === 'preset') {
      // 소리는 «버튼» 을 누를 때만 냅니다. 책상은 버튼이 아니라 교실의 물건입니다.
      if (kind === 'desk') Picker.open(id, e.clientX, e.clientY);
      return true;
    }

    /* 남·여 자리: 골라 둔 붓으로 누른 책상을 칠합니다.
       이 모드에서는 책상을 끌어 옮길 수 없습니다 — 자리를 정하다가
       실수로 배치가 흐트러지면 되돌리기가 번거롭기 때문입니다. */
    if (this.mode === 'sex') {
      if (kind === 'desk') this.paintSex(id);
      return true;
    }

    if (kind === 'zone') return false;
    this.select({ kind, id });

    const d = State.data;
    const start = View.toStage(e.clientX, e.clientY);
    const resize = e.shiftKey && (kind === 'board' || kind === 'locker');

    let items = [];      // 함께 움직일 대상들
    if (kind === 'desk') {
      const dk = State.desk(id);
      items = [{ obj: dk, x0: dk.x, y0: dk.y }];
    } else if (kind === 'group') {
      items = State.desksOf(id).map(dk => ({ obj: dk, x0: dk.x, y0: dk.y }));
    } else if (kind === 'board') {
      items = [{ obj: d.board, x0: d.board.x, y0: d.board.y, w0: d.board.w, h0: d.board.h }];
    } else if (kind === 'locker') {
      const lk = d.lockers.find(l => l.id === id);
      items = [{ obj: lk, x0: lk.x, y0: lk.y, w0: lk.w, h0: lk.h }];
    }

    /* 여럿을 함께 옮길 때 한 개라도 벽을 넘지 않도록, 전체를 감싸는 범위를 재 둡니다.
       (예전에는 각자 clamp 해서 벽에 닿은 책상만 멈추고 모둠이 찌그러졌습니다) */
    const W = (it) => (it.obj.w || State.deskW());
    const H = (it) => (it.obj.h || State.deskH());
    const room = State.data.room;
    this._drag = {
      start, items, resize, moved: false,
      minX: Math.min(...items.map(it => it.x0)),
      minY: Math.min(...items.map(it => it.y0)),
      maxX: room.w - Math.max(...items.map(it => it.x0 + W(it))),
      maxY: room.h - Math.max(...items.map(it => it.y0 + H(it))),
    };
    node.setPointerCapture && node.setPointerCapture(e.pointerId);
    e.preventDefault();
    return true;
  },

  onPointerMove(e) {
    const dg = this._drag;
    if (!dg) return;
    const g = CONFIG.classroom.grid;
    const p = View.toStage(e.clientX, e.clientY);
    const dx = p.x - dg.start.x;
    const dy = p.y - dg.start.y;
    // 실제로 움직이기 시작한 순간에만 한 장 찍습니다.
    // (누르기만 하고 안 움직인 것까지 기록하면 «되돌리기» 가 헛돕니다)
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      if (!dg.moved) { History.push(); dg.moved = true; }
    }

    if (dg.resize) {
      const it = dg.items[0];
      it.obj.w = Math.max(g * 3, snap(it.w0 + dx, g));
      it.obj.h = Math.max(g * 2, snap(it.h0 + dy, g));
    } else {
      /* ★ «움직인 거리» 가 아니라 «놓이는 자리» 를 격자에 맞춥니다.
         거리만 맞추면 처음부터 격자에서 벗어나 있던 물건은 아무리 옮겨도
         계속 그만큼 어긋난 채로 남습니다. (v1.10.1 에서 고친 문제)

         모둠처럼 여러 개를 함께 옮길 때는 «맨 앞 하나» 만 격자에 맞추고
         그 차이를 나머지에 똑같이 더합니다. 각자 맞추면 서로의 간격이
         제각각 달라져서 모둠이 찌그러집니다. */
      const lead = dg.items[0];
      let mx = snap(lead.x0 + dx, g) - lead.x0;
      let my = snap(lead.y0 + dy, g) - lead.y0;
      // 함께 옮기는 것 전체가 교실 안에 머물도록 제한합니다
      mx = clamp(mx, -dg.minX, dg.maxX);
      my = clamp(my, -dg.minY, dg.maxY);
      dg.items.forEach(it => { it.obj.x = it.x0 + mx; it.obj.y = it.y0 + my; });
    }

    Render.room();
    Render.groups();
    Render.desks();
    this.select(this.sel);
    this.syncCards();
  },

  onPointerUp() {
    if (!this._drag) return;
    this._drag = null;
    State.save();
  },

  /** 책상이 움직이면 그 위의 카드도 따라오게.
      좌표 변환(교실 뒤집기)이 한 곳에서만 일어나도록 Render.moveCard 를 거칩니다. */
  syncCards() {
    State.data.desks.forEach(dk => Render.moveCard(dk.id, dk.x, dk.y, 0));
  },

  /* ============================================================
     남자 자리 · 여자 자리 정하기
     ------------------------------------------------------------
     선생님이 «남자 자리로» 같은 버튼을 하나 골라 둔 채로 책상을 누르면
     그 책상이 바뀝니다. 버튼은 다시 누르면 꺼집니다.
     ============================================================ */

  /** 붓 고르기. 이미 골라 둔 것을 다시 고르면 꺼집니다(null). */
  setBrush(v) {
    const next = (this.brush === v) ? null : v;
    this.brush = next;
    this.refreshBrush();
    Sound.play('click');
  },

  refreshBrush() {
    $$('.eb-brush').forEach(b =>
      b.classList.toggle('active', this.brush !== null && b.dataset.brush === this.brush));
  },

  /** 책상 하나를 지금 붓으로 칠합니다 */
  paintSex(deskId) {
    if (this.brush === null) {
      toast('위에서 «남자 자리로» 나 «여자 자리로» 를 먼저 골라 주세요', 2600);
      return;
    }
    const dk = State.desk(deskId);
    if (!dk) return;

    const want = this.brush || null;              // '' (지정 해제) 는 null 로
    if (State.deskSex(dk) === want) return;       // 이미 그 상태면 아무 일도 하지 않습니다
    History.push();
    if (want) dk.sex = want; else delete dk.sex;

    Render.paintDeskSex(deskId);                  // 그 책상 하나만 다시 칠합니다
    // 여기서도 소리를 내지 않습니다 — 책상을 쭉 훑어 칠할 때 딸깍이 연발돼 시끄럽습니다
    this.afterSexChange();
  },

  /** 모든 책상의 성별 지정을 지웁니다 */
  clearSex() {
    const marked = State.data.desks.filter(dk => State.deskSex(dk));
    if (!marked.length) { toast('성별을 정해 둔 자리가 없습니다'); return; }
    if (!confirm(`남자·여자 자리 지정 ${marked.length}개를 모두 지웁니다.\n계속할까요?`)) return;
    History.push();
    marked.forEach(dk => delete dk.sex);
    Render.desks();
    this.afterSexChange();
    toast(`${marked.length}개의 자리 지정을 지웠습니다`);
  },

  /* ============================================================
     책상 크기 1 · 2 · 3 단계
     ------------------------------------------------------------
     «멀리서 이름이 잘 안 보인다» 는 이야기에서 나온 기능입니다.

     ★ 책상만 키우면 안 됩니다 — 모둠 안의 책상 간격이 12px 밖에 안 돼서
       커진 책상끼리 곧바로 겹칩니다. 그래서 **자리도 그만큼 함께 벌립니다.**
       (배치의 «모양» 은 그대로 두고, 한가운데를 기준으로 사이만 넓힙니다)
     ★ 알과 캐릭터는 픽셀 그림이라 건드리지 않습니다. 정수배가 아니면 깨집니다.
     ============================================================ */
  setDeskSize(step) {
    step = clamp(parseInt(step, 10) || 1, 1, 3);
    const d = State.data;
    if (d.deskScale === step) return;

    History.push();
    const oldW = State.deskW(), oldH = State.deskH();
    d.deskScale = step;
    const r = State.deskW() / oldW;

    if (d.desks.length && Math.abs(r - 1) > 0.001) {
      /* ⚠️ 여기서 격자(20px)에 스냅하면 «안 됩니다».
         단계를 1→2→3→1 로 오갈 때마다 최대 10px 씩 오차가 쌓여,
         1단계로 되돌려도 배치가 처음과 달라집니다 (실제로 그렇게 어긋났습니다).
         1px 반올림만 하면 오차가 픽셀 이하라 몇 번을 오가도 제자리로 돌아옵니다.
         대신 책상이 격자에서 조금 벗어나는데, 눈에 띄지 않고 문제도 없습니다. */
      const cx = (Math.min(...d.desks.map(x => x.x)) +
                  Math.max(...d.desks.map(x => x.x + oldW))) / 2;
      const cy = (Math.min(...d.desks.map(x => x.y)) +
                  Math.max(...d.desks.map(x => x.y + oldH))) / 2;
      /* 1단계로 «돌아올 때» 는 격자에 붙입니다.
         오차가 1px 남짓이라 스냅하면 원래 자리를 정확히 되찾습니다.
         2·3단계에서는 스냅하면 오차가 쌓이므로 반올림만 합니다. */
      const g = CONFIG.classroom.grid;
      const fix = (v) => (step === 1 ? snap(v, g) : Math.round(v));
      d.desks.forEach(dk => {
        dk.x = fix(cx + (dk.x + oldW / 2 - cx) * r - State.deskW() / 2);
        dk.y = fix(cy + (dk.y + oldH / 2 - cy) * r - State.deskH() / 2);
      });
      this._fitDesks();
    }

    this.refreshDeskSize();
    Render.all();
    this.select(null);
    Sound.play('click');
    State.save();
    toast(step === 1 ? '책상 크기를 기본으로 되돌렸습니다'
                     : `책상 크기 ${step}단계 — 이름표가 더 커집니다`);
  },

  refreshDeskSize() {
    const now = State.deskStep();
    $$('.eb-dsize').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.dsize, 10) === now));
  },

  /** 책상 무리가 교실(칠판 아래 ~ 사물함 위) 안에 들어오도록 통째로 밀어 줍니다 */
  _fitDesks() {
    const d = State.data, W = State.deskW(), H = State.deskH();
    if (!d.desks.length) return;
    /* 화면에 실제로 그려지는 것은 책상보다 큽니다 —
       위로는 모둠 테두리와 «1모둠» 이름표(약 50px), 아래로는 의자와 테두리(약 30px). */
    const upper = (d.useGroups && d.groups.length) ? 50 : 6;
    const x1 = Math.min(...d.desks.map(x => x.x)) - 6;
    const x2 = Math.max(...d.desks.map(x => x.x + W)) + 6;
    const y1 = Math.min(...d.desks.map(x => x.y)) - upper;
    const y2 = Math.max(...d.desks.map(x => x.y + H)) + 30;
    const top = (d.board ? d.board.y + d.board.h : 0) + 8;
    const bot = d.lockers.length ? Math.min(...d.lockers.map(l => l.y)) - 8 : d.room.h - 8;

    // 애초에 안 들어가면 위·왼쪽에 붙입니다 (그래야 어디가 넘쳤는지 눈에 보입니다)
    const shift = (lo, hi, min, max) =>
      (hi - lo > max - min || lo < min) ? min - lo : (hi > max ? max - hi : 0);
    const dx = shift(x1, x2, 8, d.room.w - 8);
    const dy = shift(y1, y2, top, bot);
    if (dx || dy) d.desks.forEach(dk => { dk.x = Math.round(dk.x + dx); dk.y = Math.round(dk.y + dy); });

    if (y2 - y1 > bot - top || x2 - x1 > d.room.w - 16) {
      toast('책상이 커져서 교실을 넘칩니다 — 설정 ▸ 교실 크기를 늘려 보세요', 3600);
    }
  },

  afterSexChange() {
    this.refreshSexCount();
    Panel.refreshCounts();
    State.save();
  },

  /** 편집 툴바 오른쪽의 «남자 10 · 여자 10 · 누구나 4» 요약 */
  refreshSexCount() {
    const node = $('#ebSexCount');
    if (!node) return;
    if (this.mode !== 'sex') { node.textContent = ''; return; }

    const c = Seats.check();
    node.textContent = `남자 ${c.seatB} · 여자 ${c.seatG} · 누구나 ${c.seatFree}`;
    if (!c.ok) {
      node.appendChild(el('span', { class: 'bad', text: `   ⚠ ${c.short}자리 모자람` }));
    }
  },

  /* ---------------- 추가 / 삭제 ---------------- */

  /** 새 책상을 놓을 가로 위치. 격자에 맞추고 교실 밖으로 나가지 않게 합니다. */
  _gx(x) {
    const g = CONFIG.classroom.grid;
    const max = Math.floor((State.data.room.w - State.deskW()) / g) * g;
    return clamp(snap(x, g), 0, max);
  },

  addGroup() {
    History.push();
    const d = State.data;
    const no = (d.groups.reduce((m, g) => Math.max(m, g.no || 0), 0)) + 1;
    const g = {
      id: uid('gp'), no, name: no + '모둠',
      color: CONFIG.groupColors[(no - 1) % CONFIG.groupColors.length],
    };
    d.groups.push(g);
    d.useGroups = true;    // 모둠이 생겼으니 설정도 '모둠 있음' 으로 맞춥니다

    const seats = CONFIG.classroom.seatsPerGroup;
    const blk = Layout.blockSize(seats);
    const bx = snap(d.room.w / 2 - blk.w / 2 + (no % 3) * 30, CONFIG.classroom.grid);
    const by = snap(d.room.h / 2 - blk.h / 2 + (no % 3) * 30, CONFIG.classroom.grid);
    for (let i = 0; i < seats; i++) {
      d.desks.push({
        id: uid('dk'), gid: g.id, no: i + 1,
        // 격자에 맞춰 놓습니다. 안 그러면 이 모둠만 다른 책상들과 줄이 안 맞습니다.
        x: snap(bx + (i % blk.cols) * (State.deskW() + blk.gapX), CONFIG.classroom.grid),
        y: snap(by + Math.floor(i / blk.cols) * (State.deskH() + blk.gapY), CONFIG.classroom.grid),
      });
    }
    this.afterStructureChange(`${g.name}을(를) 만들었습니다`);
  },

  addDesk() {
    History.push();
    const d = State.data;

    // 모둠이 없는 교실이면 그냥 책상 하나를 더 놓습니다
    if (!d.groups.length) {
      const last = d.desks[d.desks.length - 1];
      const no = d.desks.reduce((m, x) => Math.max(m, x.no || 0), 0) + 1;
      d.desks.push({
        id: uid('dk'), gid: null, no,
        x: last ? this._gx(last.x + State.deskW() + 40) : 100,
        y: last ? last.y : 100,
      });
      this.afterStructureChange('책상을 하나 늘렸습니다');
      return;
    }

    let gid = null;
    if (this.sel && this.sel.kind === 'desk') gid = State.desk(this.sel.id).gid;
    else if (this.sel && this.sel.kind === 'group') gid = this.sel.id;
    else gid = d.groups[d.groups.length - 1].id;

    const mine = State.desksOf(gid);
    const last = mine[mine.length - 1];
    const no = mine.reduce((m, x) => Math.max(m, x.no || 0), 0) + 1;
    d.desks.push({
      id: uid('dk'), gid, no,
      x: last ? this._gx(last.x + State.deskW() + Layout.blockSize(2).gapX) : 100,
      y: last ? last.y : 100,
    });
    this.afterStructureChange('책상을 하나 늘렸습니다');
  },

  addLocker() {
    History.push();
    const d = State.data;
    d.lockers.push({
      id: uid('lk'),
      x: snap(d.room.w * 0.1, CONFIG.classroom.grid),
      y: snap(d.room.h * 0.5, CONFIG.classroom.grid),
      w: snap(d.room.w * 0.3, CONFIG.classroom.grid),
      h: snap(56, CONFIG.classroom.grid),
    });
    this.afterStructureChange('사물함을 놓았습니다');
  },

  deleteSelected() {
    if (!this.sel) { toast('먼저 지울 것을 눌러서 골라 주세요'); return; }
    History.push();
    const d = State.data;
    const { kind, id } = this.sel;

    if (kind === 'desk') {
      d.desks = d.desks.filter(x => x.id !== id);
      delete d.preset[id]; delete d.assignment[id]; delete d.revealed[id];
      this.afterStructureChange('책상을 지웠습니다');
    } else if (kind === 'group') {
      const mine = State.desksOf(id).map(x => x.id);
      d.desks = d.desks.filter(x => x.gid !== id);
      d.groups = d.groups.filter(x => x.id !== id);
      mine.forEach(dk => { delete d.preset[dk]; delete d.assignment[dk]; delete d.revealed[dk]; });
      this.afterStructureChange('모둠을 지웠습니다');
    } else if (kind === 'locker') {
      d.lockers = d.lockers.filter(x => x.id !== id);
      this.afterStructureChange('사물함을 지웠습니다');
    } else {
      toast('칠판은 지울 수 없습니다');
    }
  },

  afterStructureChange(msg) {
    Render.all();
    this.select(null);
    Panel.refreshCounts();
    this.refreshSexCount();
    State.save();
    if (msg) toast(msg);
  },
};

/* ============================================================
   사전 자리 정하기 — 학생 고르는 팝업
   ============================================================ */
const Picker = {
  deskId: null,

  open(deskId, clientX, clientY) {
    this.deskId = deskId;
    const box = $('#picker');
    const list = $('#pickerList');
    list.innerHTML = '';

    const dk = State.desk(deskId);
    const g = dk ? State.group(dk.gid) : null;
    const want = State.deskSex(dk);        // 이 자리가 남자·여자 자리로 정해져 있는지
    $('#pickerTitle').textContent =
      (g ? g.name + ' ' : '') + (dk && dk.no ? dk.no + '번 자리' : '자리')
      + (want ? (want === 'b' ? ' · 남자 자리' : ' · 여자 자리') : '');

    const taken = State.presetTakenIds();
    const cur = State.data.preset[deskId];

    list.appendChild(el('button', {
      class: 'picker-item clear', text: '— 비우기 —',
      onclick: () => { History.push(); delete State.data.preset[deskId]; this.done(); },
    }));

    if (!State.data.students.length) {
      list.appendChild(el('div', { class: 'hint', style: { padding: '10px' },
        text: '학생 명단이 비어 있습니다. 설정 → 학생 명단에서 먼저 입력해 주세요.' }));
    }

    State.data.students.forEach(s => {
      const isTaken = taken.has(s.id) && s.id !== cur;
      // 남자 자리에 여학생을 앉히는 것도 막지는 않습니다. 선생님이 일부러 그럴 수 있으니
      // 흐리게 표시만 하고, 고르면 그대로 들어갑니다.
      const odd = want && (s.sex === 'g' ? 'g' : 'b') !== want;
      list.appendChild(el('button', {
        class: 'picker-item' + (isTaken ? ' taken' : '') + (odd ? ' taken' : ''),
        text: s.name + (isTaken ? ' (이미 배정됨)' : (s.id === cur ? ' ✓' : ''))
              + (odd ? (s.sex === 'g' ? ' (여)' : ' (남)') : ''),
        onclick: () => {
          History.push();
          // 다른 자리에 있던 같은 학생은 비워 줍니다
          for (const k in State.data.preset) if (State.data.preset[k] === s.id) delete State.data.preset[k];
          State.data.preset[deskId] = s.id;
          this.done();
        },
      }));
    });

    box.classList.remove('hidden');
    const w = 220, h = Math.min(340, list.scrollHeight + 46);
    box.style.left = clamp(clientX - w / 2, 8, innerWidth - w - 8) + 'px';
    box.style.top  = clamp(clientY + 14, 8, innerHeight - h - 8) + 'px';
  },

  done() {
    Sound.play('click');   // 팝업 안의 이름·«비우기» 도 버튼입니다
    Render.desks();
    State.save();
    this.close();
  },

  close() { $('#picker').classList.add('hidden'); this.deskId = null; },
};
