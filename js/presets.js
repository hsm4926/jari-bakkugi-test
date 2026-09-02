/* 프리셋 — 교실 하나를 통째로 저장해 두고 나중에 그대로 불러옵니다.
   ------------------------------------------------------------------
   한 프리셋에 함께 들어가는 것:
     · 교실 크기 · 칠판 · 사물함 · 모둠 · 책상 배치
     · 학생 명단
     · 미리 정해둔 자리 (사전 자리)

   들어가지 '않는' 것:
     · 이번에 섞은 결과와 공개 상태 (매번 새로 뽑는 값이라 저장할 이유가 없습니다)
     · 공개 방식(무작위 / 사전 설정) — 선생님이 그때그때 정하는 값이라,
       프리셋을 불러왔다고 방식이 몰래 바뀌면 오히려 위험합니다
     · 소리 설정 (컴퓨터마다 다르게 두는 값)

   ⚠️ 이름 주의: 아래 `State.data.presets` 는 '프리셋 목록' 이고,
      `State.data.preset` 은 '미리 정해둔 자리' 입니다. 글자 하나 차이라 헷갈리기 쉽습니다.
*/
'use strict';

const Presets = {

  MAX: 20,          // 너무 많이 쌓이지 않게
  NAME_MAX: 24,

  list() { return State.data.presets || (State.data.presets = []); },

  /* ---------------- 지금 교실을 통째로 복사 ---------------- */
  snapshot() {
    const d = State.data;
    return JSON.parse(JSON.stringify({
      room: d.room,
      board: d.board,
      lockers: d.lockers,
      groups: d.groups,
      desks: d.desks,
      useGroups: d.useGroups !== false,
      deskScale: d.deskScale || 1,   // 「책상 크기」 단계
      students: d.students,
      preset: d.preset,          // 미리 정해둔 자리
      assignment: d.assignment,  // 지금 앉아 있는 자리 (섞은 결과)
      layouts: d.layouts,        // 칸에 저장해 둔 배치 5개
    }));
  },

  /* ---------------- 저장 ---------------- */
  saveNew() {
    const raw = $('#inPresetName').value;
    const name = String(raw || '').trim().slice(0, this.NAME_MAX);
    if (!name) { toast('프리셋 이름을 먼저 적어 주세요'); $('#inPresetName').focus(); return; }

    const list = this.list();
    const same = list.find(p => p.name === name);
    if (same) {
      if (!confirm(`「${name}」 이(가) 이미 있습니다.\n지금 교실 내용으로 덮어쓸까요?`)) return;
      same.data = this.snapshot();
      same.savedAt = Date.now();
      this._after(`「${name}」 을(를) 덮어썼습니다`);
      return;
    }
    if (list.length >= this.MAX) {
      toast(`프리셋은 ${this.MAX}개까지만 저장할 수 있습니다. 안 쓰는 것을 지워 주세요`, 3500);
      return;
    }

    list.push({ id: uid('ps'), name, savedAt: Date.now(), data: this.snapshot() });
    $('#inPresetName').value = '';
    this._after(`「${name}」 으로 저장했습니다`);
  },

  overwrite(id) {
    const p = this.list().find(x => x.id === id);
    if (!p) return;
    if (!confirm(`「${p.name}」 을(를) 지금 교실 내용으로 덮어씁니다.\n예전에 저장한 내용은 사라집니다. 계속할까요?`)) return;
    p.data = this.snapshot();
    p.savedAt = Date.now();
    this._after(`「${p.name}」 을(를) 덮어썼습니다`);
  },

  /* ---------------- 불러오기 ---------------- */
  load(id) {
    const p = this.list().find(x => x.id === id);
    if (!p || !p.data) return;
    if (!confirm(`「${p.name}」 을(를) 불러옵니다.\n\n지금의 책상 배치 · 학생 명단 · 사전 자리는`
               + ` 이 프리셋의 내용으로 바뀝니다.\n(지금 상태를 남겨 두려면 먼저 프리셋으로 저장하세요)\n\n계속할까요?`)) return;

    const d = State.data;
    const s = JSON.parse(JSON.stringify(p.data));
    const roomChanged = !d.room || d.room.w !== s.room.w || d.room.h !== s.room.h;

    d.room      = s.room;
    d.board     = s.board;
    d.lockers   = s.lockers   || [];
    d.groups    = s.groups    || [];
    d.desks     = s.desks     || [];
    d.useGroups = s.useGroups !== false;
    d.deskScale = [1, 2, 3].includes(s.deskScale) ? s.deskScale : 1;
    d.students  = s.students  || [];
    d.preset    = s.preset    || {};

    /* 저장해 둔 배치와 «지금 앉은 자리» 도 함께 되살립니다.
       배치가 들어 있으면 이미 아는 자리이므로 덮지 않고 바로 보여 줍니다. */
    d.layouts = State.fixLayouts(s.layouts);
    d.assignment = {};
    d.revealed = {};
    const deskIds = new Set(d.desks.map(x => x.id));
    const stuIds  = new Set(d.students.map(x => x.id));
    for (const dk in (s.assignment || {})) {
      const sid = s.assignment[dk];
      if (deskIds.has(dk) && stuIds.has(sid)) { d.assignment[dk] = sid; d.revealed[dk] = true; }
    }
    d.isShuffled = Object.keys(d.assignment).length > 0;
    Shuffle._pending = 0;
    Shuffle._finished = true;
    Shuffle._revealToken++;      // 돌아가던 순차 공개가 있으면 멈춥니다
    if (Arrange.on) Arrange.exit();

    if (Editor.mode) Editor.exit();
    Render.all();
    if (roomChanged) View.fit();  // 교실 크기가 달라졌으면 화면에 다시 맞춥니다
    Panel.syncFromState();
    Layouts.render();
    Arrange.refresh();
    State.save();
    toast(`「${p.name}」 을(를) 불러왔습니다`);
    banner(d.isShuffled ? `${p.name} — 저장해 둔 자리입니다`
                        : `${p.name} — 자리 섞기를 눌러 주세요`, 3000);
  },

  /* ---------------- 이름 바꾸기 · 지우기 ---------------- */
  rename(id) {
    const p = this.list().find(x => x.id === id);
    if (!p) return;
    const raw = prompt('새 이름을 적어 주세요', p.name);
    if (raw === null) return;
    const name = String(raw).trim().slice(0, this.NAME_MAX);
    if (!name) { toast('이름은 비워 둘 수 없습니다'); return; }
    if (this.list().some(x => x.id !== id && x.name === name)) {
      toast('같은 이름이 이미 있습니다'); return;
    }
    p.name = name;
    this._after('이름을 바꿨습니다');
  },

  remove(id) {
    const p = this.list().find(x => x.id === id);
    if (!p) return;
    if (!confirm(`「${p.name}」 을(를) 지웁니다.\n되돌릴 수 없습니다. 계속할까요?`)) return;
    State.data.presets = this.list().filter(x => x.id !== id);
    this._after(`「${p.name}」 을(를) 지웠습니다`);
  },

  _after(msg) {
    this.render();
    State.save();
    if (msg) toast(msg);
  },

  /* ---------------- 목록 그리기 ---------------- */
  render() {
    const box = $('#presetList');
    if (!box) return;
    const list = this.list().slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

    $('#presetCount').textContent = `${list.length} / ${this.MAX} 개`;
    box.innerHTML = '';

    if (!list.length) {
      box.appendChild(el('p', {
        class: 'hint',
        text: '아직 저장한 프리셋이 없습니다. 위에 이름을 적고 «지금 상태 저장» 을 눌러 보세요.',
      }));
      return;
    }

    list.forEach(p => {
      const item = el('div', { class: 'preset-item' });
      item.appendChild(el('div', { class: 'preset-name', text: p.name }));
      item.appendChild(el('div', { class: 'preset-sub', text: this._summary(p) }));

      const row = el('div', { class: 'preset-btns' });
      const add = (label, cls, fn) => {
        const b = el('button', { class: 'btn btn-sm ' + cls, text: label });
        b.onclick = fn;
        row.appendChild(b);
      };
      add('불러오기', 'btn-main', () => this.load(p.id));
      add('덮어쓰기', '',          () => this.overwrite(p.id));
      add('이름 바꾸기', '',       () => this.rename(p.id));
      add('삭제', 'btn-danger',    () => this.remove(p.id));
      item.appendChild(row);

      box.appendChild(item);
    });
  },

  /** 「24자리 · 학생 24명 · 사전 자리 12 · 8월 31일 저장」 */
  _summary(p) {
    const s = p.data || {};
    const seats = (s.desks || []).length;
    const stu   = (s.students || []).length;
    const fixed = Object.keys(s.preset || {}).length;
    const grp   = (s.groups || []).length;

    const bits = [];
    bits.push(grp ? `${grp}모둠 ${seats}자리` : `모둠 없음 · ${seats}자리`);
    bits.push(`학생 ${stu}명`);
    // 남·여 자리를 정해 둔 프리셋이면 그 수도 보여 줍니다
    const sb = (s.desks || []).filter(x => x.sex === 'b').length;
    const sg = (s.desks || []).filter(x => x.sex === 'g').length;
    if (sb || sg) bits.push(`남자 ${sb} · 여자 ${sg} 자리`);
    if (fixed) bits.push(`사전 자리 ${fixed}`);
    const saved = (s.layouts || []).filter(Boolean).length;
    if (saved) bits.push(`저장 배치 ${saved}`);

    if (p.savedAt) {
      const d = new Date(p.savedAt);
      bits.push(`${d.getMonth() + 1}월 ${d.getDate()}일 저장`);
    }
    return bits.join('  ·  ');
  },
};
