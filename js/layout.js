/* 교실 자동 배치 만들기.
   모둠 수와 모둠당 책상 수를 주면 칠판·사물함·모둠·책상 위치를 계산합니다. */
'use strict';

const Layout = {

  /** 모둠 안에서 책상을 몇 열로 놓을지 */
  colsFor(seats) {
    if (seats <= 1) return 1;
    if (seats <= 2) return 2;
    if (seats <= 4) return 2;
    if (seats <= 6) return 3;
    return 4;
  },

  /** 모둠 블록 하나의 크기 */
  blockSize(seats) {
    const dw = State.deskW(), dh = State.deskH();
    const cols = this.colsFor(seats);
    const rows = Math.ceil(seats / cols);
    const gapX = 12, gapY = 30;   // gapY 는 의자 자리까지 고려한 간격
    return {
      cols, rows,
      w: cols * dw + (cols - 1) * gapX,
      h: rows * dh + (rows - 1) * gapY,
      gapX, gapY,
    };
  },

  /** 모둠을 교실에 몇 줄로 늘어놓을지 */
  groupColsFor(groups) {
    if (groups <= 2) return groups;
    if (groups <= 6) return 3;
    if (groups <= 12) return 4;
    return 5;
  },

  /**
   * 새 교실을 통째로 만들어 돌려줍니다.
   * @returns {{board, lockers, groups, desks}}
   */
  build(nGroups, seatsPerGroup, roomW, roomH) {
    const g = CONFIG.classroom.grid;
    const S = (v) => snap(v, g);

    /* --- 칠판: 위쪽 가운데 --- */
    const boardW = S(Math.min(560, roomW * 0.42));
    const board = { x: S((roomW - boardW) / 2), y: S(36), w: boardW, h: S(80) };

    /* --- 사물함: 아래쪽 벽 전체 --- */
    const lockerH = S(58);
    const lockers = [{
      id: uid('lk'),
      x: S(roomW * 0.08), y: S(roomH - lockerH - 34),
      w: S(roomW * 0.84), h: lockerH,
    }];

    /* --- 모둠이 들어갈 수 있는 영역 --- */
    const areaTop = board.y + board.h + 70;
    const areaBottom = lockers[0].y - 60;
    const areaLeft = 60, areaRight = roomW - 60;
    const areaW = areaRight - areaLeft;
    const areaH = areaBottom - areaTop;

    const blk = this.blockSize(seatsPerGroup);
    const gCols = Math.min(this.groupColsFor(nGroups), nGroups);
    const gRows = Math.ceil(nGroups / gCols);

    // 모둠 블록 사이 여백 (영역 안에 고르게 퍼지도록)
    const spaceX = gCols > 1 ? (areaW - gCols * blk.w) / (gCols - 1) : 0;
    const spaceY = gRows > 1 ? (areaH - gRows * blk.h) / (gRows - 1) : 0;
    const gapX = clamp(spaceX, 40, 160);
    const gapY = clamp(spaceY, 50, 150);

    const totalW = gCols * blk.w + (gCols - 1) * gapX;
    const totalH = gRows * blk.h + (gRows - 1) * gapY;
    const originX = S(areaLeft + (areaW - totalW) / 2);
    const originY = S(areaTop + Math.max(0, (areaH - totalH) / 2));

    const groups = [], desks = [];
    for (let gi = 0; gi < nGroups; gi++) {
      const gr = Math.floor(gi / gCols);
      const gc = gi % gCols;
      // 마지막 줄에 모둠이 덜 찼으면 가운데로 모아줍니다
      const inThisRow = Math.min(gCols, nGroups - gr * gCols);
      const rowW = inThisRow * blk.w + (inThisRow - 1) * gapX;
      const rowX = S(areaLeft + (areaW - rowW) / 2);

      const bx = S(rowX + gc * (blk.w + gapX));
      const by = S(originY + gr * (blk.h + gapY));

      const group = {
        id: uid('gp'),
        no: gi + 1,
        name: (gi + 1) + '모둠',
        color: CONFIG.groupColors[gi % CONFIG.groupColors.length],
      };
      groups.push(group);

      for (let si = 0; si < seatsPerGroup; si++) {
        const r = Math.floor(si / blk.cols);
        const c = si % blk.cols;
        // 마지막 줄에 책상이 덜 찼으면 모둠 안에서 가운데로 모아줍니다
        const inRow = Math.min(blk.cols, seatsPerGroup - r * blk.cols);
        const rowW = inRow * State.deskW() + (inRow - 1) * blk.gapX;
        const offX = (blk.w - rowW) / 2;
        desks.push({
          id: uid('dk'),
          gid: group.id,
          no: si + 1,
          x: S(bx + offX + c * (State.deskW() + blk.gapX)),
          y: S(by + r * (State.deskH() + blk.gapY)),
        });
      }
    }

    return { board, lockers, groups, desks };
  },

  /* ============================================================
     모둠 없이 책상만 늘어놓는 교실
     ------------------------------------------------------------
     모둠 활동을 안 하고 책상을 줄 맞춰 놓는 교실용입니다.
     칠판·사물함은 모둠 교실과 똑같이 놓고, 그 사이 공간에
     책상을 격자로 채웁니다.
     ============================================================ */
  buildPlain(nDesks, roomW, roomH) {
    const g = CONFIG.classroom.grid;
    const S = (v) => snap(v, g);
    const dw = State.deskW(), dh = State.deskH();
    const n = Math.max(1, nDesks);

    /* --- 칠판·사물함은 모둠 교실과 같은 자리 --- */
    const boardW = S(Math.min(560, roomW * 0.42));
    const board = { x: S((roomW - boardW) / 2), y: S(36), w: boardW, h: S(80) };
    const lockerH = S(58);
    const lockers = [{
      id: uid('lk'),
      x: S(roomW * 0.08), y: S(roomH - lockerH - 34),
      w: S(roomW * 0.84), h: lockerH,
    }];

    const areaTop = board.y + board.h + 70;
    const areaBottom = lockers[0].y - 60;
    const areaLeft = 60, areaRight = roomW - 60;
    const areaW = areaRight - areaLeft;
    const areaH = areaBottom - areaTop;

    const gapX = 34;          // 옆자리 사이
    let   gapY = 46;          // 앞뒤 줄 사이 (의자 자리까지 고려)

    /* --- 몇 줄로 놓을지 ---
       교실은 가로로 넓으므로 정사각형보다 조금 옆으로 퍼진 격자가 자연스럽습니다.
       그리고 딱 나누어떨어지는 열 수가 있으면 그쪽을 씁니다 (6명이면 3×2 처럼). */
    const ideal = Math.max(1, Math.round(Math.sqrt(n * 1.4)));
    let cols = ideal;
    let bestDist = Infinity;
    for (let c = Math.max(1, ideal - 2); c <= Math.min(n, ideal + 2); c++) {
      if (n % c) continue;
      const dist = Math.abs(c - ideal);
      if (dist < bestDist) { bestDist = dist; cols = c; }
    }
    // 교실 가로를 넘지 않게
    const maxCols = Math.max(1, Math.floor((areaW + gapX) / (dw + gapX)));
    cols = Math.min(cols, maxCols);

    let rows = Math.ceil(n / cols);
    // 세로가 넘치면 줄 간격부터 줄여 봅니다
    if (rows * dh + (rows - 1) * gapY > areaH && rows > 1) {
      gapY = Math.max(10, (areaH - rows * dh) / (rows - 1));
    }

    const totalW = cols * dw + (cols - 1) * gapX;
    const totalH = rows * dh + (rows - 1) * gapY;
    const originX = S(areaLeft + (areaW - totalW) / 2);
    const originY = S(areaTop + Math.max(0, (areaH - totalH) / 2));

    const desks = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      // 마지막 줄이 덜 찼으면 가운데로 모아 줍니다
      const inRow = Math.min(cols, n - r * cols);
      const rowW = inRow * dw + (inRow - 1) * gapX;
      const rowX = S(originX + (totalW - rowW) / 2);
      desks.push({
        id: uid('dk'),
        gid: null,          // 모둠 없음
        no: i + 1,
        x: S(rowX + c * (dw + gapX)),
        y: S(originY + r * (dh + gapY)),
      });
    }

    return { board, lockers, groups: [], desks };
  },
};
