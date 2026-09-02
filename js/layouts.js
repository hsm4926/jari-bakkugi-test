/* ============================================================
   지금 자리 배치를 칸에 저장해 두기 (5칸)
   ------------------------------------------------------------
   자리를 섞어서 나온 «이번 배치» 를 그대로 기억해 두었다가
   나중에 다시 불러옵니다.

   ⚠️ 이름이 비슷한 것이 셋이라 헷갈리기 쉽습니다.
       · State.data.preset   = 사전에 «정해 두는» 자리 (섞기 전, 선생님만 앎)
       · State.data.presets  = 교실을 통째로 저장 (책상 배치 + 명단 + 사전 자리)
       · State.data.layouts  = ★ 여기. 이미 «섞여 나온 결과» 를 그대로 기억
   ============================================================ */
'use strict';

const Layouts = {

  SLOTS: 5,

  list() { return State.data.layouts || (State.data.layouts = State.fixLayouts(null)); },

  /* ---------------- 지금 배치를 한 장 ---------------- */
  /**
   * 책상id ↔ 학생id 짝을 그대로 적어 둡니다.
   * 학생 이름도 함께 남깁니다 — 나중에 명단이 바뀌어도
   * 「누가 있었는지」 를 목록에서 보여 줄 수 있습니다.
   */
  snapshot() {
    const d = State.data;
    const pairs = [];
    State.orderedDesks().forEach(dk => {
      const sid = d.assignment[dk.id];
      if (!sid) return;
      const stu = State.student(sid);
      pairs.push([dk.id, sid, stu ? stu.name : '']);
    });
    const t = new Date();
    return {
      name: `${t.getMonth() + 1}월 ${t.getDate()}일 ${('0'+t.getHours()).slice(-2)}:${('0'+t.getMinutes()).slice(-2)}`,
      savedAt: t.getTime(),
      pairs,
    };
  },

  /** 지금 저장할 수 있는 상태인지 (섞어서 앉은 사람이 있어야 합니다) */
  canSave() {
    const d = State.data;
    return !!d.isShuffled && Object.keys(d.assignment).length > 0;
  },

  /* ============================================================
     지금 화면에 깔린 배치가 어느 칸에 저장된 것인지
     ------------------------------------------------------------
     «책상↔학생» 짝이 통째로 같으면 같은 배치로 봅니다.
     그래서 불러온 뒤 한 명이라도 손으로 옮기면 불이 꺼집니다.
     («저장해 둔 그 배치» 가 더는 아니니, 그게 맞습니다)
     ============================================================ */
  _key(pairs) {
    return pairs.map(x => x[0] + '\u0001' + x[1]).sort().join('|');
  },

  /** 지금 배치의 열쇠. 아무도 안 앉아 있으면 null */
  nowKey() {
    const a = State.data.assignment, pairs = [];
    for (const dk in a) if (a[dk]) pairs.push([dk, a[dk]]);
    return pairs.length ? this._key(pairs) : null;
  },

  /** 모두 공개되었는지 — 저장 버튼을 빛나게 할지 정합니다 */
  allRevealed() {
    const d = State.data;
    const seats = State.orderedDesks().filter(dk => d.assignment[dk.id]);
    return seats.length > 0 && seats.every(dk => d.revealed[dk.id]);
  },

  /* ---------------- 저장 ---------------- */
  save(i) {
    if (!this.canSave()) { toast('먼저 자리 섞기를 해주세요'); return false; }
    const list = this.list();
    const old = list[i];
    if (old && !confirm(`${i + 1}번 칸에 이미 「${old.name}」 이(가) 있습니다.\n지금 배치로 덮어쓸까요?`)) {
      return false;
    }
    list[i] = this.snapshot();
    State.save();
    this.render();
    toast(`${i + 1}번 칸에 이번 자리를 저장했습니다`);
    Sound.play('click');
    return true;
  },

  /* ---------------- 불러오기 ----------------
     저장한 뒤에 책상을 지웠거나 학생이 빠졌을 수 있습니다.
     지금 있는 것만 되살리고, 몇 명을 되살렸는지 알려 줍니다. */
  load(i, ask) {
    const p = this.list()[i];
    if (!p) { toast('그 칸은 비어 있습니다'); return; }

    const deskIds = new Set(State.data.desks.map(x => x.id));
    const stuIds  = new Set(State.data.students.map(x => x.id));
    const ok = p.pairs.filter(([dk, sid]) => deskIds.has(dk) && stuIds.has(sid));
    const lost = p.pairs.length - ok.length;

    if (ask !== false) {
      let msg = `「${p.name}」 배치를 불러옵니다.\n지금 화면의 자리는 이 배치로 바뀝니다.`;
      if (lost) msg += `\n\n⚠️ ${lost}명은 지금 명단·책상에 없어서 자리가 비게 됩니다.`;
      if (!confirm(msg + '\n\n계속할까요?')) return;
    }

    const d = State.data;
    d.assignment = {};
    d.revealed = {};
    ok.forEach(([dk, sid]) => { d.assignment[dk] = sid; d.revealed[dk] = true; });
    d.isShuffled = true;

    // 돌아가던 공개 연출이 있으면 멈추고, 축하 연출도 다시 하지 않습니다
    Shuffle._pending = 0;
    Shuffle._finished = true;
    Shuffle._revealToken++;

    Render.cards_();
    Render.setWobble(false);
    State.save();
    this.render();
    Arrange.refreshSaveBtn();
    banner(`${p.name} — 저장해 둔 자리입니다`, 3200);
    toast(lost ? `${ok.length}명을 되살렸습니다 (${lost}명은 빠졌습니다)`
               : `${ok.length}명의 자리를 되살렸습니다`);
    Sound.play('click');
  },

  /* ---------------- 이름 바꾸기 · 지우기 ---------------- */
  rename(i) {
    const p = this.list()[i];
    if (!p) return;
    const raw = prompt('이 배치의 이름을 적어 주세요', p.name);
    if (raw === null) return;
    const name = String(raw).trim().slice(0, 24);
    if (!name) { toast('이름은 비워 둘 수 없습니다'); return; }
    p.name = name;
    State.save();
    this.render();
    toast('이름을 바꿨습니다');
  },

  remove(i) {
    const p = this.list()[i];
    if (!p) return;
    if (!confirm(`${i + 1}번 칸의 「${p.name}」 을(를) 지웁니다.\n되돌릴 수 없습니다. 계속할까요?`)) return;
    this.list()[i] = null;
    State.save();
    this.render();
    toast(`${i + 1}번 칸을 비웠습니다`);
  },

  /** 칸 하나를 설명하는 짧은 글 */
  summary(p) {
    if (!p) return '비어 있음';
    const n = p.pairs.length;
    const some = p.pairs.slice(0, 2).map(x => x[2]).filter(Boolean).join(', ');
    return `${n}명` + (some ? ` · ${some}${n > 2 ? ' 외' : ''}` : '');
  },

  /* ============================================================
     화면 두 곳을 그립니다
       ① 저장 칸 고르기 (툴바 아래로 내려오는 5칸)
       ② 떠다니는 목록 창 (현재 배치 모드에서)
     ============================================================ */
  render() {
    this._renderPicker();
    this._renderPanel();
  },

  _renderPicker() {
    const box = $('#slotPicker');
    if (!box) return;
    const now = this.nowKey();
    box.innerHTML = '';
    box.appendChild(el('div', { class: 'sp-title', text: '어느 칸에 저장할까요?' }));

    this.list().forEach((p, i) => {
      const cur = !!(p && now && this._key(p.pairs) === now);
      const row = el('button', {
        class: 'slot' + (p ? ' used' : '') + (cur ? ' current' : ''),
        title: cur ? '지금 화면의 배치와 같은 칸입니다' : '',
        onclick: () => { if (this.save(i)) this.closePicker(); },
      });
      row.appendChild(el('span', { class: 'slot-no', text: (i + 1) }));
      row.appendChild(el('span', { class: 'slot-name', text: p ? p.name : '비어 있음' }));
      if (cur) row.appendChild(el('span', { class: 'slot-now', text: '지금' }));
      row.appendChild(el('span', { class: 'slot-sub', text: p ? this.summary(p) : '' }));
      box.appendChild(row);
    });
    box.appendChild(el('p', { class: 'hint',
      text: '이미 들어 있는 칸을 고르면 덮어쓸지 먼저 물어봅니다.' }));
  },

  _renderPanel() {
    const box = $('#slotList');
    if (!box) return;
    const now = this.nowKey();
    box.innerHTML = '';

    this.list().forEach((p, i) => {
      const cur = !!(p && now && this._key(p.pairs) === now);
      const row = el('div', { class: 'slot-item' + (p ? '' : ' empty') + (cur ? ' current' : '') });
      const head = el('button', {
        class: 'slot-open',
        title: cur ? '지금 화면에 깔린 배치입니다'
             : p   ? '이 배치를 불러옵니다' : '비어 있습니다',
        onclick: () => p ? this.load(i) : toast('비어 있는 칸입니다'),
      });
      head.appendChild(el('span', { class: 'slot-no', text: (i + 1) }));
      head.appendChild(el('span', { class: 'slot-name', text: p ? p.name : '비어 있음' }));
      if (cur) head.appendChild(el('span', { class: 'slot-now', text: '지금' }));
      row.appendChild(head);

      if (p) {
        row.appendChild(el('div', { class: 'slot-sub', text: this.summary(p) }));
        const btns = el('div', { class: 'slot-btns' });
        btns.appendChild(el('button', { class: 'btn btn-sm', text: '이름',
          onclick: () => this.rename(i) }));
        btns.appendChild(el('button', { class: 'btn btn-sm btn-danger', text: '삭제',
          onclick: () => this.remove(i) }));
        row.appendChild(btns);
      }
      box.appendChild(row);
    });
  },

  openPicker() {
    if (!this.canSave()) { toast('먼저 자리 섞기를 해주세요'); return; }
    this._renderPicker();
    $('#slotPicker').classList.remove('hidden');
    Sound.play('click');
  },

  closePicker() { $('#slotPicker').classList.add('hidden'); },

  togglePicker() {
    if ($('#slotPicker').classList.contains('hidden')) { this.openPicker(); return; }
    this.closePicker();
    Sound.play('click');   // closePicker 자체는 조용합니다 (다른 곳에서도 부르므로)
  },
};
