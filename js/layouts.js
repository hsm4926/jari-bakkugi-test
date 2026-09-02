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

  /** 섞어서 앉은 사람이 있는지 — 저장 버튼을 «보여 줄지» 를 정합니다 */
  canSave() {
    const d = State.data;
    return !!d.isShuffled && Object.keys(d.assignment).length > 0;
  },

  /**
   * 지금 «정말로» 저장해도 되는지.
   * ★ 아직 알에 덮여 있는 자리가 있으면 저장하지 않습니다.
   *   덮인 채로 저장하면 아이들 앞에서 아직 안 깐 자리까지 파일에 들어가고,
   *   무엇보다 «이번 자리» 가 확정되기 전이라 저장할 내용이 아닙니다.
   */
  canSaveNow() { return this.canSave() && this.allRevealed(); },

  /**
   * 아직 안 되는 이유를 알려 주고 true 를 돌려줍니다 (막아야 하면).
   *
   * 안내는 «작은 토스트» 가 아니라 **화면 가운데 아래 큰 띠**로 냅니다.
   * 버튼은 화면 맨 위에 있는데 토스트는 오른쪽 구석에 뜨는 작은 알약이라,
   * 「눌렀는데 아무 일도 안 일어났다」 로 보이기 쉽습니다.
   */
  _blocked() {
    if (!this.canSave()) {
      banner('먼저 자리 섞기를 해주세요', 2600);
      Sound.play('click');
      return true;
    }
    if (!this.allRevealed()) {
      banner('자리를 모두 공개한 뒤에 저장할 수 있습니다', 3000);
      Sound.play('click');
      return true;
    }
    return false;
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
    if (this._blocked()) return false;
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
    Arrange.refresh();
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
     떠다니는 «배치 목록» 창을 그립니다.
     저장·불러오기·이름·삭제가 전부 여기 있습니다 —
     v1.13.0 에서 툴바의 «배치 저장» 버튼을 없애고 이리로 모았습니다.
     («배치 관리» 로 들어오면 어차피 자리가 전부 공개되므로,
      «공개된 뒤에만 저장» 이라는 규칙이 저절로 지켜집니다)
     ============================================================ */
  render() { this._renderPanel(); },

  _renderPanel() {
    const box = $('#slotList');
    if (!box) return;
    const now = this.nowKey();
    box.innerHTML = '';

    this.list().forEach((p, i) => {
      const cur = !!(p && now && this._key(p.pairs) === now);
      const row = el('div', { class: 'slot-item' + (p ? '' : ' empty') + (cur ? ' current' : '') });

      /* ★ 불러오기는 «칸 아무 데나» 눌러도 됩니다.
         예전에는 이름 글씨만 눌러야 했는데, 232px 창의 한 줄짜리 글씨라
         겨냥해서 누르기가 번거로웠습니다.
         아래 버튼들(이름·덮어쓰기·삭제)을 누른 것은 빼야 합니다 — 클릭이 위로 올라옵니다. */
      if (p) {
        row.title = cur ? '지금 화면에 깔린 배치입니다' : '누르면 이 배치를 불러옵니다';
        row.addEventListener('click', (e) => {
          // ★ 빼는 것은 «버튼 세 개» 뿐입니다. 버튼 «줄» 을 통째로 빼면
          //   버튼 사이 빈 자리가 칸의 아래 3분의 1인데 그곳이 죽어 버립니다.
          if (e.target.closest('.slot-btns .btn')) return;
          this.load(i);
        });
      }

      const head = el('div', { class: 'slot-head' });
      head.appendChild(el('span', { class: 'slot-no', text: (i + 1) }));
      head.appendChild(el('span', { class: 'slot-name', text: p ? p.name : '비어 있음' }));
      if (cur) head.appendChild(el('span', { class: 'slot-now', text: '지금' }));
      row.appendChild(head);

      const btns = el('div', { class: 'slot-btns' });
      if (p) {
        row.appendChild(el('div', { class: 'slot-sub', text: this.summary(p) }));
        btns.appendChild(el('button', { class: 'btn btn-sm', text: '이름',
          title: '이 배치의 이름을 바꿉니다', onclick: () => this.rename(i) }));
        btns.appendChild(el('button', { class: 'btn btn-sm', text: '덮어쓰기',
          title: '지금 자리로 이 칸을 덮어씁니다', onclick: () => this.save(i) }));
        btns.appendChild(el('button', { class: 'btn btn-sm btn-danger', text: '삭제',
          title: '이 칸을 비웁니다', onclick: () => this.remove(i) }));
      } else {
        btns.appendChild(el('button', { class: 'btn btn-sm slot-save', text: '저장하기',
          title: '지금 자리를 이 칸에 저장합니다', onclick: () => this.save(i) }));
      }
      row.appendChild(btns);
      box.appendChild(row);
    });
  },
};
