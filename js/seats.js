/* ============================================================
   자리 따져보기 — 「누가 어느 자리에 앉을 수 있나」
   ------------------------------------------------------------
   책상마다 «남자 자리 · 여자 자리 · 누구나 자리» 를 정해 둘 수 있습니다.
   (교실 편집 ▸ 남·여 자리)

   이 파일이 하는 일은 셋입니다.
     1) 지금 명단으로 모두 앉을 수 있는지 따져 보고 (check)
     2) 못 앉으면 무엇이 얼마나 모자란지 말로 풀어 주고 (problems)
     3) 실제로 누구를 어디에 앉힐지 정합니다 (assign)

   연출(알이 깨지고 학생이 나오는 것)은 shuffle.js 가 맡습니다.
   여기는 숫자와 규칙만 다룹니다.
   ============================================================ */
'use strict';

const Seats = {

  /* ============================================================
     1) 세어 보기
     ------------------------------------------------------------
     ★ 앉을 수 있는지 판단하는 규칙 (이 한 줄이 전부입니다)

         남자 자리에 못 앉고 넘치는 남학생 수
       + 여자 자리에 못 앉고 넘치는 여학생 수
       ≤ 누구나 앉는 자리 수

     넘치는 학생은 «누구나 자리» 로만 갈 수 있으므로, 그 수가 모자라면
     아무리 잘 배치해도 누군가는 앉을 곳이 없습니다.

     이 규칙 하나가 「그냥 자리가 모자란 경우」도 함께 잡아 줍니다.
     (성별 자리를 하나도 안 쓰면 남자 자리·여자 자리가 0이라
      넘치는 인원 = 전체 학생 수가 되어, 결국 자리 수와 비교하게 됩니다)
     ============================================================ */
  check() {
    const d = State.data;

    let boys = 0, girls = 0;
    d.students.forEach(s => { if (s.sex === 'g') girls++; else boys++; });

    let seatB = 0, seatG = 0, seatFree = 0;
    d.desks.forEach(dk => {
      const want = State.deskSex(dk);
      if (want === 'b') seatB++;
      else if (want === 'g') seatG++;
      else seatFree++;
    });

    const needB = Math.max(0, boys  - seatB);   // 남자 자리에 못 앉고 넘치는 남학생
    const needG = Math.max(0, girls - seatG);   // 여자 자리에 못 앉고 넘치는 여학생
    const gap   = (needB + needG) - seatFree;   // 0 이하면 모두 앉을 수 있습니다

    return {
      students: d.students.length, boys, girls,
      seats: d.desks.length, seatB, seatG, seatFree,
      needB, needG,
      short: Math.max(0, gap),      // 몇 자리를 더 만들어야 하는지
      spare: Math.max(0, -gap),     // 남는 자리 수
      ok: gap <= 0,
      usesSex: (seatB + seatG) > 0, // 성별 자리를 쓰는 교실인지
    };
  },

  /* ============================================================
     2) 모자란 이유를 말로 풀어 주기
     ------------------------------------------------------------
     교실 TV 에 아이들과 함께 보는 화면이므로,
     "왜 안 되는지" 와 "그래서 뭘 하면 되는지" 를 함께 적습니다.
     ============================================================ */
  problems(c) {
    c = c || this.check();
    if (c.ok) return [];

    // 성별 자리를 하나도 안 쓰는 교실에서는 남·여 이야기를 꺼내지 않습니다
    if (!c.usesSex) {
      return [
        `학생 ${c.students}명 · 자리 ${c.seats}개`,
        `자리가 ${c.short}개 모자랍니다.`,
        `교실 편집에서 책상을 ${c.short}개 더 놓아 주세요.`,
      ];
    }

    const out = [
      `학생 ${c.students}명 — 남 ${c.boys}명 · 여 ${c.girls}명`,
      `자리 ${c.seats}개 — 남자 ${c.seatB} · 여자 ${c.seatG} · 누구나 ${c.seatFree}`,
    ];
    if (c.needB) out.push(`남학생 ${c.needB}명이 남자 자리에 다 앉지 못합니다.`);
    if (c.needG) out.push(`여학생 ${c.needG}명이 여자 자리에 다 앉지 못합니다.`);
    out.push(`그래서 «누구나 자리» 가 ${c.needB + c.needG}개 필요한데 ${c.seatFree}개뿐입니다.`);
    out.push(`⇒ 책상을 ${c.short}개 더 놓거나, 자리 지정을 ${c.short}개 풀어 주세요.`);
    return out;
  },

  /** 편집 툴바에 띄우는 한 줄 요약 */
  summary(c) {
    c = c || this.check();
    return `자리 — 남자 ${c.seatB} · 여자 ${c.seatG} · 누구나 ${c.seatFree}`
         + `    │    학생 — 남 ${c.boys} · 여 ${c.girls}`
         + (c.ok ? '' : `    │    ⚠ ${c.short}자리 모자람`);
  },

  /* ============================================================
     3) 자리를 섞어도 되는지 확인
     ------------------------------------------------------------
     안 되면 화면 한가운데에 크게 알리고 true 를 돌려줍니다.
     (예전에는 설정 화면 안쪽에만 작게 떠서, 아이들 앞에서 그냥 섞다가
      누군가 자리를 못 받는 일이 생길 수 있었습니다)
     ============================================================ */
  blockShuffle() {
    const d = State.data;
    const goEdit  = { label: '교실 편집 열기',  run: () => Editor.enter('layout') };
    const goNames = { label: '학생 명단 열기',  run: () => Panel.open('students') };

    if (!d.students.length) {
      Alert.show('학생 명단이 비어 있습니다',
        ['설정 ▸ 학생 명단에 이름을 한 줄에 한 명씩 적어 주세요.'], goNames);
      return true;
    }
    if (!d.desks.length) {
      Alert.show('책상이 하나도 없습니다',
        ['교실 편집에서 책상을 놓아 주세요.'], goEdit);
      return true;
    }

    const c = this.check();
    if (c.ok) return false;
    Alert.show('자리가 모자라서 섞을 수 없습니다', this.problems(c), goEdit);
    return true;
  },

  /* ============================================================
     4) 누가 어느 자리에 앉을지 정하기
     ------------------------------------------------------------
     순서가 중요합니다.

       ① 사전에 정해둔 자리 (사전 설정 모드일 때만)
          — 선생님이 직접 정한 자리라 성별 지정보다 우선합니다.
       ② 남자 자리 · 여자 자리
       ③ 누구나 자리  ← 반드시 맨 마지막

     ③ 을 먼저 채우면 남학생이 «누구나 자리» 를 차지해 버려,
     정작 여자 자리가 남았는데 앉힐 여학생이 없는 일이 생깁니다.
     ============================================================ */
  assign() {
    const d = State.data;
    const assignment = {};      // 책상id -> 학생id
    const used = new Set();

    // ① 미리 정해둔 자리
    if (d.mode === 'preset') {
      State.orderedDesks().forEach(dk => {
        const sid = d.preset[dk.id];
        if (sid && State.student(sid) && !used.has(sid)) {
          assignment[dk.id] = sid;
          used.add(sid);
        }
      });
    }

    // 아직 자리가 없는 학생을 성별로 나눠 섞어 둡니다
    const rest = d.students.filter(s => !used.has(s.id));
    const pool = {
      b: shuffled(rest.filter(s => s.sex !== 'g').map(s => s.id)),
      g: shuffled(rest.filter(s => s.sex === 'g').map(s => s.id)),
    };

    // ② 성별이 정해진 자리
    const free = [];
    State.desksRoundRobin().forEach(dk => {
      if (assignment[dk.id]) return;
      const want = State.deskSex(dk);
      if (!want) { free.push(dk); return; }     // 누구나 자리는 잠시 미뤄 둡니다
      const sid = pool[want].pop();
      if (sid) assignment[dk.id] = sid;
    });

    // ③ 누구나 자리 — 남녀 구분 없이 남은 학생을 무작위로
    const left = shuffled(pool.b.concat(pool.g));
    free.forEach((dk, i) => { if (left[i]) assignment[dk.id] = left[i]; });

    return assignment;
  },
};
