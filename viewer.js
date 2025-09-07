(function () {
  const stage = document.getElementById("stage");
  const promptEl = document.getElementById("prompt");
  const urlIn = document.getElementById("url");

  stage.addEventListener("pointerdown", (e) => {
    if (e.target !== stage) return; // clicked a tile
    showPrompt(e.clientX, e.clientY);
  });

  function showPrompt(x, y) {
    promptEl.style.left = x + "px";
    promptEl.style.top = y + "px";
    promptEl.hidden = false;
    urlIn.value = "";
    urlIn.focus();
  }
  urlIn.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      promptEl.hidden = true;
    }
    if (e.key === "Enter") {
      const url = urlIn.value.trim() || "https://example.org/";
      promptEl.hidden = true;
      addTile(url);
    }
  });

  function addTile(url) {
    const w = Math.round(innerWidth * 0.5),
      h = Math.round(innerHeight * 0.6);
    const x = Math.round((innerWidth - w) / 2 + (Math.random() * 100 - 50));
    const y = Math.round((innerHeight - h) / 2 + (Math.random() * 80 - 40));

    const tile = document.createElement("div");
    tile.className = "tile";
    Object.assign(tile.style, {
      left: x + "px",
      top: y + "px",
      width: w + "px",
      height: h + "px",
    });
    const iframe = document.createElement("iframe");
    iframe.src = url;
    tile.appendChild(iframe);

    // Always provide a way to open real tab where the content script runs
    const ui = document.createElement("div");
    ui.className = "tile-ui";
    const openBtn = document.createElement("button");
    openBtn.className = "btn";
    openBtn.textContent = "Open in tab & enable";
    openBtn.addEventListener("click", () => {
      if (chrome?.tabs?.create) {
        chrome.tabs.create({ url }, (tab) => {
          // after tab opens, toggle lens mode
          setTimeout(
            () =>
              chrome.tabs.sendMessage(tab.id, {
                __fisheye: true,
                cmd: "toggle-warp",
              }),
            800,
          );
        });
      } else {
        const w = window.open(url, "_blank");
        // best effort: cannot message across windows without extension API
      }
    });
    ui.appendChild(openBtn);
    tile.appendChild(ui);

    stage.appendChild(tile);

    // drag by border (16px band)
    let dragging = false,
      offX = 0,
      offY = 0;
    tile.addEventListener("pointerdown", (e) => {
      const r = tile.getBoundingClientRect();
      const nearEdge =
        e.clientX < r.left + 16 ||
        e.clientX > r.right - 16 ||
        e.clientY < r.top + 16 ||
        e.clientY > r.bottom - 16;
      if (!nearEdge) return;
      dragging = true;
      offX = e.clientX - r.left;
      offY = e.clientY - r.top;
      e.preventDefault();
    });
    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      tile.style.left = e.clientX - offX + "px";
      tile.style.top = e.clientY - offY + "px";
    });
    window.addEventListener("pointerup", () => {
      dragging = false;
    });
  }
})();
