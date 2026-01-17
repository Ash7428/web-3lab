(() => {
  "use strict";

  // ====== STORAGE KEYS ======
  const KEY_STATE = "itmo_2048_state";
  const KEY_LEADERS = "itmo_2048_leaders";

  // ====== DOM ======
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const undoBtn = document.getElementById("undoBtn");
  const newGameBtn = document.getElementById("newGameBtn");
  const leadersBtn = document.getElementById("leadersBtn");

  const boardEl = document.getElementById("board");
  const bgGrid = document.getElementById("bgGrid");
  const tilesLayer = document.getElementById("tilesLayer");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const submitForm = document.getElementById("submitForm");
  const playerNameInput = document.getElementById("playerName");
  const saveScoreBtn = document.getElementById("saveScoreBtn");
  const restartBtn = document.getElementById("restartBtn");

  const leadersModal = document.getElementById("leadersModal");
  const modalBackdrop = document.getElementById("modalBackdrop");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const clearLeadersBtn = document.getElementById("clearLeadersBtn");
  const leadersTbody = document.getElementById("leadersTbody");

  const mobileControls = document.getElementById("mobileControls");

  // ====== HELPERS ======
  const rand = (n) => Math.floor(Math.random() * n);

  const deepCopyBoard = (b) => b.map(row => row.slice());
  const boardsEqual = (a, b) => {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (a[r][c] !== b[r][c]) return false;
    return true;
  };

  const emptyBoard = () => Array.from({ length: 4 }, () => Array(4).fill(0));

  function getEmptyCells(board) {
    const cells = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (board[r][c] === 0) cells.push({ r, c });
      }
    }
    return cells;
  }

  function canMove(board) {
    // есть пустые — можно
    if (getEmptyCells(board).length > 0) return true;

    // есть соседние равные — можно
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const v = board[r][c];
        if (r < 3 && board[r + 1][c] === v) return true;
        if (c < 3 && board[r][c + 1] === v) return true;
      }
    }
    return false;
  }

  function formatDate() {
    // финально можно заменить на ISO — но в таблице удобнее локально
    return new Date().toLocaleString("ru-RU");
  }

  // ====== TILE MODEL FOR ANIMATIONS ======
  // tilesById: Map(id -> {id, value, r, c})
  // tileIdAtPos: 4x4 containing tileId or null
  let nextTileId = 1;

  function rebuildTileMapsFromBoard(board) {
    tilesById.clear();
    tileIdAtPos = Array.from({ length: 4 }, () => Array(4).fill(null));
    nextTileId = 1;

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const v = board[r][c];
        if (v !== 0) {
          const id = nextTileId++;
          const tile = { id, value: v, r, c };
          tilesById.set(id, tile);
          tileIdAtPos[r][c] = id;
        }
      }
    }
  }

  // ====== GAME STATE ======
  let state = {
    board: emptyBoard(),
    score: 0,
    best: 0,
    gameOver: false,
    // undo snapshot
    prev: null, // {board, score, best}
  };

  let tilesById = new Map();
  let tileIdAtPos = Array.from({ length: 4 }, () => Array(4).fill(null));

  // ====== UI SIZING ======
  function updateCellSize() {
    // адаптивный пересчет клетки: поле не должно вылезать за экран
    const maxW = Math.min(window.innerWidth - 32, 520);
    const gap = 12;
    const cell = Math.floor((maxW - gap * 5) / 4);
    document.documentElement.style.setProperty("--cell", `${Math.max(cell, 58)}px`);
  }

  function buildBgGrid() {
    bgGrid.innerHTML = "";
    for (let i = 0; i < 16; i++) {
      const d = document.createElement("div");
      d.className = "bg-cell";
      bgGrid.appendChild(d);
    }
  }

  // ====== RENDER ======
  function classForValue(v) {
    return `v${v}`;
  }

  function posToTranslate(r, c) {
    // translate using CSS var cell + gap
    const gap = 12;
    const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell")) || 76;
    const x = c * (cell + gap);
    const y = r * (cell + gap);
    return { x, y };
  }

  function ensureTileElement(id) {
    let el = tilesLayer.querySelector(`[data-id="${id}"]`);
    if (!el) {
      el = document.createElement("div");
      el.className = "tile";
      el.dataset.id = String(id);
      tilesLayer.appendChild(el);
    }
    return el;
  }

  function removeTileElement(id) {
    const el = tilesLayer.querySelector(`[data-id="${id}"]`);
    if (el) el.remove();
  }

  function renderTiles(animFlags = {}) {
    // animFlags: { newIds:Set, mergeIds:Set, removeIds:Set }
    const newIds = animFlags.newIds || new Set();
    const mergeIds = animFlags.mergeIds || new Set();
    const removeIds = animFlags.removeIds || new Set();

    // remove first (for merged-away tiles) after small delay to allow movement if needed
    // (we do actual delayed removal elsewhere; here is safe cleanup)
    for (const id of removeIds) {
      // keep if element still needed
      if (!tilesById.has(id)) removeTileElement(id);
    }

    // render/update existing
    for (const [id, tile] of tilesById.entries()) {
      const el = ensureTileElement(id);
      el.textContent = String(tile.value);
      el.className = `tile ${classForValue(tile.value)}`;

      if (newIds.has(id)) el.classList.add("new");
      if (mergeIds.has(id)) el.classList.add("merge");

      const { x, y } = posToTranslate(tile.r, tile.c);

      // for pop animation we use CSS vars --x/--y
      el.style.setProperty("--x", `${x}px`);
      el.style.setProperty("--y", `${y}px`);
      el.style.transform = `translate(${x}px, ${y}px)`;
    }

    // remove elements that exist but tile no longer exists
    const existingEls = [...tilesLayer.querySelectorAll(".tile")];
    for (const el of existingEls) {
      const id = Number(el.dataset.id);
      if (!tilesById.has(id)) el.remove();
    }
  }

  function renderStats() {
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(state.best);
    undoBtn.disabled = !(state.prev && !state.gameOver);
  }

  function showOverlay(show) {
    overlay.hidden = !show;
  }

  function setOverlayModeSaved(saved) {
    if (saved) {
      overlayText.textContent = "Ваш рекорд сохранен";
      submitForm.style.display = "none";
    } else {
      overlayText.textContent = "Введите имя и сохраните рекорд";
      submitForm.style.display = "flex";
      playerNameInput.value = "";
    }
  }

  function setControlsVisibility() {
    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    const overlayActive = !overlay.hidden;
    const modalActive = !leadersModal.hidden;

    // Показываем кнопки только:
    // - на мобиле
    // - во время игры
    // - когда не открыт лидерборд и нет сабмита/overlay
    mobileControls.hidden = !(isMobile && !overlayActive && !modalActive && !state.gameOver);
    // Примечание: state.gameOver -> overlay обычно открыт. Оставили условие "во время игры"
    // Если захочешь показывать в момент gameOver — убери !state.gameOver.
  }

  // ====== SPAWN ======
  function addRandomTile(countMin = 1, countMax = 2) {
    const empties = getEmptyCells(state.board);
    if (empties.length === 0) return new Set();

    const howMany = Math.min(empties.length, countMin + rand(countMax - countMin + 1));
    const newIds = new Set();

    for (let i = 0; i < howMany; i++) {
      const emptiesNow = getEmptyCells(state.board);
      if (emptiesNow.length === 0) break;
      const pick = emptiesNow[rand(emptiesNow.length)];
      const value = Math.random() < 0.9 ? 2 : 4;

      state.board[pick.r][pick.c] = value;

      // create tile model + dom id
      const id = nextTileId++;
      tilesById.set(id, { id, value, r: pick.r, c: pick.c });
      tileIdAtPos[pick.r][pick.c] = id;
      newIds.add(id);
    }
    return newIds;
  }

  // ====== MOVE LOGIC (classic 2048 merge once per tile per move) ======
  function lineCoords(dir, index) {
    // returns array of {r,c} positions in the order we "pull" tiles
    const coords = [];
    for (let k = 0; k < 4; k++) {
      if (dir === "left") coords.push({ r: index, c: k });
      if (dir === "right") coords.push({ r: index, c: 3 - k });
      if (dir === "up") coords.push({ r: k, c: index });
      if (dir === "down") coords.push({ r: 3 - k, c: index });
    }
    return coords;
  }

  function move(dir) {
    if (state.gameOver) return;
    if (!["left", "right", "up", "down"].includes(dir)) return;

    const beforeBoard = deepCopyBoard(state.board);

    // snapshot for undo (only if something changes)
    const prevSnapshot = {
      board: deepCopyBoard(state.board),
      score: state.score,
      best: state.best,
      // for visual tiles, we just rebuild from board on undo
    };

    let gained = 0;
    const mergeIds = new Set();
    const removedIds = new Set();
    let anyMoved = false;

    // reset position mapping to null, will be re-filled
    const newTileIdAtPos = Array.from({ length: 4 }, () => Array(4).fill(null));

    // We'll process each line, moving tile objects and merging.
    // For each line:
    // 1) collect tiles in order
    // 2) compress
    // 3) merge adjacent equals (once)
    // 4) write them back from start in that direction
    for (let i = 0; i < 4; i++) {
      const coords = lineCoords(dir, i);

      // collect tile ids (non-empty)
      const ids = [];
      for (const { r, c } of coords) {
        const id = tileIdAtPos[r][c];
        if (id != null) ids.push(id);
      }

      // build merged list of ids after merge
      const out = [];
      let p = 0;
      while (p < ids.length) {
        const idA = ids[p];
        const tileA = tilesById.get(idA);
        const nextId = ids[p + 1];
        const tileB = nextId ? tilesById.get(nextId) : null;

        if (tileB && tileA.value === tileB.value) {
          // merge B into A (keep A id)
          tileA.value *= 2;
          gained += tileA.value;
          mergeIds.add(tileA.id);

          // remove B tile
          tilesById.delete(tileB.id);
          removedIds.add(tileB.id);

          out.push(tileA.id);
          p += 2;
          anyMoved = true;
        } else {
          out.push(tileA.id);
          p += 1;
        }
      }

      // write back tiles to line start (coords[0..])
      for (let k = 0; k < 4; k++) {
        const target = coords[k];
        const id = out[k] ?? null;

        if (id == null) {
          state.board[target.r][target.c] = 0;
          newTileIdAtPos[target.r][target.c] = null;
          continue;
        }

        const tile = tilesById.get(id);
        // detect movement
        if (tile.r !== target.r || tile.c !== target.c) anyMoved = true;

        tile.r = target.r;
        tile.c = target.c;

        state.board[target.r][target.c] = tile.value;
        newTileIdAtPos[target.r][target.c] = id;
      }
    }

    if (!anyMoved || boardsEqual(beforeBoard, state.board)) {
      // no changes -> do nothing
      return;
    }

    // apply new mapping
    tileIdAtPos = newTileIdAtPos;

    // update score/best
    state.score += gained;
    state.best = Math.max(state.best, state.score);

    // spawn 1-2 new tiles
    const newIds = addRandomTile(1, 2);

    // update stats + render
    state.prev = prevSnapshot;
    renderStats();
    renderTiles({ newIds, mergeIds, removeIds: removedIds });

    // check game over
    if (!canMove(state.board)) {
      state.gameOver = true;
      showOverlay(true);
      setOverlayModeSaved(false);
    }

    setControlsVisibility();
    saveState();
  }

  // ====== UNDO ======
  function undo() {
    if (!state.prev) return;
    if (state.gameOver) return;

    state.board = deepCopyBoard(state.prev.board);
    state.score = state.prev.score;
    state.best = state.prev.best;
    state.prev = null;

    // rebuild tiles from board (animation not required for undo)
    rebuildTileMapsFromBoard(state.board);

    renderStats();
    renderTiles();
    setControlsVisibility();
    saveState();
  }

  // ====== NEW GAME ======
  function newGame() {
    state.board = emptyBoard();
    state.score = 0;
    state.best = Math.max(state.best, 0);
    state.gameOver = false;
    state.prev = null;

    tilesById.clear();
    tileIdAtPos = Array.from({ length: 4 }, () => Array(4).fill(null));
    nextTileId = 1;

    // initial spawn: 2-3 tiles
    const count = 2 + rand(2); // 2 or 3
    const newIds = addRandomTile(count, count);

    showOverlay(false);
    setOverlayModeSaved(false);

    renderStats();
    renderTiles({ newIds });
    setControlsVisibility();
    saveState();
  }

  // ====== LEADERS ======
  function loadLeaders() {
    try {
      const raw = localStorage.getItem(KEY_LEADERS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveLeaders(list) {
    localStorage.setItem(KEY_LEADERS, JSON.stringify(list));
  }

  function renderLeaders() {
    const leaders = loadLeaders();
    leadersTbody.innerHTML = "";

    if (leaders.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" style="color:#6b5b52;">Пока нет рекордов</td>`;
      leadersTbody.appendChild(tr);
      return;
    }

    leaders.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${row.score}</td>
        <td>${escapeHtml(row.date)}</td>
      `;
      leadersTbody.appendChild(tr);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function openLeaders() {
    leadersModal.hidden = false;
    renderLeaders();
    setControlsVisibility();
  }

  function closeLeaders() {
    leadersModal.hidden = true;
    setControlsVisibility();
  }

  function saveScoreToLeaders() {
    const name = (playerNameInput.value || "").trim();
    if (!name) {
      playerNameInput.focus();
      playerNameInput.style.borderColor = "rgba(217,123,69,.9)";
      setTimeout(() => (playerNameInput.style.borderColor = "rgba(0,0,0,.12)"), 600);
      return;
    }

    const record = { name, score: state.score, date: formatDate() };
    const list = loadLeaders();
    list.push(record);

    list.sort((a, b) => b.score - a.score);
    const top10 = list.slice(0, 10);
    saveLeaders(top10);

    setOverlayModeSaved(true);
  }

  // ====== STORAGE: SAVE/LOAD GAME ======
  function saveState() {
    const data = {
      board: state.board,
      score: state.score,
      best: state.best,
      gameOver: state.gameOver,
      prev: state.prev ? { board: state.prev.board, score: state.prev.score, best: state.prev.best } : null,
      v: 1,
    };
    localStorage.setItem(KEY_STATE, JSON.stringify(data));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(KEY_STATE);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.board)) return false;

      state.board = data.board;
      state.score = Number(data.score || 0);
      state.best = Number(data.best || 0);
      state.gameOver = Boolean(data.gameOver);
      state.prev = data.prev ? {
        board: data.prev.board,
        score: Number(data.prev.score || 0),
        best: Number(data.prev.best || 0),
      } : null;

      rebuildTileMapsFromBoard(state.board);

      renderStats();
      renderTiles();

      if (state.gameOver) {
        showOverlay(true);
        setOverlayModeSaved(false);
      } else {
        showOverlay(false);
      }

      setControlsVisibility();
      return true;
    } catch {
      return false;
    }
  }

  // ====== INPUT: KEYBOARD ======
  function onKeyDown(e) {
    if (!leadersModal.hidden) return; // на модалке не двигаем
    if (!overlay.hidden) return;      // на сабмите не двигаем

    const key = e.key;
    if (key === "ArrowLeft") { e.preventDefault(); move("left"); }
    if (key === "ArrowRight") { e.preventDefault(); move("right"); }
    if (key === "ArrowUp") { e.preventDefault(); move("up"); }
    if (key === "ArrowDown") { e.preventDefault(); move("down"); }
  }

  // ====== INPUT: MOBILE BUTTONS ======
  function onMobileClick(e) {
    const btn = e.target.closest("[data-dir]");
    if (!btn) return;
    if (!leadersModal.hidden) return;
    if (!overlay.hidden) return;

    move(btn.dataset.dir);
  }

  // Optional: swipe control (можешь включить и тогда кнопки на мобиле можно вообще убрать)
  let touchStart = null;
  function onTouchStart(ev) {
    if (!leadersModal.hidden) return;
    if (!overlay.hidden) return;
    const t = ev.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(ev) {
    if (!touchStart) return;
    if (!leadersModal.hidden) return;
    if (!overlay.hidden) return;

    const t = ev.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 24) return;

    if (absX > absY) move(dx > 0 ? "right" : "left");
    else move(dy > 0 ? "down" : "up");
  }

  // ====== EVENTS ======
  function bindEvents() {
    window.addEventListener("keydown", onKeyDown);

    newGameBtn.addEventListener("click", newGame);
    restartBtn.addEventListener("click", newGame);
    undoBtn.addEventListener("click", undo);

    leadersBtn.addEventListener("click", openLeaders);
    closeModalBtn.addEventListener("click", closeLeaders);
    modalBackdrop.addEventListener("click", closeLeaders);

    clearLeadersBtn.addEventListener("click", () => {
      saveLeaders([]);
      renderLeaders();
    });

    saveScoreBtn.addEventListener("click", saveScoreToLeaders);

    mobileControls.addEventListener("click", onMobileClick);

    // swipe enabled
    boardEl.addEventListener("touchstart", onTouchStart, { passive: true });
    boardEl.addEventListener("touchend", onTouchEnd, { passive: true });

    window.addEventListener("resize", () => {
      updateCellSize();
      renderTiles(); // пересчитать translate
      setControlsVisibility();
    });
  }

  // ====== INIT ======
  function init() {
    updateCellSize();
    buildBgGrid();
    bindEvents();

    const ok = loadState();
    if (!ok) newGame();
    else renderStats();

    // если overlay открыт -> скрыть моб. управление
    setControlsVisibility();
  }

  init();
})();
