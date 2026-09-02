/* ============================================================
   «현재 배치» 모드 — 지금 앉은 자리를 보고 손으로 고치기
   ------------------------------------------------------------
   섞어서 나온 결과가 마음에 안 들 때(짝을 떼어 놓고 싶다든지)
   학생을 끌어다 자리를 바꿉니다.

     · 학생을 끌어서 다른 책상에 놓으면 → 두 사람이 자리를 «맞바꿉니다»
     · 빈 책상에 놓으면 → 그냥 옮겨 갑니다
     · 교실 뒤집기(T)도 그대로 됩니다 (좌표 변환은 View.place 한 곳에서 합니다)

   교실 편집(Editor)과는 다른 모드입니다.
   교실 편집은 «책상» 을 옮기고 학생 카드를 숨기지만,
   여기는 반대로 «학생» 을 옮기고 책상은 그대로 둡니다.
   ============================================================ */
'use strict';

const Arrange = {

  on: false,
  _drag: null,     // { deskId, node, dx, dy }

  /* ---------------- 켜고 끄기 ---------------- */
  toggle() { this.on ? this.exit() : this.enter(); },

  enter() {
    if (!Layouts.canSave()) {
      toast('먼저 자리 섞기를 해주세요', 2600);
      return;
    }
    if (Editor.mode) Editor.exit();
    this.on = true;
    document.body.classList.add('arranging');
    $('#btnArrange').classList.add('active');
    Layouts.closePicker();

    // 이 모드에서는 아직 덮여 있는 알도 전부 열어 보여 줍니다
    // (실제 «공개» 상태를 바꾸는 것이라, 나가도 그대로 열려 있습니다)
    const d = State.data;
    State.orderedDesks().forEach(dk => { if (d.assignment[dk.id]) d.revealed[dk.id] = true; });
    Shuffle._finished = true;      // 축하 연출이 뒤늦게 튀어나오지 않게

    Render.cards_();
    Render.setWobble(false);
    Layouts.render();
    $('#slotPanel').classList.remove('hidden');
    this._placePanel();
    banner('학생을 끌어서 자리를 바꿀 수 있습니다', 3200);
    Sound.play('page');
    State.save();
  },

  exit() {
    this.on = false;
    document.body.classList.remove('arranging');
    $('#btnArrange').classList.remove('active');
    $('#slotPanel').classList.add('hidden');
    this._drag = null;
    banner(null);
    Sound.play('page');
    State.save();
  },

  /* ============================================================
     학생 끌어서 자리 바꾸기
     ============================================================ */
  onPointerDown(e) {
    if (!this.on) return false;
    const card = e.target.closest('.card');
    if (!card) return false;

    const deskId = card.dataset.desk;
    if (!State.data.assignment[deskId]) return false;

    const p = View.toStage(e.clientX, e.clientY);
    const dk = State.desk(deskId);
    this._drag = { deskId, node: card, dx: p.x - dk.x, dy: p.y - dk.y, moved: false };
    card.classList.add('dragging');
    e.preventDefault();
    return true;
  },

  onPointerMove(e) {
    const dg = this._drag;
    if (!dg) return;
    dg.moved = true;
    const p = View.toStage(e.clientX, e.clientY);
    // 끄는 동안에는 격자에 맞추지 않습니다 — 손끝을 그대로 따라와야 자연스럽습니다
    Render.moveCard(dg.deskId, p.x - dg.dx, p.y - dg.dy, 0);

    // 지금 어느 책상 위에 있는지 표시해 줍니다
    const over = this._deskAt(p.x, p.y);
    $$('.desk.drop').forEach(n => n.classList.remove('drop'));
    if (over && over.id !== dg.deskId && Render.deskNodes[over.id]) {
      Render.deskNodes[over.id].classList.add('drop');
    }
  },

  onPointerUp(e) {
    const dg = this._drag;
    if (!dg) return;
    this._drag = null;
    dg.node.classList.remove('dragging');
    $$('.desk.drop').forEach(n => n.classList.remove('drop'));

    const dk = State.desk(dg.deskId);
    if (!dg.moved || !dk) { Render.moveCard(dg.deskId, dk.x, dk.y, 0); return; }

    const p = View.toStage(e.clientX, e.clientY);
    const target = this._deskAt(p.x - dg.dx + CONFIG.desk.width / 2,
                               p.y - dg.dy + CONFIG.desk.height / 2);

    if (!target || target.id === dg.deskId) {
      // 제자리로 돌아갑니다
      Render.moveCard(dg.deskId, dk.x, dk.y, 160);
      return;
    }
    this.swap(dg.deskId, target.id);
  },

  /** 두 자리를 맞바꿉니다 (한쪽이 비어 있으면 그냥 옮겨 갑니다) */
  swap(a, bId) {
    const d = State.data;
    const sa = d.assignment[a], sb = d.assignment[bId];

    if (sb) d.assignment[a] = sb; else delete d.assignment[a];
    d.assignment[bId] = sa;

    // 공개 상태도 함께 따라갑니다 (안 그러면 옮긴 자리가 알로 덮입니다)
    d.revealed[bId] = true;
    if (sb) d.revealed[a] = true; else delete d.revealed[a];

    Render.cards_();
    Render.setWobble(false);
    Sound.play('click');
    State.save();
    Arrange.refreshSaveBtn();
  },

  /** 교실 좌표 위에 있는 책상 찾기 */
  _deskAt(x, y) {
    const w = CONFIG.desk.width, h = CONFIG.desk.height;
    // 뒤에 그려진 것부터 찾아야 겹쳤을 때 «위에 있는 것» 이 잡힙니다
    const list = State.data.desks.slice().reverse();
    return list.find(dk => x >= dk.x && x <= dk.x + w && y >= dk.y && y <= dk.y + h) || null;
  },

  /* ============================================================
     저장 버튼 — 섞은 결과가 있을 때만 보이고, 다 공개되면 빛납니다
     ============================================================ */
  refreshSaveBtn() {
    const btn = $('#btnSaveLayout');
    if (!btn) return;
    const can = Layouts.canSave();
    btn.classList.toggle('hidden', !can);
    btn.classList.toggle('ready', can && Layouts.allRevealed());
    if (!can) Layouts.closePicker();
    // 자리가 바뀌면 «지금 배치» 노란 불도 따라 옮겨 가야 합니다
    Layouts.render();
  },

  /* ============================================================
     떠다니는 목록 창 — 접기 · 끌어서 옮기기
     ============================================================ */
  toggleFold() {
    const n = $('#slotPanel');
    const folded = n.classList.toggle('folded');
    $('#spFold').textContent = folded ? '▸' : '▾';
    this._savePanel();
  },

  /** 저장해 둔 위치로 창을 놓습니다 (화면 밖으로 나가지 않게 확인합니다) */
  _placePanel() {
    const n = $('#slotPanel');
    const s = (State.data.settings || {}).slotPanel;
    const w = 232, h = 60;
    let x = (s && typeof s.x === 'number') ? s.x : (window.innerWidth - w - 24);
    let y = (s && typeof s.y === 'number') ? s.y : 130;
    n.style.left = clamp(x, 4, Math.max(4, window.innerWidth  - w)) + 'px';
    n.style.top  = clamp(y, 4, Math.max(4, window.innerHeight - h)) + 'px';
    const folded = !!(s && s.folded);
    n.classList.toggle('folded', folded);
    $('#spFold').textContent = folded ? '▸' : '▾';
  },

  _savePanel() {
    const n = $('#slotPanel');
    State.data.settings.slotPanel = {
      x: parseInt(n.style.left, 10) || 0,
      y: parseInt(n.style.top, 10) || 0,
      folded: n.classList.contains('folded'),
    };
    State.save();
  },

  /** 창 제목을 잡고 끌면 창이 따라옵니다 */
  initPanelDrag() {
    const n = $('#slotPanel'), head = $('#spHead');
    let d = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;      // 접기 버튼은 그대로 눌립니다
      const r = n.getBoundingClientRect();
      d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      head.setPointerCapture && head.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => {
      if (!d) return;
      const r = n.getBoundingClientRect();
      n.style.left = clamp(e.clientX - d.dx, 4, window.innerWidth  - r.width)  + 'px';
      n.style.top  = clamp(e.clientY - d.dy, 4, window.innerHeight - r.height) + 'px';
    });
    window.addEventListener('pointerup', () => { if (d) { d = null; this._savePanel(); } });
  },
};
