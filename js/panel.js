/* 오른쪽 설정 패널 (학생 명단 · 교실 · 저장) */
'use strict';

const Panel = {

  open(tab) {
    $('#panel').classList.remove('hidden');
    $('#btnPanel').classList.add('active');
    if (tab) this.showTab(tab);
    this.syncFromState();
    Sound.play('page');
  },

  close() {
    $('#panel').classList.add('hidden');
    $('#btnPanel').classList.remove('active');
    // 미리 보기를 켠 채 수업에 들어가면 학생이 알아챌 수 있으므로 반드시 끕니다
    if (Secret.preview) Secret.setPreview(false);
    Sound.play('page');
  },

  toggle() { $('#panel').classList.contains('hidden') ? this.open() : this.close(); },

  showTab(name) {
    $$('.ptab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.ptab-page').forEach(p => p.classList.toggle('hidden', p.dataset.page !== name));
  },

  /* ---------------- 화면 ← 데이터 ---------------- */
  syncFromState() {
    const d = State.data;
    $('#nameInput').value = d.students.map(s => s.name).join('\n');
    $('#inGroups').value = d.groups.length || CONFIG.classroom.groups;
    $('#inSeats').value = d.groups.length
      ? Math.round(d.desks.length / d.groups.length) : CONFIG.classroom.seatsPerGroup;
    this.refreshGroupMode();
    $('#inDeskCount').value = d.desks.length || CONFIG.classroom.groups * CONFIG.classroom.seatsPerGroup;
    $('#inRoomW').value = d.room.w;
    $('#inRoomH').value = d.room.h;
    // 기본값이 몇인지 굳이 외우지 않아도 되도록 버튼에 숫자를 그대로 적어 둡니다
    $('#btnRoomDefault').textContent =
      `기본 크기로 되돌리기 (${CONFIG.classroom.width} × ${CONFIG.classroom.height})`;
    $('#inSound').checked = d.settings.sound;
    $('#inVolume').value = d.settings.volume;
    this.renderChips();
    this.refreshCounts();
    this.refreshSavedAt();
    this.refreshMode();
    this.syncDot();
    Presets.render();
  },

  /* ---------------- 학생 이름표 ---------------- */
  renderChips() {
    const box = $('#studentChips');
    box.innerHTML = '';
    State.data.students.forEach(s => {
      box.appendChild(el('button', {
        class: 'chip ' + (s.sex === 'g' ? 'girl' : 'boy'),
        text: s.name + (s.sex === 'g' ? ' 여' : ' 남'),
        onclick: () => {
          s.sex = (s.sex === 'g') ? 'b' : 'g';
          this.renderChips();
          Render.cards_();
          State.save();
        },
      }));
    });
    if (!State.data.students.length) {
      box.appendChild(el('span', { class: 'hint', text: '아직 입력된 학생이 없습니다.' }));
    }
  },

  /** 명단 글상자의 내용을 실제 학생 목록으로 바꿉니다 */
  applyNames() {
    const lines = $('#nameInput').value.split('\n').map(s => s.trim()).filter(Boolean);
    const d = State.data;
    const old = d.students.slice();
    const used = new Set();
    const next = lines.map(name => {
      const found = old.find(s => s.name === name && !used.has(s.id));
      if (found) { used.add(found.id); return found; }
      return { id: uid('st'), name, sex: 'b' };
    });
    d.students = next;

    // 사라진 학생이 남긴 자리 정보 정리
    const alive = new Set(next.map(s => s.id));
    ['preset', 'assignment'].forEach(k => {
      for (const dk in d[k]) if (!alive.has(d[k][dk])) delete d[k][dk];
    });

    this.renderChips();
    this.refreshCounts();
    Render.desks();
    Render.cards_();
    State.save();
    toast(next.length + '명을 저장했습니다');
  },

  setAllSex(sex) {
    State.data.students.forEach(s => s.sex = sex);
    this.renderChips();
    Render.cards_();
    State.save();
  },

  /* ---------------- 인원 / 자리 수 맞는지 확인 ----------------
     실제 계산은 seats.js 가 합니다. 여기서는 보여 주기만 합니다.
     같은 내용이 «자리 섞기» 를 누를 때 화면 한가운데에도 뜹니다. */
  refreshCounts() {
    const c = Seats.check();
    $('#nameCount').textContent = c.students + '명';

    const warn = $('#countWarn');
    warn.innerHTML = '';
    warn.classList.remove('bad');

    if (!c.students || !c.seats) { warn.classList.add('hidden'); return; }

    if (!c.ok) {
      // 앉을 수 없는 사람이 생깁니다 — 섞기 자체가 막힙니다
      warn.classList.add('bad');
      Seats.problems(c, { showFixed: true })
           .forEach(t => warn.appendChild(el('div', { text: t })));
      warn.classList.remove('hidden');
      return;
    }

    if (c.spare > 0) {
      warn.appendChild(el('div', {
        text: `학생 ${c.students}명, 자리 ${c.seats}개 — 자리가 ${c.spare}개 남습니다. 남는 자리는 빈 채로 둡니다.`,
      }));
      if (c.usesSex) {
        warn.appendChild(el('div', {
          text: `(남자 자리 ${c.seatB} · 여자 자리 ${c.seatG} · 누구나 앉는 자리 ${c.seatFree}`
                + (c.fixed ? ` · 사전에 정해둔 자리 ${c.fixed}` : '') + ')',
        }));
      }
      warn.classList.remove('hidden');
      return;
    }

    warn.classList.add('hidden');
  },

  refreshSavedAt() {
    const t = State.data.savedAt;
    if (!t) return;
    const d = new Date(t);
    const p = (x) => ('0' + x).slice(-2);
    const node = $('#savedAt');
    if (node) node.textContent =
      `마지막 저장: ${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },

  /** 지금 공개 방식이 무엇인지 (선생님만 보는 칸) */
  refreshMode() {
    const node = $('#modeReadout');
    if (!node) return;
    const preset = State.data.mode === 'preset';
    node.textContent = preset ? '사전 설정' : '무작위';
    node.classList.toggle('preset', preset);
  },

  /* ---------------- 표시점 모양 ----------------
     화면 왼쪽 아래 구석의 작은 점을 눈으로 보면서 맞추는 칸입니다.
     교실 바닥 색은 교실마다(TV 마다) 달라 보이므로, 값을 코드에 못 박지 않고
     선생님이 그 자리에서 조절할 수 있게 했습니다. */

  /** 데이터 → 조절 칸 */
  syncDot() {
    const c = State.data.settings.dot || State.freshDot();
    $('#inDotFill').value  = c.fill;
    $('#inDotRing').value  = c.ring;
    $('#inDotFillA').value = c.fillA;
    $('#inDotRingA').value = c.ringA;
    $('#inDotRingW').value = c.ringW;
    $('#inDotSize').value  = c.size;
    this._dotLabels(c);
    $('#btnDotPreview').textContent = Secret.preview ? '미리 보기 끄기' : '미리 보기 켜기';
    $('#btnDotPreview').classList.toggle('active', Secret.preview);
  },

  /** 조절 칸 → 데이터 (움직이는 즉시 화면에 반영) */
  applyDot() {
    const c = {
      fill:  $('#inDotFill').value,
      ring:  $('#inDotRing').value,
      fillA: parseFloat($('#inDotFillA').value),
      ringA: parseFloat($('#inDotRingA').value),
      ringW: parseFloat($('#inDotRingW').value),
      size:  parseInt($('#inDotSize').value, 10),
    };
    State.data.settings.dot = c;
    this._dotLabels(c);
    Secret.refreshDot();
    State.save();
  },

  resetDot() {
    State.data.settings.dot = State.freshDot();
    this.syncDot();
    Secret.refreshDot();
    State.save();
    toast('표시점 모양을 기본값으로 되돌렸습니다');
  },

  _dotLabels(c) {
    $('#outDotFillA').textContent = Math.round(c.fillA * 100) + '%';
    $('#outDotRingA').textContent = Math.round(c.ringA * 100) + '%';
    $('#outDotRingW').textContent = c.ringW + 'px';
    $('#outDotSize').textContent  = c.size + 'px';
  },

  /* ---------------- 교실 구성 ---------------- */

  /** '모둠 있음 / 없음' 을 고릅니다. 실제 교실은 '다시 만들기' 를 눌러야 바뀝니다. */
  setUseGroups(on) {
    State.data.useGroups = !!on;
    this.refreshGroupMode();
    State.save();
  },

  /** 고른 값에 맞춰 어떤 칸을 보여줄지 정합니다 */
  refreshGroupMode() {
    const on = State.useGroups();
    $('#btnGroupsOn').classList.toggle('active', on);
    $('#btnGroupsOff').classList.toggle('active', !on);
    $('#groupFields').classList.toggle('hidden', !on);
    $('#plainFields').classList.toggle('hidden', on);
  },

  rebuildClassroom() {
    const d = State.data;
    const useG = State.useGroups();
    let built, done;

    if (useG) {
      const g = clamp(parseInt($('#inGroups').value, 10) || 1, 1, 12);
      const s = clamp(parseInt($('#inSeats').value, 10) || 1, 1, 8);
      if (!confirm(`${g}모둠 × ${s}자리로 교실을 새로 만듭니다.\n지금 배치와 미리 정해둔 자리는 지워집니다. 계속할까요?`)) return;
      built = Layout.build(g, s, d.room.w, d.room.h);
      done = `${g}모둠 ${g * s}자리로 새로 만들었습니다`;
    } else {
      const n = clamp(parseInt($('#inDeskCount').value, 10) || 1, 1, 60);
      if (!confirm(`모둠 없이 책상 ${n}개로 교실을 새로 만듭니다.\n지금 배치와 미리 정해둔 자리는 지워집니다. 계속할까요?`)) return;
      built = Layout.buildPlain(n, d.room.w, d.room.h);
      done = `모둠 없이 책상 ${n}개로 새로 만들었습니다`;
    }

    d.board = built.board;
    d.lockers = built.lockers;
    d.groups = built.groups;
    d.desks = built.desks;
    d.preset = {}; d.assignment = {}; d.revealed = {}; d.isShuffled = false;

    Render.all();
    this.syncFromState();
    this.refreshCounts();
    State.save();
    toast(done);
  },

  /** 교실 크기를 config.js 에 적힌 기본값으로 되돌립니다. 책상 배치는 건드리지 않습니다. */
  resetRoomSize() {
    const d = State.data;
    d.room.w = CONFIG.classroom.width;
    d.room.h = CONFIG.classroom.height;
    $('#inRoomW').value = d.room.w;
    $('#inRoomH').value = d.room.h;
    Render.all();
    State.save();
    toast(`교실 크기를 기본값 ${d.room.w} × ${d.room.h} 로 되돌렸습니다`);
  },

  applyRoomSize() {
    const d = State.data;
    d.room.w = clamp(parseInt($('#inRoomW').value, 10) || d.room.w, 400, 4000);
    d.room.h = clamp(parseInt($('#inRoomH').value, 10) || d.room.h, 400, 4000);
    Render.all();
    State.save();
  },

  /* ---------------- 저장 / 불러오기 ---------------- */
  importFrom(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        State.importText(String(r.result));
        Render.all();
        this.syncFromState();
        Sound.setOn(State.data.settings.sound);
        Sound.setMaster(State.data.settings.volume);
        toast('설정을 불러왔습니다');
      } catch (e) {
        alert('파일을 읽지 못했습니다.\n\n' + (e && e.message ? e.message : e));
      }
    };
    r.onerror = () => alert('파일을 여는 데 실패했습니다.');
    r.readAsText(file, 'utf-8');
  },

  wipe() {
    if (!confirm('학생 명단과 자리 배치를 모두 지우고 처음 상태로 되돌립니다.\n정말 진행할까요?')) return;
    State.wipe();
    Render.all();
    this.syncFromState();
    toast('처음 상태로 되돌렸습니다');
  },
};
