(() => {
  if (window.__fisheyeInjected) return; // avoid double‑inject
  window.__fisheyeInjected = true;

  const MAX_LENSES = 16;
  const state = {
    base: 0.7,
    lenses: [],
    dragging: null,
    enabled: false,
    lastMouse: { x: innerWidth / 2, y: innerHeight / 2 },
  };

  // Overlay draws handles and (when enabled) captures input
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
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }
  fit();
  addEventListener("resize", fit, { passive: true });
  addEventListener(
    "mousemove",
    (e) => {
      state.lastMouse.x = e.clientX;
      state.lastMouse.y = e.clientY;
    },
    { passive: true },
  );

  function drawOverlay() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state.enabled) return; // show handles only when enabled
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

  // Mapping
  function baseMap(pt) {
    const cx = innerWidth / 2,
      cy = innerHeight / 2,
      s = Math.max(0.01, state.base);
    return { x: cx + (pt.x - cx) / s, y: cy + (pt.y - cy) / s };
  }
  function lensMap(pt) {
    let x = pt.x,
      y = pt.y;
    for (const L of state.lenses) {
      const dx = x - L.x,
        dy = y - L.y;
      const r2 = dx * dx + dy * dy;
      const m = 1 / (1 + L.k * Math.exp(-r2 / (2 * L.r * L.r)));
      x = L.x + dx * m;
      y = L.y + dy * m;
    }
    return { x, y };
  }
  function mapPoint(pt) {
    return lensMap(baseMap(pt));
  }
  function localScale(pt) {
    const e = 1,
      p0 = mapPoint(pt),
      px = mapPoint({ x: pt.x + e, y: pt.y }),
      py = mapPoint({ x: pt.x, y: pt.y + e });
    const sx = Math.hypot(px.x - p0.x, px.y - p0.y) / e,
      sy = Math.hypot(py.x - p0.x, py.y - p0.y) / e;
    return Math.max(0.25, Math.min(3, (sx + sy) / 2));
  }

  // DOM warp
  const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE", "HEAD"]);
  function collectNodes() {
    const out = [];
    const all = document.body ? document.body.querySelectorAll("*") : [];
    for (const el of all) {
      if (SKIP.has(el.tagName)) continue;
      if (!el.offsetParent && getComputedStyle(el).position !== "fixed")
        continue;
      if (el.closest("#fisheye-overlay")) continue;
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
    dirty = true;
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  addEventListener("load", refreshNodes, { once: true });
  refreshNodes();

  function applyWarp() {
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

  // Loop
  let dirty = true,
    lw = innerWidth,
    lh = innerHeight,
    lsx = scrollX,
    lsy = scrollY;
  function tick() {
    requestAnimationFrame(tick);
    const need =
      dirty ||
      lw !== innerWidth ||
      lh !== innerHeight ||
      lsx !== scrollX ||
      lsy !== scrollY;
    if (!need) return;
    lw = innerWidth;
    lh = innerHeight;
    lsx = scrollX;
    lsy = scrollY;
    dirty = false;
    applyWarp();
    drawOverlay();
  }
  tick();

  // Input (enabled only when state.enabled)
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
    if (!state.enabled) return;
    if (e.target === canvas || e.target === overlay) e.preventDefault();
    const x = e.clientX,
      y = e.clientY;
    const i = pickLens(x, y);
    if (e.shiftKey) {
      if (i >= 0) {
        state.lenses.splice(i, 1);
        dirty = true;
        drawOverlay();
      }
      return;
    }
    if (i >= 0) {
      state.dragging = i;
      return;
    }
    if (state.lenses.length >= MAX_LENSES) state.lenses.shift();
    state.lenses.push({ x, y, r: 160, k: 2.0 });
    dirty = true;
    drawOverlay();
  }
  function onPointerMove(e) {
    if (!state.enabled) return;
    if (state.dragging == null) return;
    const L = state.lenses[state.dragging];
    L.x = e.clientX;
    L.y = e.clientY;
    dirty = true;
  }
  function onPointerUp() {
    if (!state.enabled) return;
    state.dragging = null;
  }
  function onWheel(e) {
    if (!state.enabled) return;
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

  function setEnabled(on) {
    state.enabled = !!on;
    overlay.style.pointerEvents = on ? "auto" : "none";
    drawOverlay();
  }

  // Messages from action / commands
  chrome.runtime?.onMessage?.addListener((msg) => {
    if (!msg || msg.__fisheye !== true) return;
    if (msg.cmd === "toggle-warp") {
      setEnabled(!state.enabled);
    }
    if (msg.cmd === "add-lens") {
      const p = state.lastMouse;
      if (state.lenses.length >= MAX_LENSES) state.lenses.shift();
      state.lenses.push({ x: p.x, y: p.y, r: 160, k: 2.0 });
      dirty = true;
      drawOverlay();
    }
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
