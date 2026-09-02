/* 자리 섞기와 자리 공개(알 부화) 연출. */
'use strict';

const Shuffle = {

  busy: false,

  /* 공개 연출이 지금 몇 개나 돌아가고 있는지.
     책상을 빠르게 여러 개 누르면 알 깨지는 연출이 겹쳐서 돌아가는데,
     '마지막 알까지 다 깨진 뒤에' 축하 소리를 내려고 세어 둡니다. */
  _pending: 0,
  /* 이번 자리 배치에서 축하 연출을 이미 했는지 (한 번만 나오게) */
  _finished: false,
  /* 순차 공개가 지금 돌아가는 중인지 (버튼을 두 번 눌러도 두 번 돌지 않게) */
  _revealing: false,
  /* 자리를 새로 섞거나 다시 덮으면 이 번호가 바뀝니다.
     돌아가던 순차 공개는 번호가 달라진 걸 보고 스스로 멈춥니다. */
  _revealToken: 0,

  /* ============================================================
     1) 누가 어느 자리에 앉을지 정하기
     ------------------------------------------------------------
     실제 규칙(사전 자리 · 남자 자리 · 여자 자리 · 누구나 자리)은
     seats.js 가 맡습니다. 이 파일은 연출에 집중합니다.
     ============================================================ */
  computeAssignment() { return Seats.assign(); },

  /* ============================================================
     2) 자리 섞기 (애니메이션 포함)
     ============================================================ */
  async run() {
    if (this.busy) return;
    const d = State.data;

    /* 모두가 앉을 수 있는지 먼저 따져 봅니다.
       한 명이라도 앉을 자리가 없으면 화면 한가운데에 크게 알리고 멈춥니다.
       (예전에는 그냥 섞여서, 아이들 앞에서 누군가 자리를 못 받았습니다) */
    if (Seats.blockShuffle()) return;

    if (Editor.mode) Editor.exit();
    if (Arrange.on) Arrange.exit();

    this.busy = true;
    document.body.classList.add('busy');

    d.assignment = this.computeAssignment();
    d.revealed = {};
    d.isShuffled = true;
    this._pending = 0;
    this._finished = false;
    this._revealToken++;
    Render.cards_();
    banner('자리를 섞는 중…');
    Sound.play('shuffleStart');

    const seated = State.orderedDesks().filter(dk => d.assignment[dk.id]);
    const ids = seated.map(dk => dk.id);
    const home = seated.map(dk => ({ x: dk.x, y: dk.y }));

    const T = CONFIG.timing;
    const rounds = Math.max(2, T.shuffleRounds);

    for (let r = 0; r < rounds; r++) {
      const t = r / (rounds - 1);
      // 점점 느려지도록 (처음엔 빠르게, 끝으로 갈수록 천천히)
      const step = Math.round(T.shuffleFirstStep + (T.shuffleLastStep - T.shuffleFirstStep) * (t * t));
      const target = (r === rounds - 1) ? home : shuffled(home);

      ids.forEach((id, i) => Render.moveCard(id, target[i].x, target[i].y, step));
      Sound.play('shuffleTick', 0.85 + Math.random() * 0.4);

      // 가끔 반짝이 하나씩
      if (r % 2 === 0 && seated.length) {
        const dk = seated[Math.floor(Math.random() * seated.length)];
        const c = Render.deskCenter(dk);
        Render.playFrames(Frames.rise, c.x, c.y - 20, 84, 42);
      }
      await sleep(step);
    }

    Render.setWobble(true);
    View.resizeSprites();   // 이동이 끝났으니 픽셀 격자에 다시 맞춥니다
    Sound.play('shuffleEnd');
    banner('책상을 누르면 한 명씩 공개됩니다', 4200);

    this.busy = false;
    document.body.classList.remove('busy');
    State.save();
    Panel.refreshCounts();
    Arrange.refreshSaveBtn();
  },

  /* ============================================================
     3) 자리 한 명 공개 (알이 갈라지고 학생이 나옵니다)
     ============================================================ */
  async reveal(deskId) {
    const d = State.data;
    if (!d.isShuffled || this.busy) return;
    if (!d.assignment[deskId] || d.revealed[deskId]) return;

    const card = Render.cards[deskId];
    if (!card || !card.egg) return;

    d.revealed[deskId] = true;
    this._pending++;
    card.root.classList.remove('wobble');

    const dk = State.desk(deskId);
    const c = Render.deskCenter(dk);

    // 알에 금이 갑니다
    Sound.play('crack');
    const frames = Frames.egg;
    const per = Math.max(20, Math.round(CONFIG.timing.crackDuration / frames.length));
    for (let i = 0; i < frames.length; i++) {
      card.egg.src = frames[i];
      card.egg.style.transform = `translateX(${(i % 2 ? 2 : -2)}px) rotate(${(i % 2 ? 3 : -3)}deg)`;
      await sleep(per);
    }

    // 펑! 하고 빛이 퍼지면서 학생 등장
    Sound.play('reveal');
    Render.playFrames(Frames.burst, c.x, c.y, 128, 38);
    Render.showStudent(deskId, true);

    State.save();
    this._pending--;
    this.checkAllRevealed();
    Arrange.refreshSaveBtn();
  },

  /* ============================================================
     4) 모두 공개 / 다시 덮기
     ============================================================ */
  /**
   * 남은 자리를 한 명씩 차례로 공개합니다.
   * @param {'seq'|'random'} order  'seq' 면 자리 순서대로, 'random' 이면 뒤죽박죽 순서로.
   */
  async revealAll(order) {
    const d = State.data;
    if (!d.isShuffled || this.busy) { toast('먼저 자리 섞기를 해주세요'); return; }
    if (this._revealing) return;               // 이미 돌아가는 중이면 무시

    let rest = State.orderedDesks().filter(dk => d.assignment[dk.id] && !d.revealed[dk.id]);
    if (!rest.length) { toast('이미 모두 공개되었습니다'); return; }
    if (order === 'random') rest = shuffled(rest);

    this._revealing = true;
    const token = this._revealToken;
    try {
      for (const dk of rest) {
        // 도중에 다시 섞거나 다시 덮었으면 멈춥니다
        if (token !== this._revealToken) break;
        if (d.revealed[dk.id]) continue;       // '한 번에 공개' 로 이미 나온 자리는 건너뜁니다
        await this.reveal(dk.id);
        await sleep(CONFIG.timing.revealAllGap);
      }
    } finally {
      this._revealing = false;
    }
  },

  /**
   * 남은 자리를 한꺼번에 공개합니다.
   * '하나씩 공개' 와 달리 알이 갈라지는 연출을 건너뛰고 곧바로 학생을 보여줍니다.
   * (반짝임만 아주 짧은 간격으로 번져 가서 한 번에 터지는 느낌을 줍니다)
   */
  revealNow() {
    const d = State.data;
    if (!d.isShuffled) { toast('먼저 자리 섞기를 해주세요'); return; }

    const rest = State.orderedDesks().filter(dk => d.assignment[dk.id] && !d.revealed[dk.id]);
    if (!rest.length) { toast('이미 모두 공개되었습니다'); return; }

    Sound.play('reveal');
    const gap = Math.max(0, CONFIG.timing.revealBurstGap || 0);

    rest.forEach((dk, i) => {
      d.revealed[dk.id] = true;
      Render.showStudent(dk.id, true);
      const c = Render.deskCenter(dk);
      setTimeout(() => Render.playFrames(Frames.burst, c.x, c.y, 128, 38), i * gap);
    });

    State.save();
    this.checkAllRevealed();
    Arrange.refreshSaveBtn();
  },

  reset() {
    const d = State.data;
    if (!d.isShuffled) return;
    d.revealed = {};
    this._pending = 0;
    this._finished = false;
    this._revealToken++;      // 돌아가던 순차 공개가 있으면 여기서 멈춥니다
    Render.cards_();
    Render.setWobble(true);
    Sound.play('page');
    banner('다시 덮었습니다', 1800);
    State.save();
    Arrange.refreshSaveBtn();
  },

  /* ============================================================
     5) 모두 공개되었는지 확인하고 축하 연출
     ------------------------------------------------------------
     한 명씩 눌러서 공개하든 '한 번에 공개' 를 쓰든,
     마지막 한 명까지 나오면 똑같이 축하 소리와 문구가 나옵니다.

     · _pending  : 아직 알이 깨지는 중인 자리가 하나라도 있으면 기다립니다.
                   (책상을 빠르게 연달아 누르면 연출이 겹쳐서 돌아갑니다)
     · _finished : 한 번만 나오게 막습니다.
                   이게 없으면 겹친 연출 수만큼 소리가 한꺼번에 울려
                   뭉개진 잡음처럼 들립니다.
     ============================================================ */
  checkAllRevealed() {
    if (this._finished) return;
    if (this._pending > 0) return;

    const d = State.data;
    const seats = State.orderedDesks().filter(dk => d.assignment[dk.id]);
    if (!seats.length || !seats.every(dk => d.revealed[dk.id])) return;

    this._finished = true;
    setTimeout(() => {
      Sound.play('revealAll');
      banner('우리 반 새 자리 완성!', 4000);
    }, 500);
  },
};
