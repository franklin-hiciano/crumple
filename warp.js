(() => {
  if (window.__fisheyeInjected) return; // avoid double‑inject
  window.__fisheyeInjected = true;

  // ----- config -----
  const MAX_LENSES = 16;
  const state = {
    base: 0.7, // base shrink (0.3..1)
    lenses: [], // [{x,y,r,k}] in CSS px (viewport space)
    dragging: null, // lens index being dragged
    draggingPage: false, // reserved (not used inside content frames)
  };

  // ----- overlay UI (markers only; page DOM itself is warped) -----
  const overlay = document.createElement("div");
  overlay.id = "fisheye-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: 0,
    zIndex: 2147483646,
    pointerEvents: "none",
  });
  const canvas = document.createElement("canvas");
  overlay.appendChild(canvas);
  document.documentElement.appendChild(overlay);
  const ctx = canvas.getContext("2d");

  function fit() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  fit();
  addEventListener("resize", fit, { passive: true });

  function drawOverlay() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // frame vignette (optional)
    // markers
    ctx.lineWidth = 1.5;
    for (let i = 0; i < state.lenses.length; i++) {
      const L = state.lenses[i];
      ctx.strokeStyle = "rgba(167,139,250,0.6)";
      ctx.beginPath();
      ctx.arc(L.x, L.y, L.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle =
        i === state.dragging
          ? "rgba(167,139,250,0.95)"
          : "rgba(167,139,250,0.75)";
      ctx.beginPath();
      ctx.arc(L.x, L.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ----- geometry -----
  function baseMap(pt) {
    // pt in px → px
    const cx = innerWidth / 2,
      cy = innerHeight / 2;
    const s = Math.max(0.01, state.base);
    return { x: cx + (pt.x - cx) / s, y: cy + (pt.y - cy) / s };
  }
  function lensMap(pt) {
    // sequential edge‑unaware radial lenses in px
    let x = pt.x,
      y = pt.y;
    for (const L of state.lenses) {
      const dx = x - L.x,
        dy = y - L.y;
      const r2 = dx * dx + dy * dy;
      const m = 1.0 / (1.0 + L.k * Math.exp(-r2 / (2 * L.r * L.r)));
      x = L.x + dx * m;
      y = L.y + dy * m;
    }
    return { x, y };
  }
  function mapPoint(pt) {
    return lensMap(baseMap(pt));
  }

  // approximate local scale with finite differences
  function localScale(pt) {
    const e = 1;
    const p0 = mapPoint(pt);
    const px = mapPoint({ x: pt.x + e, y: pt.y });
    const py = mapPoint({ x: pt.x, y: pt.y + e });
    const sx = Math.hypot(px.x - p0.x, px.y - p0.y) / e;
    const sy = Math.hypot(py.x - p0.x, py.y - p0.y) / e;
    return Math.max(0.25, Math.min(3, (sx + sy) / 2));
  }

  // ----- DOM warp (true WYSIWYG because we transform elements) -----
  const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE", "HEAD"]);
  function collectNodes() {
    const out = [];
    const all = document.body ? document.body.querySelectorAll("*") : [];
    for (const el of all) {
      if (SKIP.has(el.tagName)) continue;
      if (!el.offsetParent && getComputedStyle(el).position !== "fixed")
        continue; // skip hidden
      if (el.closest("#fisheye-overlay")) continue; // don’t warp overlay
      out.push(el);
    }
    return out;
  }
  let nodes = [];
  function refreshNodes() {
    nodes = collectNodes();
  }
  const mo = new MutationObserver(() => {
    refreshNodes();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  addEventListener("load", refreshNodes, { once: true });
  refreshNodes();

  function applyWarp() {
    // scroll/resize safe mapping in viewport coords
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2,
        cy = r.top + r.height / 2;
      const m = mapPoint({ x: cx, y: cy });
      const s = localScale({ x: cx, y: cy });
      const dx = m.x - cx,
        dy = m.y - cy;
      el.style.transform = `translate(${dx}px,${dy}px) scale(${s})`;
      el.style.transformOrigin = "center center";
      el.style.willChange = "transform";
    }
  }

  // throttle the warp loop
  let dirty = true;
  let lastW = innerWidth,
    lastH = innerHeight,
    lastSX = scrollX,
    lastSY = scrollY;
  function tick() {
    requestAnimationFrame(tick);
    const need =
      dirty ||
      lastW !== innerWidth ||
      lastH !== innerHeight ||
      lastSX !== scrollX ||
      lastSY !== scrollY;
    if (!need) return;
    lastW = innerWidth;
    lastH = innerHeight;
    lastSX = scrollX;
    lastSY = scrollY;
    dirty = false;
    applyWarp();
    drawOverlay();
  }
  tick();

  // ----- input: add/move lenses inside this page -----
  function pickLens(x, y) {
    let bi = -1,
      bd = 1e9;
    for (let i = 0; i < state.lenses.length; i++) {
      const L = state.lenses[i];
      const d = (L.x - x) ** 2 + (L.y - y) ** 2;
      if (d < bd && d < 14 * 14) {
        bd = d;
        bi = i;
      }
    }
    return bi;
  }

  function onPointerDown(e) {
    // capture events to keep page from reacting to clicks under overlay
    if (e.target === canvas || e.target === overlay) {
      e.preventDefault();
    }
    const x = e.clientX,
      y = e.clientY;
    const i = pickLens(x, y);
    if (i >= 0) {
      state.dragging = i;
      overlay.style.pointerEvents = "auto";
      return;
    }
    // add new lens at the *display* point (WYSIWYG)
    if (state.lenses.length >= MAX_LENSES) state.lenses.shift();
    state.lenses.push({ x, y, r: 160, k: 2.0 });
    dirty = true;
    drawOverlay();
  }
  function onPointerMove(e) {
    if (state.dragging == null) return;
    const L = state.lenses[state.dragging];
    L.x = e.clientX;
    L.y = e.clientY;
    dirty = true;
  }
  function onPointerUp() {
    state.dragging = null;
    overlay.style.pointerEvents = "none";
  }
  function onWheel(e) {
    const i = pickLens(e.clientX, e.clientY);
    if (i < 0) return;
    const L = state.lenses[i];
    if (e.altKey) {
      L.k = Math.max(0, Math.min(4, L.k + -e.deltaY * 0.002));
    } else {
      L.r = Math.max(20, Math.min(800, L.r + -e.deltaY * 0.5));
    }
    dirty = true;
    e.preventDefault();
  }

  overlay.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("wheel", onWheel, { passive: false });

  // API via postMessage (optional): viewer can set base scale, clear lenses, etc.
  window.addEventListener("message", (ev) => {
    const msg = ev.data || {};
    if (msg.__fisheye !== true) return;
    if (typeof msg.base === "number") {
      state.base = Math.max(0.3, Math.min(1, msg.base));
      dirty = true;
    }
    if (msg.clear) {
      state.lenses.length = 0;
      dirty = true;
    }
  });
})();
