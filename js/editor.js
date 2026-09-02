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
      if (kind === 'desk') { Sound.play('click'); Picker.open(id, e.clientX, e.clientY); }
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

    this._drag = { start, items, resize, moved: false };
    node.setPointerCapture && node.setPointerCapture(e.pointerId);
    e.preventDefault();
    return true;
  },

  onPointerMove(e) {
    const dg = this._drag;
    if (!dg) return;
    const g = CONFIG.classroom.grid;
    const p = View.toStage(e.clientX, e.clientY);
    const dx = snap(p.x - dg.start.x, g);
    const dy = snap(p.y - dg.start.y, g);
    if (dx || dy) dg.moved = true;

    dg.items.forEach(it => {
      if (dg.resize) {
        it.obj.w = Math.max(g * 3, it.w0 + dx);
        it.obj.h = Math.max(g * 2, it.h0 + dy);
      } else {
        it.obj.x = clamp(it.x0 + dx, 0, State.data.room.w - (it.obj.w || CONFIG.desk.width));
        it.obj.y = clamp(it.y0 + dy, 0, State.data.room.h - (it.obj.h || CONFIG.desk.height));
      }
    });

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

  /** 책상이 움직이면 그 위의 카드도 따라오게 */
  syncCards() {
    State.data.desks.forEach(dk => {
      const c = Render.cards[dk.id];
      if (c) { c.root.style.transition = 'none'; c.root.style.transform = `translate(${dk.x}px, ${dk.y}px)`; }
    });
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
    if (want) dk.sex = want; else delete dk.sex;

    Sound.play('click');
    Render.paintDeskSex(deskId);                  // 그 책상 하나만 다시 칠합니다
    this.afterSexChange();
  },

  /** 모든 책상의 성별 지정을 지웁니다 */
  clearSex() {
    const marked = State.data.desks.filter(dk => State.deskSex(dk));
    if (!marked.length) { toast('성별을 정해 둔 자리가 없습니다'); return; }
    if (!confirm(`남자·여자 자리 지정 ${marked.length}개를 모두 지웁니다.\n계속할까요?`)) return;
    marked.forEach(dk => delete dk.sex);
    Render.desks();
    this.afterSexChange();
    toast(`${marked.length}개의 자리 지정을 지웠습니다`);
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
  addGroup() {
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
        x: bx + (i % blk.cols) * (CONFIG.desk.width + blk.gapX),
        y: by + Math.floor(i / blk.cols) * (CONFIG.desk.height + blk.gapY),
      });
    }
    this.afterStructureChange(`${g.name}을(를) 만들었습니다`);
  },

  addDesk() {
    const d = State.data;

    // 모둠이 없는 교실이면 그냥 책상 하나를 더 놓습니다
    if (!d.groups.length) {
      const last = d.desks[d.desks.length - 1];
      const no = d.desks.reduce((m, x) => Math.max(m, x.no || 0), 0) + 1;
      d.desks.push({
        id: uid('dk'), gid: null, no,
        x: last ? clamp(last.x + CONFIG.desk.width + 34, 0, d.room.w - CONFIG.desk.width) : 100,
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
      x: last ? clamp(last.x + CONFIG.desk.width + 12, 0, d.room.w - CONFIG.desk.width) : 100,
      y: last ? last.y : 100,
    });
    this.afterStructureChange('책상을 하나 늘렸습니다');
  },

  addLocker() {
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

  /** 자리는 그대로 두고 위치만 처음처럼 가지런히 */
  relayout() {
    const d = State.data;

    // 모둠이 없는 교실이면 책상만 격자로 다시 줄 세웁니다
    if (!d.groups.length) {
      if (!d.desks.length) return;
      const built = Layout.buildPlain(d.desks.length, d.room.w, d.room.h);
      d.board = built.board;
      d.lockers = built.lockers;
      d.desks.slice().sort((a, b) => (a.no || 0) - (b.no || 0))
        .forEach((dk, i) => { const s = built.desks[i]; if (s) { dk.x = s.x; dk.y = s.y; } });
      this.afterStructureChange('처음 배치로 되돌렸습니다');
      return;
    }

    const seats = Math.max(...d.groups.map(g => State.desksOf(g.id).length), 1);
    const built = Layout.build(d.groups.length, seats, d.room.w, d.room.h);

    d.board = built.board;
    d.lockers = built.lockers;
    d.groups.forEach((g, gi) => {
      const slots = built.desks.slice(gi * seats, (gi + 1) * seats);
      const mine = State.desksOf(g.id).sort((a, b) => (a.no || 0) - (b.no || 0));
      mine.forEach((dk, i) => {
        const s = slots[i] || slots[slots.length - 1];
        if (s) { dk.x = s.x; dk.y = s.y; }
      });
    });
    this.afterStructureChange('처음 배치로 되돌렸습니다');
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
      onclick: () => { delete State.data.preset[deskId]; this.done(); },
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
    Render.desks();
    State.save();
    this.close();
  },

  close() { $('#picker').classList.add('hidden'); this.deskId = null; },
};
