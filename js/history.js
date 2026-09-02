/* ============================================================
   되돌리기 / 다시 하기 — 교실 편집 전용
   ------------------------------------------------------------
   책상을 잘못 지우거나 배치를 흐트러뜨렸을 때 «Ctrl+Z» 로 돌아옵니다.

   ★ 무엇을 되돌리나
       교실의 «모양» 만 되돌립니다 — 책상 · 모둠 · 칠판 · 사물함 ·
       교실 크기 · 남·여 자리 · 사전에 정해둔 자리.

   ★ 무엇을 안 되돌리나
       · 학생 명단      — 명단은 설정 화면에서 따로 고치는 것이라 섞이면 헷갈립니다
       · 자리 섞은 결과 — 되돌릴 이유가 없고, 알이 깨지는 연출과 꼬입니다
       · 소리·표시점 설정

   ★ 언제 한 장 찍나
       무언가 «바꾸기 직전» 에 History.push() 를 부릅니다.
       바꾼 뒤에 부르면 이미 늦어서, 바뀐 모습이 저장됩니다.

   기억해 두는 것은 프로그램이 켜져 있는 동안뿐입니다.
   (새로고침하면 사라집니다. 그때는 이미 저장된 교실이 그대로 있습니다)
   ============================================================ */
'use strict';

const History = {

  MAX: 40,       // 몇 단계까지 되돌릴 수 있는지

  _undo: [],     // 되돌아갈 모습들 (마지막이 가장 최근)
  _redo: [],     // 되돌린 뒤 다시 갈 수 있는 모습들

  /** 지금 교실 모습을 한 장 (글자로 바꿔 두면 나중에 바뀌어도 안전합니다) */
  _snap() {
    const d = State.data;
    return JSON.stringify({
      room: d.room, board: d.board, lockers: d.lockers,
      groups: d.groups, desks: d.desks, useGroups: d.useGroups,
      preset: d.preset,
    });
  },

  /** ★ 무언가 바꾸기 «직전» 에 부릅니다 */
  push() {
    this._undo.push(this._snap());
    if (this._undo.length > this.MAX) this._undo.shift();
    // 새로 뭔가를 했으면 «다시 하기» 로 갈 앞날은 사라집니다
    this._redo.length = 0;
    this.refresh();
  },

  /** 방금 찍어 둔 한 장을 무릅니다 (아무것도 안 바뀌었을 때) */
  drop() {
    this._undo.pop();
    this.refresh();
  },

  canUndo() { return this._undo.length > 0; },
  canRedo() { return this._redo.length > 0; },

  undo() {
    if (!this._undo.length) { toast('되돌릴 것이 없습니다'); return; }
    this._redo.push(this._snap());
    this._apply(this._undo.pop());
    Sound.play('click');
    toast('되돌렸습니다');
  },

  redo() {
    if (!this._redo.length) { toast('다시 할 것이 없습니다'); return; }
    this._undo.push(this._snap());
    this._apply(this._redo.pop());
    Sound.play('click');
    toast('다시 했습니다');
  },

  _apply(json) {
    const s = JSON.parse(json);
    const d = State.data;
    const roomChanged = d.room.w !== s.room.w || d.room.h !== s.room.h;
    Object.assign(d, s);

    /* 되돌리면서 없어진 책상을 가리키는 찌꺼기를 정리합니다.
       (지웠던 책상을 되살리는 경우도 있으므로 매번 확인합니다) */
    const deskIds = new Set(d.desks.map(x => x.id));
    const stuIds  = new Set(d.students.map(x => x.id));
    ['preset', 'assignment'].forEach(k => {
      for (const dk in d[k]) {
        if (!deskIds.has(dk) || !stuIds.has(d[k][dk])) delete d[k][dk];
      }
    });
    for (const dk in d.revealed) if (!deskIds.has(dk)) delete d.revealed[dk];

    Render.all();
    if (roomChanged) View.fit();
    if (Editor.mode) Editor.select(null);
    Editor.refreshSexCount();
    Editor.refreshSnapBtn();
    Panel.refreshCounts();
    Panel.syncFromState();
    State.save();
    this.refresh();
  },

  /** 버튼을 누를 수 있는지 표시합니다 */
  refresh() {
    const u = $('#btnUndo'), r = $('#btnRedo');
    if (u) u.disabled = !this.canUndo();
    if (r) r.disabled = !this.canRedo();
  },
};
