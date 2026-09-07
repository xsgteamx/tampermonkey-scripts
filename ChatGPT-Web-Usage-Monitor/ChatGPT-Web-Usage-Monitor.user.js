// ==UserScript==
// @name         ChatGPT Web Usage Monitor
// @namespace    https://greasyfork.org/
// @version      3.0.0
// @description  在 chatgpt.com 显示 Work/Codex 的 5h/7d 用量悬浮窗；自动判断展开方向、亮暗主题自适应、本地倒计时、支持触屏拖拽
// @author       https://github.com/xsgteamx & Claude
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // 保存原始 fetch：页面上可能有别的脚本 hook 了 window.fetch，
  // 走原始引用可避免我们的请求被第三方逻辑穿一遍。
  const _origFetch = window.fetch.bind(window);

  const CodexUsageWidget = (() => {
    const POS_KEY = "codex-usage-position";
    const REFRESH_MS = 65 * 1000;
    const COUNTDOWN_MS = 30 * 1000;
    const SESSION_ENDPOINT = "/api/auth/session";
    const USAGE_ENDPOINTS = ["/backend-api/wham/usage", "/backend-api/codex/usage"];

    let panel = null;
    let isHovered = false;
    let isDragging = false;
    let usageHidden = false;      // 账户不支持 Codex 用量时隐藏面板并停止轮询
    let refreshTimer = null;
    let countdownTimer = null;
    let cachedToken = null, tokenFetchedAt = 0;

    // 默认右上角；isRight 决定展开方向（靠右向左展开，靠左向右展开）
    let savedPosition = { left: null, right: 20, top: 90, isRight: true };

    let usageData = {
      fiveHour: { used: 0, resetAt: null },
      sevenDay: { used: 0, resetAt: null },
      lastFetch: null,
      fetchError: null,
    };

    // ---------- 布局参数 ----------
    function isMobileLayout() { return window.innerWidth <= 768; }

    function getMetrics() {
      if (isMobileLayout()) {
        return {
          collapsedWidth: 46,
          expandedWidth: Math.min(160, window.innerWidth - 16),
          padding: "6px 4px",
          borderRadius: "12px",
        };
      }
      return {
        collapsedWidth: 85,
        expandedWidth: 180,
        padding: "12px 10px",
        borderRadius: "16px",
      };
    }

    // ---------- 主题 ----------
    function isDarkTheme() {
      return (
        document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark" ||
        window.matchMedia("(prefers-color-scheme: dark)").matches
      );
    }

    function applyTheme() {
      if (!panel) return;
      if (isDarkTheme()) {
        Object.assign(panel.style, {
          background: "rgba(33, 33, 33, 0.96)",
          borderColor: "rgba(255,255,255,0.08)",
          color: "#ececec",
        });
      } else {
        Object.assign(panel.style, {
          background: "rgba(255, 255, 255, 0.97)",
          borderColor: "rgba(0,0,0,0.10)",
          color: "#33373d",
        });
      }
    }

    // ---------- 数值 / 时间 ----------
    function pct(v) { return Math.min(100, Math.max(0, Math.round(v || 0))); }

    // 按"已用"比例判断健康度：用得越多越红
    function colorFor(usedPct) {
      const dark = isDarkTheme();
      if (usedPct < 60) return dark ? "#34d399" : "#10b981";
      if (usedPct < 85) return dark ? "#fbbf24" : "#f59e0b";
      return dark ? "#f87171" : "#ef4444";
    }

    function cdText(resetAt) {
      if (!resetAt) return "";
      const target = typeof resetAt === "string" ? new Date(resetAt).getTime() : resetAt * 1000;
      const diff = target - Date.now();
      if (diff <= 0) return "已重置";
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      if (d > 0) return `${d}d ${h}h`;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    function fmtTime(resetAt) {
      if (!resetAt) return "—";
      const d = typeof resetAt === "string" ? new Date(resetAt) : new Date(resetAt * 1000);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("zh-CN", {
        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
      });
    }

    // ---------- 面板 ----------
    function createPanel() {
      const m = getMetrics();
      panel = document.createElement("div");
      panel.id = "codex-usage-panel";
      Object.assign(panel.style, {
        position: "fixed",
        top: savedPosition.top + "px",
        right: savedPosition.right + "px",
        bottom: "auto",
        left: "auto",
        zIndex: "2147483647",
        border: "1px solid",
        borderRadius: m.borderRadius,
        backdropFilter: "blur(8px)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        padding: m.padding,
        width: m.collapsedWidth + "px",
        userSelect: "none",
        cursor: "move",
        transition: "all 0.18s ease",
        touchAction: "none",
        display: "none", // 拿到数据前不显示，避免闪一个空壳
      });
      applyTheme();
      return panel;
    }

    function render() {
      if (!panel || !document.getElementById("codex-usage-panel")) return;

      // 没数据 / 出错 / 账户不支持 → 直接隐藏，不占地方
      if (usageHidden || !usageData.lastFetch || usageData.fetchError) {
        panel.style.display = "none";
        return;
      }
      panel.style.display = "";
      applyTheme();

      const m = getMetrics();
      const mobile = isMobileLayout();
      const dark = isDarkTheme();
      const muted = dark ? "rgba(236,236,236,0.55)" : "rgba(51,55,61,0.55)";

      const fhUsed = pct(usageData.fiveHour.used);
      const sdUsed = pct(usageData.sevenDay.used);
      const fhRemain = 100 - fhUsed;
      const sdRemain = 100 - sdUsed;
      const fhColor = colorFor(fhUsed);
      const sdColor = colorFor(sdUsed);

      // 关键：按面板在屏幕的哪一半，决定往哪边展开
      const rect = panel.getBoundingClientRect();
      const isRight = savedPosition.isRight !== null
        ? savedPosition.isRight
        : rect.left > window.innerWidth / 2;

      const curTop = savedPosition.top !== null ? savedPosition.top : rect.top;
      const curRight = savedPosition.right !== null ? savedPosition.right : window.innerWidth - rect.right;
      const curLeft = savedPosition.left !== null ? savedPosition.left : rect.left;

      const width = isHovered ? m.expandedWidth : m.collapsedWidth;

      panel.style.top = curTop + "px";
      panel.style.bottom = "auto";
      panel.style.padding = m.padding;
      panel.style.borderRadius = m.borderRadius;
      panel.style.width = width + "px";

      if (isRight) {
        // 靠右：钉住右边缘，变宽时自然往左长
        panel.style.right = Math.max(0, curRight) + "px";
        panel.style.left = "auto";
      } else {
        // 靠左：钉住左边缘，变宽时自然往右长
        const maxLeft = Math.max(0, window.innerWidth - width);
        panel.style.left = Math.max(0, Math.min(curLeft, maxLeft)) + "px";
        panel.style.right = "auto";
      }

      if (isHovered) {
        panel.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="font-size:11px;font-weight:600;opacity:0.85;text-align:center;border-bottom:1px solid ${muted};padding-bottom:6px;">Codex 用量监控</div>
            <div>
              <div style="font-size:9px;color:${muted};margin-bottom:3px;">⚡ 5小时窗口</div>
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
                <span style="font-size:11px;opacity:0.7;">剩余</span>
                <span style="font-size:16px;font-weight:700;color:${fhColor};">${fhRemain}%</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:8px;opacity:0.6;">
                <span>已用 ${fhUsed}%</span><span>${fmtTime(usageData.fiveHour.resetAt)}</span>
              </div>
              <div id="cuw-fh-cd" style="font-size:8px;color:${fhColor};margin-top:2px;text-align:right;">${cdText(usageData.fiveHour.resetAt)}</div>
            </div>
            <div>
              <div style="font-size:9px;color:${muted};margin-bottom:3px;">📅 7天配额</div>
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
                <span style="font-size:11px;opacity:0.7;">剩余</span>
                <span style="font-size:16px;font-weight:700;color:${sdColor};">${sdRemain}%</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:8px;opacity:0.6;">
                <span>已用 ${sdUsed}%</span><span>${fmtTime(usageData.sevenDay.resetAt)}</span>
              </div>
              <div id="cuw-sd-cd" style="font-size:8px;color:${sdColor};margin-top:2px;text-align:right;">${cdText(usageData.sevenDay.resetAt)}</div>
            </div>
          </div>`;
      } else {
        panel.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:${mobile ? 3 : 8}px;align-items:center;">
            <div style="text-align:center;">
              ${mobile ? "" : `<div style="font-size:9px;color:${muted};margin-bottom:2px;">5小时</div>`}
              <div style="font-size:${mobile ? 12 : 18}px;font-weight:700;color:${fhColor};line-height:1.05;">${fhRemain}%</div>
              ${mobile ? "" : `<div id="cuw-fh-cd" style="font-size:9px;color:${muted};margin-top:2px;">${cdText(usageData.fiveHour.resetAt)}</div>`}
            </div>
            <div style="width:${mobile ? 16 : 34}px;height:1px;background:${muted};opacity:0.35;"></div>
            <div style="text-align:center;">
              ${mobile ? "" : `<div style="font-size:9px;color:${muted};margin-bottom:2px;">7天</div>`}
              <div style="font-size:${mobile ? 12 : 18}px;font-weight:700;color:${sdColor};line-height:1.05;">${sdRemain}%</div>
              ${mobile ? "" : `<div id="cuw-sd-cd" style="font-size:9px;color:${muted};margin-top:2px;">${cdText(usageData.sevenDay.resetAt)}</div>`}
            </div>
          </div>`;
      }

      startCountdown();
    }

    // 只更新倒计时文本，不重新打接口
    function startCountdown() {
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(() => {
        const fh = document.getElementById("cuw-fh-cd");
        const sd = document.getElementById("cuw-sd-cd");
        if (fh) fh.textContent = cdText(usageData.fiveHour.resetAt);
        if (sd) sd.textContent = cdText(usageData.sevenDay.resetAt);
      }, COUNTDOWN_MS);
    }

    // ---------- 数据 ----------
    async function getAccessToken() {
      if (cachedToken && Date.now() - tokenFetchedAt < 4 * 60 * 1000) return cachedToken;
      const res = await _origFetch(SESSION_ENDPOINT, {
        credentials: "include", headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`session ${res.status}`);
      const data = await res.json();
      if (!data || !data.accessToken) throw new Error("no accessToken");
      cachedToken = data.accessToken;
      tokenFetchedAt = Date.now();
      return cachedToken;
    }

    function parseUsage(data) {
      if (!data || typeof data !== "object") return false;
      const rl = data.rate_limit || data;
      const primary = rl.primary_window || rl.primary;
      const secondary = rl.secondary_window || rl.secondary;
      if (!primary && !secondary) return false;

      if (primary) {
        usageData.fiveHour = {
          used: primary.used_percent ?? 0,
          resetAt: primary.reset_at ?? (primary.reset_after_seconds != null
            ? Math.floor(Date.now() / 1000) + primary.reset_after_seconds : null),
        };
      }
      if (secondary) {
        usageData.sevenDay = {
          used: secondary.used_percent ?? 0,
          resetAt: secondary.reset_at ?? (secondary.reset_after_seconds != null
            ? Math.floor(Date.now() / 1000) + secondary.reset_after_seconds : null),
        };
      }
      return true;
    }

    async function fetchUsage() {
      if (usageHidden) return;

      let token;
      try {
        token = await getAccessToken();
      } catch (e) {
        usageData.fetchError = "未登录";
        render();
        return;
      }

      usageData.fetchError = null;
      for (const url of USAGE_ENDPOINTS) {
        try {
          const res = await _origFetch(url, {
            credentials: "include",
            headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          });
          if (res.status === 404) continue;
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();

          // 账户不支持 Codex 用量：隐藏面板并停止后续轮询
          const rl = data && (data.rate_limit || data);
          const hasAny = rl && (rl.primary_window || rl.primary || rl.secondary_window || rl.secondary);
          if (!hasAny) {
            usageHidden = true;
            if (refreshTimer) clearInterval(refreshTimer);
            if (panel) panel.style.display = "none";
            console.log("[Codex用量] 该账户无 Codex 用量数据，已隐藏面板并停止轮询");
            return;
          }

          if (parseUsage(data)) {
            usageData.lastFetch = Date.now();
            render();
            return;
          }
        } catch (e) {
          console.warn("[Codex用量] 接口失败:", url, e.message);
        }
      }
      usageData.fetchError = "无法获取数据";
      render();
    }

    // ---------- 拖拽（Pointer Events，兼容触屏）----------
    function enableDrag() {
      let startX, startY, startLeft, startTop, pointerMoved;

      panel.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        isDragging = true;
        pointerMoved = false;
        startX = e.clientX; startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left; startTop = rect.top;
        panel.style.transition = "none";
        panel.style.cursor = "grabbing";
        panel.setPointerCapture?.(e.pointerId);
      });

      document.addEventListener("pointermove", (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          pointerMoved = true;
          isHovered = false; // 拖拽中强制收起，避免尺寸跳变
        }
        // 拖拽过程中就做边界限制，不让它被拖出屏幕
        const cw = getMetrics().collapsedWidth;
        const maxLeft = window.innerWidth - cw;
        const maxTop = window.innerHeight - panel.offsetHeight;
        const newLeft = Math.max(0, Math.min(startLeft + dx, maxLeft));
        const newTop = Math.max(0, Math.min(startTop + dy, maxTop));
        panel.style.left = newLeft + "px";
        panel.style.top = newTop + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      });

      document.addEventListener("pointerup", (e) => {
        if (!isDragging) return;
        isDragging = false;
        panel.style.transition = "all 0.18s ease";
        panel.style.cursor = "move";
        panel.releasePointerCapture?.(e.pointerId);

        const rect = panel.getBoundingClientRect();
        const isRight = rect.left > window.innerWidth / 2;
        if (isRight) {
          savedPosition.right = window.innerWidth - rect.right;
          savedPosition.left = null;
        } else {
          savedPosition.left = rect.left;
          savedPosition.right = null;
        }
        savedPosition.top = rect.top;
        savedPosition.isRight = isRight;
        savePosition();

        // 触屏没有 hover，用「点击切换」兜底
        if (!pointerMoved && e.pointerType !== "mouse") {
          isHovered = !isHovered;
        }
        render();
      });

      document.addEventListener("pointercancel", () => {
        if (!isDragging) return;
        isDragging = false;
        panel.style.transition = "all 0.18s ease";
        panel.style.cursor = "move";
        render();
      });
    }

    function savePosition() {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(savedPosition));
      } catch (e) {}
    }

    function loadPosition() {
      try {
        const saved = JSON.parse(localStorage.getItem(POS_KEY));
        if (!saved) return;
        const cw = getMetrics().collapsedWidth;
        let top = parseFloat(saved.top);
        if (!isFinite(top)) top = 90;
        top = Math.max(0, Math.min(top, window.innerHeight - 100));
        savedPosition.top = top;
        savedPosition.isRight = saved.isRight !== undefined ? saved.isRight : true;
        if (savedPosition.isRight && saved.right != null) {
          savedPosition.right = Math.max(0, Math.min(parseFloat(saved.right), window.innerWidth - cw));
          savedPosition.left = null;
        } else if (saved.left != null) {
          savedPosition.left = Math.max(0, Math.min(parseFloat(saved.left), window.innerWidth - cw));
          savedPosition.right = null;
        }
      } catch (e) {}
    }

    // ---------- 初始化 ----------
    function init() {
      if (document.getElementById("codex-usage-panel")) {
        console.warn("[Codex用量] 小部件已存在，跳过注入");
        return;
      }

      loadPosition();
      panel = createPanel();

      const start = () => {
        if (!document.body) { setTimeout(start, 100); return; }
        document.body.appendChild(panel);
        render();
        enableDrag();

        panel.addEventListener("mouseenter", () => {
          if (!isDragging) { isHovered = true; render(); }
        });
        panel.addEventListener("mouseleave", () => {
          if (!isDragging) { isHovered = false; render(); }
        });

        fetchUsage();
        refreshTimer = setInterval(fetchUsage, REFRESH_MS);

        // 主题切换实时跟随
        new MutationObserver(applyTheme).observe(document.documentElement, {
          attributes: true, attributeFilter: ["class", "data-theme"],
        });
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

        // 窗口尺寸变化后重新夹紧位置，避免跑到屏幕外
        window.addEventListener("resize", () => {
          const cw = getMetrics().collapsedWidth;
          savedPosition.top = Math.max(0, Math.min(savedPosition.top, window.innerHeight - 100));
          if (savedPosition.right != null) {
            savedPosition.right = Math.max(0, Math.min(savedPosition.right, window.innerWidth - cw));
          }
          if (savedPosition.left != null) {
            savedPosition.left = Math.max(0, Math.min(savedPosition.left, window.innerWidth - cw));
          }
          render();
        });

        console.log("%c✅ Codex 用量监控已启动", "color:#10b981;font-weight:600;font-size:13px");
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
      } else {
        start();
      }
    }

    function destroy() {
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      if (countdownTimer) clearInterval(countdownTimer);
      if (refreshTimer) clearInterval(refreshTimer);
      panel = null;
      console.log("[Codex用量] 小部件已销毁");
    }

    return { init, destroy, getUsageData: () => usageData };
  })();

  try {
    CodexUsageWidget.init();
  } catch (e) {
    console.error("[Codex用量] 初始化失败:", e);
  }
})();
