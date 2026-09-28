/**
 * OnyxGram Crash («Ракета») - Frontend Engine & Canvas
 */

// --- Инициализация WebApp / Guest ---
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.ready();
}

let userId = 1001;
let userName = "Игрок";

if (tg?.initDataUnsafe?.user) {
  userId = tg.initDataUnsafe.user.id;
  userName = tg.initDataUnsafe.user.first_name || "Космонавт";
  if (tg.initDataUnsafe.user.username) {
    userName = "@" + tg.initDataUnsafe.user.username;
  }
} else {
  // Браузерный тестовый ID
  const savedId = localStorage.getItem("crash_user_id");
  if (savedId) {
    userId = parseInt(savedId, 10);
  } else {
    userId = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem("crash_user_id", userId.toString());
  }
}

let userBalance = 100;
let soundEnabled = true;

// Состояние игры
let gameState = "WAITING"; // WAITING, FLYING, CRASHED
let currentMultiplier = 1.00;
let displayMultiplier = 1.00;
let crashPoint = 0.00;
let countdownRemaining = 5.0;
let myBet = null; // { amount, autoCashout, cashedOut, profit }
let currentRoundId = 0;

// --- Web Audio Синтезатор звуков ---
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (type === "beep") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === "cashout") {
      // Приятный аккорд победы
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.15, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.3);
      });
    } else if (type === "crash") {
      // Глухой взрыв
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === "reel_tick") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    } else if (type === "reel_stop") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === "jackpot") {
      [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0.25, now + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.5);
      });
    }
  } catch (e) {
    console.error("Audio error:", e);
  }
}

function triggerHaptic(type = "impact") {
  if (!tg?.HapticFeedback) return;
  if (type === "impact") tg.HapticFeedback.impactOccurred("medium");
  if (type === "success") tg.HapticFeedback.notificationOccurred("success");
  if (type === "error") tg.HapticFeedback.notificationOccurred("error");
}

// --- DOM элементы ---
const elUserAvatar = document.getElementById("user-avatar");
const elUserName = document.getElementById("user-name");
const elUserBalance = document.getElementById("user-balance");
const elSoundBtn = document.getElementById("sound-btn");
const elHistoryBar = document.getElementById("history-bar");
const elMultiplierDisplay = document.getElementById("multiplier-display");
const elRoundStatus = document.getElementById("round-status");
const elCountdownWrapper = document.getElementById("countdown-wrapper");
const elCountdownText = document.getElementById("countdown-text");
const elBetAmount = document.getElementById("bet-amount");
const elAutoToggle = document.getElementById("auto-cashout-toggle");
const elAutoVal = document.getElementById("auto-cashout-val");
const elMainBtn = document.getElementById("main-action-btn");
const elBtnPrimary = document.getElementById("btn-primary-text");
const elBtnSub = document.getElementById("btn-sub-text");
const elPlayersCount = document.getElementById("players-count");
const elPoolSum = document.getElementById("pool-sum");
const elBetsList = document.getElementById("bets-list");
const elToast = document.getElementById("toast");

// Модалки
const elTopupModal = document.getElementById("topup-modal");
const elWithdrawModal = document.getElementById("withdraw-modal");
const elPaytableModal = document.getElementById("paytable-modal");

document.getElementById("open-topup-btn").onclick = () => elTopupModal.style.display = "flex";
document.getElementById("close-topup-btn").onclick = () => elTopupModal.style.display = "none";
document.getElementById("open-withdraw-btn").onclick = () => elWithdrawModal.style.display = "flex";
document.getElementById("close-withdraw-btn").onclick = () => elWithdrawModal.style.display = "none";

if (document.getElementById("open-paytable-btn")) {
  document.getElementById("open-paytable-btn").onclick = () => elPaytableModal.style.display = "flex";
}
if (document.getElementById("close-paytable-btn")) {
  document.getElementById("close-paytable-btn").onclick = () => elPaytableModal.style.display = "none";
}

// --- НАВИГАЦИЯ МЕЖДУ ИГРАМИ (ЛОББИ / КРАШ / СЛОТЫ / МИНЁР / UPGRADE / БАШНЯ) ---
const elViewLobby = document.getElementById("view-lobby");
const elViewCrash = document.getElementById("view-crash");
const elViewSlots = document.getElementById("view-slots");
const elViewMines = document.getElementById("view-mines");
const elViewUpgrade = document.getElementById("view-upgrade");
const elViewTower = document.getElementById("view-tower");
const elBackLobbyBtn = document.getElementById("back-lobby-btn");

function switchView(viewName) {
  if (elViewLobby) elViewLobby.style.display = viewName === "lobby" ? "flex" : "none";
  if (elViewCrash) elViewCrash.style.display = viewName === "crash" ? "flex" : "none";
  if (elViewSlots) elViewSlots.style.display = viewName === "slots" ? "flex" : "none";
  if (elViewMines) elViewMines.style.display = viewName === "mines" ? "flex" : "none";
  if (elViewUpgrade) elViewUpgrade.style.display = viewName === "upgrade" ? "flex" : "none";
  if (elViewTower) elViewTower.style.display = viewName === "tower" ? "flex" : "none";

  if (viewName === "lobby") {
    if (elBackLobbyBtn) elBackLobbyBtn.style.display = "none";
    if (isAutoBetActive && typeof stopAutoCasino === "function") stopAutoCasino();
    if (slotsAutoActive && typeof stopSlotsAuto === "function") stopSlotsAuto();
  } else {
    if (elBackLobbyBtn) elBackLobbyBtn.style.display = "inline-flex";
    if (viewName === "crash") {
      setTimeout(resizeCanvas, 50);
    } else if (viewName === "mines") {
      initMinesGrid();
    } else if (viewName === "upgrade") {
      initUpgradeWheel();
    } else if (viewName === "tower") {
      initTowerUI();
    }
  }
}

if (document.getElementById("card-play-crash")) {
  document.getElementById("card-play-crash").onclick = () => switchView("crash");
}
if (document.getElementById("card-play-slots")) {
  document.getElementById("card-play-slots").onclick = () => switchView("slots");
}
if (document.getElementById("card-play-mines")) {
  document.getElementById("card-play-mines").onclick = () => switchView("mines");
}
if (document.getElementById("card-play-upgrade")) {
  document.getElementById("card-play-upgrade").onclick = () => switchView("upgrade");
}
if (document.getElementById("card-play-tower")) {
  document.getElementById("card-play-tower").onclick = () => switchView("tower");
}
if (elBackLobbyBtn) {
  elBackLobbyBtn.onclick = () => switchView("lobby");
}

// --- Админ-панель владельца ---
const ADMIN_IDS = [2127001, 289802, 968937];
const urlParams = new URLSearchParams(window.location.search);
const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
if (isLocal && !ADMIN_IDS.includes(Number(userId))) {
  ADMIN_IDS.push(Number(userId));
}
const isAdminUser = ADMIN_IDS.includes(Number(userId)) || urlParams.has("admin") || isLocal;

const elAdminBtn = document.getElementById("open-admin-btn");
const elAdminModal = document.getElementById("admin-modal");
const elCloseAdminBtn = document.getElementById("close-admin-btn");
let adminMinesLiveTimer = null;

if (isAdminUser && elAdminBtn) {
  elAdminBtn.style.display = "block";
}

if (elCloseAdminBtn) {
  elCloseAdminBtn.onclick = () => {
    elAdminModal.style.display = "none";
    if (adminMinesLiveTimer) {
      clearInterval(adminMinesLiveTimer);
      adminMinesLiveTimer = null;
    }
  };
}

if (elAdminBtn) {
  elAdminBtn.onclick = async () => {
    elAdminModal.style.display = "flex";
    await refreshAdminStats();
    await refreshAdminMinesLive();
    // Авто-обновление списка активных игроков в минёре каждые 2.5 сек
    if (!adminMinesLiveTimer) {
      adminMinesLiveTimer = setInterval(refreshAdminMinesLive, 2500);
    }
  };
}

// Переключение вкладок в Админ-панели
document.querySelectorAll(".adm-tab-pill").forEach(pill => {
  pill.onclick = () => {
    document.querySelectorAll(".adm-tab-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    const targetTab = pill.dataset.tab;
    document.querySelectorAll(".adm-tab-pane").forEach(pane => {
      pane.classList.toggle("active", pane.id === targetTab);
    });
  };
});

async function refreshAdminStats() {
  try {
    const res = await fetch(`/api/admin/stats?id=${userId}`).then(r => r.json());
    if (res.ok) {
      const netProfEl = document.getElementById("adm-net-profit");
      if (netProfEl) netProfEl.textContent = `${res.net_profit} ⭐`;
      const usersCntEl = document.getElementById("adm-users-cnt");
      if (usersCntEl) usersCntEl.textContent = res.users_count;
      const crashBetsEl = document.getElementById("adm-crash-bets-cnt");
      if (crashBetsEl) crashBetsEl.textContent = `${res.crash_bets} ⭐`;
      const slotsBetsEl = document.getElementById("adm-slots-bets-cnt");
      if (slotsBetsEl) slotsBetsEl.textContent = `${res.slots_bets} ⭐`;
      const minesBetsEl = document.getElementById("adm-mines-bets-cnt");
      if (minesBetsEl) minesBetsEl.textContent = `${res.mines_bets || 0} ⭐`;
      const towerBetsEl = document.getElementById("adm-tower-bets-cnt");
      if (towerBetsEl) towerBetsEl.textContent = `${res.tower_bets || 0} ⭐`;

      // Режим RTP Crash
      document.querySelectorAll(".seg-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === res.rig_mode);
      });

      // Режим RTP Slots
      document.querySelectorAll(".seg-btn-slots").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === res.slots_rig_mode);
      });

      // Режим RTP Mines
      document.querySelectorAll(".seg-btn-mines").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === res.mines_rig_mode);
      });

      // Режим RTP Upgrade
      document.querySelectorAll(".seg-btn-upgrade").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === res.upgrade_rig_mode);
      });

      // Режим RTP Tower
      document.querySelectorAll(".seg-btn-tower").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === (res.tower_rig_mode || "normal"));
      });

      // Мастер-RTP (если все 5 игр совпадают)
      const masterTag = document.getElementById("adm-master-rtp-tag");
      const upMode = res.upgrade_rig_mode || res.rig_mode;
      const towerMode = res.tower_rig_mode || res.rig_mode;
      if (res.rig_mode === res.slots_rig_mode && res.rig_mode === res.mines_rig_mode && res.rig_mode === upMode && res.rig_mode === towerMode) {
        document.querySelectorAll(".seg-btn-global").forEach(btn => {
          btn.classList.toggle("active", btn.dataset.mode === res.rig_mode);
        });
        if (masterTag) masterTag.textContent = RTP_LABELS[res.rig_mode] || res.rig_mode;
      } else {
        document.querySelectorAll(".seg-btn-global").forEach(btn => btn.classList.remove("active"));
        if (masterTag) masterTag.textContent = "Раздельный";
      }

      // Боты в Crash
      const botBtn = document.getElementById("adm-toggle-bots-btn");
      if (botBtn) {
        botBtn.textContent = res.enable_bots ? "ВКЛ" : "ВЫКЛ";
        botBtn.classList.toggle("off", !res.enable_bots);
      }

      // Боты в чате
      const chatBotBtn = document.getElementById("adm-toggle-chat-bots-btn");
      if (chatBotBtn) {
        const isChatBotsOn = (res.chat_bots_enabled !== false);
        chatBotBtn.textContent = isChatBotsOn ? "ВКЛ" : "ВЫКЛ";
        chatBotBtn.classList.toggle("off", !isChatBotsOn);
      }
    }
  } catch (e) {
    console.error("Admin stats error:", e);
  }
}

// Запрос онлайн игроков в Минёре (Live)
async function refreshAdminMinesLive() {
  try {
    const res = await fetch(`/api/admin/mines/live?id=${userId}`).then(r => r.json());
    if (res.ok) {
      const liveCntEl = document.getElementById("adm-mines-live-count");
      if (liveCntEl) liveCntEl.textContent = res.active_count;

      const listEl = document.getElementById("adm-mines-live-list");
      if (!listEl) return;

      if (!res.players || res.players.length === 0) {
        listEl.innerHTML = `<div class="adm-empty-list">Сейчас никто не играет в минёре</div>`;
        return;
      }

      listEl.innerHTML = "";
      res.players.forEach(p => {
        const card = document.createElement("div");
        card.className = "adm-mine-player-card";
        card.innerHTML = `
          <div class="adm-mp-header">
            <span class="adm-mp-user">👤 ${p.username} <span style="font-size:10px; color:#888;">(ID ${p.user_id})</span></span>
            <span class="adm-mp-bet">${p.bet} ⭐ (${p.mines_count} 💣)</span>
          </div>
          <div class="adm-mp-stats">
            <span>Текущий X: <b class="adm-mp-mult">${p.current_multiplier.toFixed(2)}x</b></span>
            <span>Куш: <b class="adm-mp-profit">${p.potential_win} ⭐</b></span>
            <span>Шаг: <b>${p.steps_cleared} / ${25 - p.mines_count}</b></span>
          </div>
          <div class="adm-mp-actions">
            <button class="adm-mp-btn adm-mp-kill" data-uid="${p.user_id}">💥 Взорвать игрока</button>
            <button class="adm-mp-btn adm-mp-gem" data-uid="${p.user_id}">💎 Дать алмаз</button>
          </div>
        `;

        // Кнопки воздействия на конкретного игрока
        card.querySelector(".adm-mp-kill").onclick = () => adminRigMines(p.user_id, "mine");
        card.querySelector(".adm-mp-gem").onclick = () => adminRigMines(p.user_id, "gem");

        listEl.appendChild(card);
      });
    }
  } catch (e) {
    console.error("Admin mines live error:", e);
  }
}

// Вмешательство в игру игрока
async function adminRigMines(targetUserId, outcome) {
  try {
    const res = await fetch("/api/admin/mines/rig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, target_user_id: targetUserId, outcome: outcome })
    }).then(r => r.json());

    if (res.ok) {
      if (outcome === "mine") {
        showToast(`💥 Игрок ${targetUserId} подорвётся на следующем клике!`);
      } else if (outcome === "gem") {
        showToast(`💎 Игрок ${targetUserId} получит алмаз на следующем клике!`);
      } else {
        showToast("🎲 Сброшено");
      }
    }
  } catch (e) {
    showToast("Ошибка: " + e.message);
  }
}

// Моментальный взрыв прямо сейчас (кнопка в админке)
const elInstantKillBtn = document.getElementById("adm-instant-kill-btn");
if (elInstantKillBtn) {
  elInstantKillBtn.onclick = async () => {
    try {
      const res = await fetch("/api/admin/instant_crash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId })
      }).then(r => r.json());

      if (res.ok) {
        showToast(`💥 Ракета взорвана на ${res.crash_point.toFixed(2)}x!`);
        triggerHaptic("error");
      } else {
        showToast(res.error || "Ракета не в полёте");
      }
    } catch (e) {
      showToast("Ошибка: " + e.message);
    }
  };
}

// Задать краш на следующий раунд
const elSetCrashBtn = document.getElementById("adm-set-crash-btn");
if (elSetCrashBtn) {
  elSetCrashBtn.onclick = async () => {
    const val = parseFloat(document.getElementById("adm-crash-val").value);
    if (isNaN(val) || val < 1.01) {
      showToast("Введите корректное число");
      return;
    }
    const res = await fetch("/api/admin/force_crash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, crash: val })
    }).then(r => r.json());
    if (res.ok) {
      showToast(res.message);
      document.getElementById("adm-crash-val").value = "";
    }
  };
}

document.querySelectorAll(".adm-crash-pill").forEach(pill => {
  pill.onclick = async () => {
    const val = parseFloat(pill.dataset.crash);
    if (isNaN(val)) return;
    const res = await fetch("/api/admin/force_crash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, crash: val })
    }).then(r => r.json());
    if (res.ok) {
      showToast(res.message);
    }
  };
});

// Админ: Принудительный исход в слотах (777, выигрыш, слив, сброс)
document.querySelectorAll(".adm-slot-force-btn").forEach(btn => {
  btn.onclick = async () => {
    const forceType = btn.dataset.force === "reset" ? null : btn.dataset.force;
    const res = await fetch("/api/admin/slots_force", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, force: forceType })
    }).then(r => r.json());
    if (res.ok) {
      if (forceType === "777") {
        showToast("🎰 След. спин: ДЖЕКПОТ 777! 🔥 (100x)");
      } else if (forceType === "win") {
        showToast("💎 След. спин: Выигрыш!");
      } else if (forceType === "loss") {
        showToast("💀 След. спин: Слив!");
      } else {
        showToast("🎲 Принудительный исход слотов сброшен");
      }
    }
  };
});

const RTP_LABELS = {
  "normal": "Честный 96%",
  "greedy": "Жадный 75%",
  "hard_50": "Жесткий 50%",
  "trap_20": "Капкан 20%",
  "super_greedy_5": "💀 Супер-жадный 5%",
  "boost": "🎉 Буст 130%"
};

// Админ: МАСТЕР-RTP (Все игры сразу)
document.querySelectorAll(".seg-btn-global").forEach(btn => {
  btn.onclick = async () => {
    const mode = btn.dataset.mode;
    const res = await fetch("/api/admin/global_rtp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, mode: mode })
    }).then(r => r.json());
    if (res.ok) {
      document.querySelectorAll(".seg-btn-global").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
      document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
      document.querySelectorAll(".seg-btn-slots").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
      document.querySelectorAll(".seg-btn-mines").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
      document.querySelectorAll(".seg-btn-upgrade").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
      document.querySelectorAll(".seg-btn-tower").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
      const masterTag = document.getElementById("adm-master-rtp-tag");
      if (masterTag) masterTag.textContent = RTP_LABELS[mode] || mode;
      showToast(`⚡ RTP всех 5 игр: ${RTP_LABELS[mode] || mode}`);
      triggerHaptic("medium");
    }
  };
});

// Админ: Режим RTP Слотов
document.querySelectorAll(".seg-btn-slots").forEach(btn => {
  btn.onclick = async () => {
    const mode = btn.dataset.mode;
    const res = await fetch("/api/admin/slots_rig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, mode: mode })
    }).then(r => r.json());
    if (res.ok) {
      document.querySelectorAll(".seg-btn-slots").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      showToast(`🎰 RTP слотов: ${RTP_LABELS[mode] || mode}`);
    }
  };
});

// Админ: Глобальное вмешательство в Минёра (для всех игроков)
document.querySelectorAll(".adm-mines-force-btn").forEach(btn => {
  btn.onclick = async () => {
    const forceType = btn.dataset.force === "reset" ? null : btn.dataset.force;
    const res = await fetch("/api/admin/mines/rig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, target_user_id: "all", outcome: forceType })
    }).then(r => r.json());
    if (res.ok) {
      if (forceType === "mine") {
        showToast("💥 ВСЕ игроки в минёре подорвутся на следующем клике!");
      } else if (forceType === "gem") {
        showToast("💎 ВСЕ игроки в минёре получат алмаз на следующем клике!");
      } else {
        showToast("🎲 Вмешательство в минёр сброшено");
      }
    }
  };
});

// Админ: Режим RTP Минёра
document.querySelectorAll(".seg-btn-mines").forEach(btn => {
  btn.onclick = async () => {
    const mode = btn.dataset.mode;
    const res = await fetch("/api/admin/mines/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, mode: mode })
    }).then(r => r.json());
    if (res.ok) {
      document.querySelectorAll(".seg-btn-mines").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      showToast(`💣 RTP минёра: ${RTP_LABELS[mode] || mode}`);
    }
  };
});

// Админ: Режим RTP Crash («Ракета»)
document.querySelectorAll(".seg-btn").forEach(btn => {
  btn.onclick = async () => {
    const mode = btn.dataset.mode;
    const res = await fetch("/api/admin/rig_mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, mode: mode })
    }).then(r => r.json());
    if (res.ok) {
      document.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      showToast(`🚀 RTP ракеты: ${RTP_LABELS[mode] || mode}`);
    }
  };
});

// Админ: Режим RTP Upgrade (Апгрейд)
document.querySelectorAll(".seg-btn-upgrade").forEach(btn => {
  btn.onclick = async () => {
    const mode = btn.dataset.mode;
    const res = await fetch("/api/admin/upgrade/rig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, mode: mode })
    }).then(r => r.json());
    if (res.ok) {
      document.querySelectorAll(".seg-btn-upgrade").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      showToast(`⚡ RTP апгрейда: ${RTP_LABELS[mode] || mode}`);
      if (typeof updateUpgradeUI === "function") updateUpgradeUI();
    }
  };
});

// Админ: Принудительный исход Апгрейда (Win / Loss / Reset)
document.querySelectorAll(".adm-up-force-btn").forEach(btn => {
  btn.onclick = async () => {
    const forceType = btn.dataset.force === "reset" ? null : btn.dataset.force;
    const res = await fetch("/api/admin/upgrade/force", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, force: forceType })
    }).then(r => r.json());
    if (res.ok) {
      if (forceType === "win") {
        showToast("💎 След. апгрейд: 100% УСПЕХ (Win)!");
      } else if (forceType === "loss") {
        showToast("💀 След. апгрейд: 100% СЛИВ (Loss)!");
      } else {
        showToast("🎲 Принудительный исход апгрейда сброшен");
      }
    }
  };
});

// Админ: Режим RTP Башни (Tower)
document.querySelectorAll(".seg-btn-tower").forEach(btn => {
  btn.onclick = async () => {
    const mode = btn.dataset.mode;
    const res = await fetch("/api/admin/tower/rig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, mode: mode })
    }).then(r => r.json());
    if (res.ok) {
      document.querySelectorAll(".seg-btn-tower").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      showToast(`🏰 RTP башни: ${RTP_LABELS[mode] || mode}`);
    }
  };
});

// Админ: Принудительный исход Башни (Safe / Trap / Reset)
document.querySelectorAll(".adm-tower-force-btn").forEach(btn => {
  btn.onclick = async () => {
    const forceType = btn.dataset.force === "reset" ? null : btn.dataset.force;
    const res = await fetch("/api/admin/tower/force", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, force: forceType })
    }).then(r => r.json());
    if (res.ok) {
      if (forceType === "safe") {
        showToast("💎 След. шаг в Башне: 100% Алмаз (Безопасно)!");
      } else if (forceType === "trap") {
        showToast("💀 След. шаг в Башне: 100% Ловушка (Слив)!");
      } else {
        showToast("🎲 Принудительный исход башни сброшен");
      }
    }
  };
});

// Тумблер ботов в Crash
document.getElementById("adm-toggle-bots-btn").onclick = async () => {
  const btn = document.getElementById("adm-toggle-bots-btn");
  const willEnable = btn.textContent === "ВЫКЛ";
  const res = await fetch("/api/admin/toggle_bots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: userId, enabled: willEnable })
  }).then(r => r.json());
  if (res.ok) {
    btn.textContent = res.enable_bots ? "ВКЛ" : "ВЫКЛ";
    btn.classList.toggle("off", !res.enable_bots);
    showToast(`Боты в Crash: ${res.enable_bots ? "ВКЛ" : "ВЫКЛ"}`);
  }
};

// Тумблер ботов в Чате
const elChatBotBtn = document.getElementById("adm-toggle-chat-bots-btn");
if (elChatBotBtn) {
  elChatBotBtn.onclick = async () => {
    const willEnable = elChatBotBtn.textContent === "ВЫКЛ";
    const res = await fetch("/api/admin/chat/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, enabled: willEnable })
    }).then(r => r.json());
    if (res.ok) {
      elChatBotBtn.textContent = res.chat_bots_enabled ? "ВКЛ" : "ВЫКЛ";
      elChatBotBtn.classList.toggle("off", !res.chat_bots_enabled);
      showToast(`Боты в чате: ${res.chat_bots_enabled ? "ВКЛ" : "ВЫКЛ"}`);
    }
  };
}

// Выдача звёзд себе (Владельцу)
async function adminAddStarsToSelf(amount) {
  if (isNaN(amount) || amount <= 0) {
    showToast("Введите корректную сумму");
    return;
  }
  showToast(`Начисляем ${amount} ⭐...`);
  try {
    const res = await fetch("/api/admin/set_balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_id: userId,
        target_id: userId,
        amount: amount
      })
    }).then(r => r.json());

    if (res.ok) {
      userBalance = res.balance;
      elUserBalance.textContent = userBalance;
      showToast(`✅ Начислено +${amount} ⭐! Баланс: ${userBalance} ⭐`);
      triggerHaptic("success");
      playSound("cashout");
    } else {
      showToast(res.error || "Ошибка начисления");
    }
  } catch (e) {
    showToast("Ошибка: " + e.message);
  }
}

document.querySelectorAll(".adm-add-stars-btn").forEach(btn => {
  btn.onclick = () => {
    const amt = parseInt(btn.dataset.amt, 10);
    adminAddStarsToSelf(amt);
  };
});

const elCustomStarsBtn = document.getElementById("adm-add-custom-stars-btn");
const elCustomStarsInput = document.getElementById("adm-custom-stars-amt");
if (elCustomStarsBtn && elCustomStarsInput) {
  elCustomStarsBtn.onclick = () => {
    const amt = parseInt(elCustomStarsInput.value, 10);
    adminAddStarsToSelf(amt);
    elCustomStarsInput.value = "";
  };
}

elSoundBtn.onclick = () => {
  soundEnabled = !soundEnabled;
  elSoundBtn.textContent = soundEnabled ? "🔊" : "🔇";
};

function showToast(msg) {
  elToast.textContent = msg;
  elToast.classList.add("show");
  setTimeout(() => elToast.classList.remove("show"), 2500);
}

// --- WebSocket Соединение ---
let socket = null;

function connectWS() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log("WebSocket connected");
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (e) {
      console.error(e);
    }
  };

  socket.onclose = () => {
    setTimeout(connectWS, 1500);
  };
}

function handleServerMessage(data) {
  if (data.type === "init") {
    gameState = data.state;
    currentMultiplier = data.multiplier;
    renderHistory(data.history);
    renderBets(data.bets);
  } else if (data.type === "tick_waiting") {
    gameState = "WAITING";
    if (data.round_id && data.round_id !== currentRoundId) {
      currentRoundId = data.round_id;
      myBet = null; // Очищаем ставку прошлого раунда для нового раунда
      if (typeof isAutoBetActive !== "undefined" && isAutoBetActive) {
        executeAutoBet();
      }
    }
    countdownRemaining = data.remaining;
    renderBets(data.bets);
    updateUI();
  } else if (data.type === "round_start") {
    gameState = "FLYING";
    currentMultiplier = 1.00;
    displayMultiplier = 1.00;
    renderBets(data.bets);
    playSound("beep");
    triggerHaptic("impact");
    updateUI();
  } else if (data.type === "tick_flying") {
    gameState = "FLYING";
    currentMultiplier = data.multiplier;
    renderBets(data.bets);
    updateUI();
  } else if (data.type === "round_crashed") {
    gameState = "CRASHED";
    crashPoint = data.crash_point;
    currentMultiplier = data.crash_point;
    displayMultiplier = data.crash_point;
    renderHistory(data.history);
    renderBets(data.bets);
    playSound("crash");
    triggerHaptic("error");
    addExplosion(rocketX, rocketY);
    screenShake = 18;
    updateUI();
  } else if (data.type === "bet_response") {
    if (data.ok) {
      userBalance = data.balance;
      elUserBalance.textContent = userBalance;
      showToast("Ставка принята! 🚀");
      triggerHaptic("impact");
    } else {
      showToast(data.error || "Ошибка ставки");
      myBet = null;
      updateUI();
    }
  } else if (data.type === "cashout_response") {
    if (data.ok) {
      if (myBet) {
        myBet.cashedOut = true;
        myBet.profit = data.profit;
      }
      if (typeof data.balance === "number") {
        userBalance = data.balance;
        elUserBalance.textContent = userBalance;
      }
      showToast(`Выигрыш: +${data.profit} ⭐ (${data.multiplier}x)`);
      playSound("cashout");
      triggerHaptic("success");
      updateUI();
    } else {
      showToast(data.error || "Не удалось забрать");
    }
  } else if (data.type === "player_cashout") {
    if (data.user_id === userId) {
      if (myBet) {
        myBet.cashedOut = true;
        myBet.profit = data.profit;
      }
      if (typeof data.balance === "number") {
        userBalance = data.balance;
        elUserBalance.textContent = userBalance;
      }
      updateUI();
    }
  }
}

// --- Управление ставками ---
elAutoToggle.onchange = () => {
  elAutoVal.disabled = !elAutoToggle.checked;
};

document.querySelectorAll(".auto-preset").forEach(btn => {
  btn.onclick = () => {
    elAutoToggle.checked = true;
    elAutoVal.disabled = false;
    elAutoVal.value = btn.dataset.mult;
  };
});

document.querySelectorAll(".chip-btn").forEach(btn => {
  btn.onclick = () => {
    let cur = parseInt(elBetAmount.value, 10) || 10;
    const val = btn.dataset.val;
    if (val === "max") {
      elBetAmount.value = userBalance;
    } else {
      elBetAmount.value = cur + parseInt(val, 10);
    }
  };
});

document.querySelectorAll(".adj-btn").forEach(btn => {
  btn.onclick = () => {
    const act = btn.dataset.action;
    let cur = parseInt(elBetAmount.value, 10) || 10;
    if (act === "div2") elBetAmount.value = Math.max(1, Math.floor(cur / 2));
    if (act === "mul2") elBetAmount.value = cur * 2;
  };
});

// Клик по главной кнопке (с защитой от двойного срабатывания)
let lastActionTime = 0;
function handleMainAction(e) {
  if (e) {
    e.preventDefault();
  }
  const now = Date.now();
  if (now - lastActionTime < 150) return; // дебаунс 150мс
  lastActionTime = now;

  if (gameState === "WAITING") {
    if (!myBet) {
      // Сделать ставку
      const amt = parseInt(elBetAmount.value, 10);
      if (isNaN(amt) || amt <= 0 || amt > userBalance) {
        showToast("Недостаточно звёзд на балансе!");
        return;
      }
      const autoCash = elAutoToggle.checked ? parseFloat(elAutoVal.value) : null;
      myBet = { amount: amt, autoCashout: autoCash, cashedOut: false, profit: 0 };
      socket.send(JSON.stringify({
        action: "bet",
        user_id: userId,
        username: userName,
        amount: amt,
        auto_cashout: autoCash
      }));
      updateUI();
    }
  } else if (gameState === "FLYING") {
    if (myBet && !myBet.cashedOut) {
      // Забрать кэшаут
      socket.send(JSON.stringify({
        action: "cashout",
        user_id: userId
      }));
    }
  }
}

elMainBtn.addEventListener("click", handleMainAction);

// --- АВТО-КАЗИК (АВТОМАТИЧЕСКАЯ ИГРА) ---
let isAutoBetActive = false;
let autoBetAmount = 10;
let autoTargetCashout = 2.00;
let autoRoundsTotal = Infinity;
let autoRoundsPlayed = 0;

// Переключение вкладок: Ручная / Авто-казик
const elTabManual = document.getElementById("tab-manual");
const elTabAuto = document.getElementById("tab-auto");
const elManualControls = document.getElementById("manual-controls");
const elAutoControls = document.getElementById("auto-controls");

if (elTabManual && elTabAuto) {
  elTabManual.onclick = () => {
    elTabManual.classList.add("active");
    elTabAuto.classList.remove("active");
    elManualControls.style.display = "block";
    elAutoControls.style.display = "none";
  };

  elTabAuto.onclick = () => {
    elTabAuto.classList.add("active");
    elTabManual.classList.remove("active");
    elAutoControls.style.display = "flex";
    elManualControls.style.display = "none";
  };
}

// Настройки раундов
document.querySelectorAll(".rounds-chip").forEach(chip => {
  chip.onclick = () => {
    document.querySelectorAll(".rounds-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    const r = chip.dataset.rounds;
    autoRoundsTotal = r === "inf" ? Infinity : parseInt(r, 10);
    updateAutoUI();
  };
});

// Кнопки авто-ставки
const elAutoBetAmount = document.getElementById("auto-bet-amount");
const elAutoTargetCashout = document.getElementById("auto-target-cashout");
const elAutoActionBtn = document.getElementById("auto-action-btn");
const elAutoBtnPrimary = document.getElementById("auto-btn-primary");
const elAutoBtnSub = document.getElementById("auto-btn-sub");

document.querySelectorAll(".auto-bet-chip").forEach(btn => {
  btn.onclick = () => {
    let cur = parseInt(elAutoBetAmount.value, 10) || 10;
    elAutoBetAmount.value = cur + parseInt(btn.dataset.val, 10);
    updateAutoUI();
  };
});

document.querySelectorAll("[data-auto-action]").forEach(btn => {
  btn.onclick = () => {
    let cur = parseInt(elAutoBetAmount.value, 10) || 10;
    const act = btn.dataset.autoAction;
    if (act === "div2") elAutoBetAmount.value = Math.max(1, Math.floor(cur / 2));
    if (act === "mul2") elAutoBetAmount.value = cur * 2;
    updateAutoUI();
  };
});

document.querySelectorAll(".auto-mult-chip").forEach(btn => {
  btn.onclick = () => {
    elAutoTargetCashout.value = btn.dataset.mult;
    updateAutoUI();
  };
});

if (elAutoBetAmount && elAutoTargetCashout) {
  elAutoBetAmount.oninput = updateAutoUI;
  elAutoTargetCashout.oninput = updateAutoUI;
}

function updateAutoUI() {
  if (!elAutoActionBtn) return;
  if (isAutoBetActive) {
    elAutoActionBtn.className = "auto-action-btn state-auto-running";
    const totalStr = autoRoundsTotal === Infinity ? "∞" : autoRoundsTotal;
    elAutoBtnPrimary.textContent = `⏹️ ОСТАНОВИТЬ АВТО-КАЗИК`;
    elAutoBtnSub.textContent = `Сыграно: ${autoRoundsPlayed} / ${totalStr} | Ставка: ${autoBetAmount} ⭐ на ${autoTargetCashout.toFixed(2)}x`;
  } else {
    const amt = parseInt(elAutoBetAmount.value, 10) || 10;
    const mult = parseFloat(elAutoTargetCashout.value) || 2.0;
    elAutoActionBtn.className = "auto-action-btn state-auto-start";
    elAutoBtnPrimary.textContent = `▶️ ЗАПУСТИТЬ АВТО-КАЗИК`;
    elAutoBtnSub.textContent = `Ставить ${amt} ⭐ каждый раунд (забирать на ${mult.toFixed(2)}x)`;
  }
}

function startAutoBet() {
  const amt = parseInt(elAutoBetAmount.value, 10);
  const mult = parseFloat(elAutoTargetCashout.value);

  if (isNaN(amt) || amt <= 0) {
    showToast("Введите корректную сумму ставки");
    return;
  }
  if (amt > userBalance) {
    showToast("Недостаточно звёзд на балансе!");
    return;
  }
  if (isNaN(mult) || mult < 1.05) {
    showToast("Минимальный авто-вывод 1.05x");
    return;
  }

  autoBetAmount = amt;
  autoTargetCashout = mult;
  autoRoundsPlayed = 0;
  isAutoBetActive = true;
  triggerHaptic("impact");
  showToast("🤖 Авто-казик активирован! Ставки ставятся автоматически.");
  updateAutoUI();

  // Если раунд уже ожидает ставок — ставим сразу
  if (gameState === "WAITING" && !myBet) {
    executeAutoBet();
  }
}

function stopAutoBet(reason) {
  if (!isAutoBetActive) return;
  isAutoBetActive = false;
  updateAutoUI();
  triggerHaptic("error");
  if (reason) showToast(reason);
}

function executeAutoBet() {
  if (!isAutoBetActive) return;

  if (autoRoundsTotal !== Infinity && autoRoundsPlayed >= autoRoundsTotal) {
    stopAutoBet(`🏁 Завершено ${autoRoundsPlayed} раундов авто-игры!`);
    return;
  }

  if (userBalance < autoBetAmount) {
    stopAutoBet("⚠️ Авто-казик остановлен: не хватает звёзд на балансе!");
    return;
  }

  autoRoundsPlayed++;
  myBet = {
    amount: autoBetAmount,
    autoCashout: autoTargetCashout,
    cashedOut: false,
    profit: 0
  };

  socket.send(JSON.stringify({
    action: "bet",
    user_id: userId,
    username: userName,
    amount: autoBetAmount,
    auto_cashout: autoTargetCashout
  }));

  showToast(`🤖 Авто-ставка #${autoRoundsPlayed}: ${autoBetAmount} ⭐ на ${autoTargetCashout.toFixed(2)}x`);
  updateUI();
  updateAutoUI();
}

if (elAutoActionBtn) {
  elAutoActionBtn.onclick = () => {
    if (isAutoBetActive) {
      stopAutoBet("Авто-казик остановлен");
    } else {
      startAutoBet();
    }
  };
}

// --- Обновление интерфейса (UI) БЕЗ innerHTML ---
function updateUI() {
  if (gameState === "WAITING") {
    elRoundStatus.textContent = "ДО ВЗЛЁТА";
    elMultiplierDisplay.style.display = "none";
    elMultiplierDisplay.classList.remove("multiplier-crashed");
    elCountdownWrapper.style.display = "block";
    elCountdownText.textContent = `${countdownRemaining.toFixed(1)}s`;

    if (myBet) {
      elMainBtn.className = "main-action-btn state-bet-placed";
      elBtnPrimary.textContent = "СТАВКА ПРИНЯТА";
      elBtnSub.textContent = `${myBet.amount} ⭐ (ждём взлёт)`;
    } else {
      elMainBtn.className = "main-action-btn state-ready";
      const amt = parseInt(elBetAmount.value, 10) || 10;
      elBtnPrimary.textContent = "СДЕЛАТЬ СТАВКУ";
      elBtnSub.textContent = `${amt} ⭐`;
    }
  } else if (gameState === "FLYING") {
    elRoundStatus.textContent = "РАКЕТА В ПОЛЁТЕ";
    elCountdownWrapper.style.display = "none";
    elMultiplierDisplay.style.display = "block";
    elMultiplierDisplay.classList.remove("multiplier-crashed");
    elMultiplierDisplay.textContent = `${currentMultiplier.toFixed(2)}x`;

    if (myBet) {
      if (myBet.cashedOut) {
        elMainBtn.className = "main-action-btn state-cashed";
        elBtnPrimary.textContent = `ВЫИГРАНО +${myBet.profit} ⭐`;
        elBtnSub.textContent = "Куш забран!";
      } else {
        const potentialProfit = Math.floor(myBet.amount * currentMultiplier);
        elMainBtn.className = "main-action-btn state-cashout";
        elBtnPrimary.textContent = "ЗАБРАТЬ";
        elBtnSub.textContent = `${potentialProfit} ⭐ (${currentMultiplier.toFixed(2)}x)`;
      }
    } else {
      elMainBtn.className = "main-action-btn state-disabled";
      elBtnPrimary.textContent = "РАУНД ИДЁТ...";
      elBtnSub.textContent = "Ожидайте след. раунда";
    }
  } else if (gameState === "CRASHED") {
    elRoundStatus.textContent = "ВЗРЫВ!";
    elCountdownWrapper.style.display = "none";
    elMultiplierDisplay.style.display = "block";
    elMultiplierDisplay.classList.add("multiplier-crashed");
    elMultiplierDisplay.textContent = `@ ${crashPoint.toFixed(2)}x`;

    if (myBet && !myBet.cashedOut) {
      elMainBtn.className = "main-action-btn state-disabled";
      elBtnPrimary.textContent = "СТАВКА СГОРЕЛА";
      elBtnSub.textContent = `-${myBet.amount} ⭐`;
    } else if (!myBet) {
      elMainBtn.className = "main-action-btn state-disabled";
      elBtnPrimary.textContent = "РАУНД ОКОНЧЕН";
      elBtnSub.textContent = "Готовимся к новому взлёту";
    }
    // Сброс ставки для следующего раунда
    setTimeout(() => {
      myBet = null;
    }, 2000);
  }
}

function renderHistory(history) {
  if (!history) return;
  elHistoryBar.innerHTML = "";
  history.slice(-10).reverse().forEach(mult => {
    const pill = document.createElement("div");
    let cls = "badge-low";
    if (mult >= 2.0) cls = "badge-mid";
    if (mult >= 10.0) cls = "badge-high";
    pill.className = `badge-pill ${cls}`;
    pill.textContent = `${mult.toFixed(2)}x`;
    elHistoryBar.appendChild(pill);
  });
}

function renderBets(bets) {
  if (!bets) return;
  elPlayersCount.textContent = bets.length;
  const totalPool = bets.reduce((acc, b) => acc + b.amount, 0);
  elPoolSum.textContent = totalPool;

  elBetsList.innerHTML = "";
  bets.forEach(b => {
    const row = document.createElement("div");
    row.className = "bet-row";
    
    let statusText = `${b.amount} ⭐`;
    let statusCls = "";
    if (b.cashed_out) {
      statusText = `+${b.profit} ⭐ (${b.cashout_mult}x)`;
      statusCls = "bet-status-won";
    } else if (gameState === "CRASHED") {
      statusText = `-${b.amount} ⭐`;
      statusCls = "bet-status-crash";
    }

    row.innerHTML = `
      <span class="bet-row-user">${b.username}</span>
      <span class="bet-row-amt ${statusCls}">${statusText}</span>
    `;
    elBetsList.appendChild(row);
  });
}

// --- Пополнение реальными Stars через Инвойс ---
document.querySelectorAll(".real-topup-btn").forEach(btn => {
  btn.onclick = async () => {
    const stars = parseInt(btn.dataset.stars, 10);
    showToast("Формируем счёт на оплату... ⏳");
    
    try {
      const res = await fetch("/api/create_invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, amount: stars })
      }).then(r => r.json());

      if (!res.ok) {
        showToast(res.error || "Ошибка создания инвойса");
        return;
      }

      if (res.type === "link" && window.Telegram?.WebApp?.openInvoice) {
        // Нативное окно оплаты Stars прямо в WebApp
        window.Telegram.WebApp.openInvoice(res.invoice_link, async (status) => {
          if (status === "paid") {
            try {
              const u = await fetch("/api/topup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: userId, amount: stars })
              }).then(r => r.json());
              if (u.ok) {
                userBalance = u.balance;
                elUserBalance.textContent = userBalance;
              }
            } catch (err) {}
            showToast(`✅ Оплата прошла успешно! +${stars} ⭐`);
            triggerHaptic("success");
            playSound("cashout");
            elTopupModal.style.display = "none";
          } else if (status === "cancelled") {
            showToast("Оплата отменена");
          } else if (status === "failed") {
            showToast("Не удалось провести платёж");
          }
        });
      } else {
        if (res.balance !== undefined) {
          userBalance = res.balance;
          elUserBalance.textContent = userBalance;
          triggerHaptic("success");
          playSound("cashout");
        }
        // Если открыто в обычном браузере или инвойс отправлен в чат бота
        showToast(res.message || `Счёт на ${stars} ⭐ отправлен в чат!`);
        elTopupModal.style.display = "none";
      }
    } catch (e) {
      showToast("Ошибка соединения: " + e.message);
    }
  };
});

document.querySelectorAll(".gift-card").forEach(card => {
  card.querySelector(".gift-buy-btn").onclick = async () => {
    const cost = parseInt(card.dataset.cost, 10);
    const giftName = card.dataset.name;
    const giftId = card.dataset.giftId;

    if (userBalance < cost) {
      showToast(`Недостаточно звёзд! Нужно ${cost} ⭐, у вас ${userBalance} ⭐`);
      return;
    }

    showToast("Отправляем подарок в профиль OnyxGram... 🎁");
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, gift: giftName, cost: cost, gift_id: giftId })
      }).then(r => r.json());

      if (res.ok) {
        userBalance = res.balance;
        elUserBalance.textContent = userBalance;
        showToast(res.message);
        triggerHaptic("success");
        playSound("cashout");
        elWithdrawModal.style.display = "none";
      } else {
        showToast(res.error || "Ошибка вывода");
      }
    } catch (e) {
      showToast("Ошибка запроса: " + e.message);
    }
  };
});

// --- CANVAS 60 FPS РАКЕТА & ГРАФИКА ---
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

let canvasWidth = 0;
let canvasHeight = 0;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  canvasWidth = rect.width;
  canvasHeight = rect.height;
}
window.addEventListener("resize", resizeCanvas);
setTimeout(resizeCanvas, 50);

// Звёздное поле (Parallax Stars)
const stars = [];
for (let i = 0; i < 70; i++) {
  stars.push({
    x: Math.random() * 800,
    y: Math.random() * 400,
    size: Math.random() * 2 + 0.8,
    speed: Math.random() * 0.4 + 0.2,
    alpha: Math.random() * 0.7 + 0.3
  });
}

// Частицы взрыва и дыма
const particles = [];
let screenShake = 0;
let rocketX = 60;
let rocketY = 200;

function addExplosion(x, y) {
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 6 + 2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: Math.random() * 5 + 3,
      color: Math.random() > 0.5 ? "#ff3366" : "#ffd166",
      alpha: 1.0,
      life: 1.0
    });
  }
}

function addThrusterParticles(x, y, angle) {
  for (let i = 0; i < 3; i++) {
    const spread = (Math.random() - 0.5) * 0.6;
    const speed = Math.random() * 4 + 2;
    particles.push({
      x: x - Math.cos(angle) * 15,
      y: y - Math.sin(angle) * 15,
      vx: -Math.cos(angle + spread) * speed,
      vy: -Math.sin(angle + spread) * speed,
      size: Math.random() * 4 + 2,
      color: Math.random() > 0.4 ? "#00f2fe" : "#ec4899",
      alpha: 0.9,
      life: 0.5
    });
  }
}

// Главный цикл отрисовки
function renderLoop() {
  ctx.save();
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Тряска экрана при взрыве
  if (screenShake > 0) {
    const shakeX = (Math.random() - 0.5) * screenShake;
    const shakeY = (Math.random() - 0.5) * screenShake;
    ctx.translate(shakeX, shakeY);
    screenShake *= 0.85;
    if (screenShake < 0.5) screenShake = 0;
  }

  // Фон: движение звёзд
  const starSpeedMultiplier = gameState === "FLYING" ? Math.min(6, currentMultiplier * 0.8) : 1;
  stars.forEach(st => {
    st.x -= st.speed * starSpeedMultiplier;
    st.y += st.speed * 0.3 * starSpeedMultiplier;
    if (st.x < 0) st.x = canvasWidth;
    if (st.y > canvasHeight) st.y = 0;

    ctx.fillStyle = `rgba(255, 255, 255, ${st.alpha})`;
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.size, 0, Math.PI * 2);
    ctx.fill();
  });

  // Расчёт позиции ракеты
  const startX = 40;
  const startY = canvasHeight - 35;
  const targetX = canvasWidth - 55;
  const targetY = 55;

  if (gameState === "WAITING") {
    rocketX = startX;
    rocketY = startY;
  } else if (gameState === "FLYING") {
    // Прогресс взлёта
    const progress = Math.min(1.0, Math.log(currentMultiplier) / Math.log(20));
    rocketX = startX + (targetX - startX) * progress;
    rocketY = startY - (startY - targetY) * Math.pow(progress, 0.8);

    // Добавляем пламя
    const trajectoryAngle = Math.atan2(targetY - startY, targetX - startX);
    addThrusterParticles(rocketX, rocketY, trajectoryAngle);
  }

  // Отрисовка траектории (неоновый след)
  if (gameState === "FLYING" || gameState === "CRASHED") {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo((startX + rocketX) / 2, startY, rocketX, rocketY);
    ctx.strokeStyle = "#00f2fe";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#00f2fe";
    ctx.shadowBlur = 12;
    ctx.stroke();

    // Заполнение под кривой
    ctx.lineTo(rocketX, startY);
    ctx.lineTo(startX, startY);
    const grad = ctx.createLinearGradient(0, targetY, 0, startY);
    grad.addColorStop(0, "rgba(0, 242, 254, 0.2)");
    grad.addColorStop(1, "rgba(0, 242, 254, 0.0)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  // Отрисовка частиц
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 0.03;
    if (p.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  // Отрисовка самой РАКЕТЫ
  if (gameState !== "CRASHED") {
    ctx.save();
    ctx.translate(rocketX, rocketY);
    const angle = gameState === "FLYING" ? -0.55 : -0.3;
    ctx.rotate(angle);

    // Корпус ракеты (Векторный дизайн)
    ctx.shadowColor = "#00f2fe";
    ctx.shadowBlur = 10;
    
    // Нос и тело
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -8);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();

    // Крылья
    ctx.fillStyle = "#ec4899";
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(-16, -14);
    ctx.lineTo(-10, -3);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.lineTo(-16, 14);
    ctx.lineTo(-10, 3);
    ctx.closePath();
    ctx.fill();

    // Иллюминатор
    ctx.fillStyle = "#00f2fe";
    ctx.beginPath();
    ctx.arc(2, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
  requestAnimationFrame(renderLoop);
}

// ==================== СЛОТЫ 777 (ИГРОВОЙ АВТОМАТ) ====================
const SYMBOLS_SLOTS = ["🍒", "🍋", "🍇", "🔔", "💎", "⭐", "7️⃣"];

let slotsIsSpinning = false;
let slotsAutoActive = false;
let slotsAutoRounds = 10;
let slotsAutoRemaining = 0;

const elSlotsBet = document.getElementById("slots-bet-amount");
const elSlotsSpinBtn = document.getElementById("slots-spin-btn");
const elSlotsSpinText = document.getElementById("slots-spin-text");
const elSlotsWinDisplay = document.getElementById("slots-win-display");
const elSlotsWinTitle = document.getElementById("slots-win-title");
const elSlotsWinAmount = document.getElementById("slots-win-amount");
const reelsContainer = document.getElementById("reels-container");

const reelBox0 = document.getElementById("reel-box-0");
const reelBox1 = document.getElementById("reel-box-1");
const reelBox2 = document.getElementById("reel-box-2");
const reelStrip0 = document.getElementById("reel-strip-0");
const reelStrip1 = document.getElementById("reel-strip-1");
const reelStrip2 = document.getElementById("reel-strip-2");

// Кнопки быстрой регулировки ставки слотов
if (document.getElementById("slots-btn-div2")) {
  document.getElementById("slots-btn-div2").onclick = () => {
    let cur = parseInt(elSlotsBet.value, 10) || 10;
    elSlotsBet.value = Math.max(1, Math.floor(cur / 2));
  };
}
if (document.getElementById("slots-btn-mul2")) {
  document.getElementById("slots-btn-mul2").onclick = () => {
    let cur = parseInt(elSlotsBet.value, 10) || 10;
    elSlotsBet.value = cur * 2;
  };
}
if (document.getElementById("slots-btn-max")) {
  document.getElementById("slots-btn-max").onclick = () => {
    elSlotsBet.value = Math.max(1, userBalance);
  };
}

document.querySelectorAll(".slots-chip").forEach(chip => {
  chip.onclick = () => {
    elSlotsBet.value = chip.dataset.amt;
  };
});

// Кнопка спина
if (elSlotsSpinBtn) {
  elSlotsSpinBtn.onclick = () => {
    if (!slotsIsSpinning) {
      if (slotsAutoActive) stopSlotsAuto();
      spinSlots();
    }
  };
}

// Авто-спины
document.querySelectorAll(".auto-spin-chip").forEach(chip => {
  chip.onclick = () => {
    const spins = chip.dataset.spins;
    if (slotsAutoActive && chip.classList.contains("active")) {
      stopSlotsAuto("Авто-спины остановлены");
      return;
    }
    document.querySelectorAll(".auto-spin-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    startSlotsAuto(spins === "infinity" ? Infinity : parseInt(spins, 10));
  };
});

function startSlotsAuto(rounds) {
  slotsAutoActive = true;
  slotsAutoRemaining = rounds;
  showToast(`🤖 Запущены авто-спины (${rounds === Infinity ? "∞" : rounds})`);
  updateSlotsAutoUI();
  if (!slotsIsSpinning) {
    spinSlots();
  }
}

function stopSlotsAuto(reason) {
  slotsAutoActive = false;
  slotsAutoRemaining = 0;
  document.querySelectorAll(".auto-spin-chip").forEach(c => c.classList.remove("active"));
  updateSlotsAutoUI();
  if (reason) showToast(reason);
}

function updateSlotsAutoUI() {
  if (!slotsAutoActive) {
    if (elSlotsSpinText && !slotsIsSpinning) elSlotsSpinText.textContent = "КРУТИТЬ (SPIN)";
  } else {
    const remStr = slotsAutoRemaining === Infinity ? "∞" : slotsAutoRemaining;
    if (elSlotsSpinText) elSlotsSpinText.textContent = `АВТО (${remStr}) ⏹`;
  }
}

async function spinSlots() {
  if (slotsIsSpinning) return;
  const bet = parseInt(elSlotsBet.value, 10);
  if (isNaN(bet) || bet <= 0) {
    showToast("Введите корректную ставку");
    if (slotsAutoActive) stopSlotsAuto();
    return;
  }
  if (userBalance < bet) {
    showToast("Недостаточно звёзд на балансе!");
    if (slotsAutoActive) stopSlotsAuto("Недостаточно звёзд");
    return;
  }

  slotsIsSpinning = true;
  elSlotsSpinBtn.disabled = true;
  if (!slotsAutoActive) elSlotsSpinText.textContent = "КРУТИМ...";
  if (elSlotsWinAmount) elSlotsWinAmount.style.display = "none";
  if (elSlotsWinTitle) elSlotsWinTitle.textContent = "Крутим барабаны...";

  [reelBox0, reelBox1, reelBox2].forEach(b => {
    if (b) b.classList.remove("won");
  });
  if (reelsContainer) reelsContainer.classList.remove("win-pulse");

  [reelBox0, reelBox1, reelBox2].forEach(b => {
    if (b) b.classList.add("spinning");
  });

  const tickInterval = setInterval(() => {
    if (slotsIsSpinning) playSound("reel_tick");
  }, 120);

  // Флаги активных вращающихся барабанов
  const isReelSpinning = [true, true, true];

  const spinInterval = setInterval(() => {
    [reelStrip0, reelStrip1, reelStrip2].forEach((strip, idx) => {
      if (isReelSpinning[idx] && strip && strip.children.length >= 3) {
        strip.children[0].textContent = SYMBOLS_SLOTS[Math.floor(Math.random() * SYMBOLS_SLOTS.length)];
        strip.children[1].textContent = SYMBOLS_SLOTS[Math.floor(Math.random() * SYMBOLS_SLOTS.length)];
        strip.children[2].textContent = SYMBOLS_SLOTS[Math.floor(Math.random() * SYMBOLS_SLOTS.length)];
      }
    });
  }, 70);

  function setReelFinalSymbols(reelIdx, centerSymbol) {
    const strip = [reelStrip0, reelStrip1, reelStrip2][reelIdx];
    const box = [reelBox0, reelBox1, reelBox2][reelIdx];
    if (box) box.classList.remove("spinning");
    if (!strip || strip.children.length < 3) return;

    const symIdx = SYMBOLS_SLOTS.indexOf(centerSymbol);
    const prevIdx = (symIdx - 1 + SYMBOLS_SLOTS.length) % SYMBOLS_SLOTS.length;
    const nextIdx = (symIdx + 1) % SYMBOLS_SLOTS.length;

    strip.children[0].textContent = SYMBOLS_SLOTS[prevIdx];
    strip.children[1].textContent = centerSymbol;
    strip.children[2].textContent = SYMBOLS_SLOTS[nextIdx];
  }

  try {
    const res = await fetch("/api/slots/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, bet: bet })
    }).then(r => r.json());

    if (!res.ok) {
      clearInterval(tickInterval);
      clearInterval(spinInterval);
      [reelBox0, reelBox1, reelBox2].forEach(b => { if (b) b.classList.remove("spinning"); });
      elSlotsSpinBtn.disabled = false;
      elSlotsSpinText.textContent = "КРУТИТЬ (SPIN)";
      if (elSlotsWinTitle) elSlotsWinTitle.textContent = res.error || "Ошибка спина";
      slotsIsSpinning = false;
      if (slotsAutoActive) stopSlotsAuto(res.error);
      return;
    }

    // Барабан 1 останавливается и фиксирует свой символ
    setTimeout(() => {
      isReelSpinning[0] = false;
      setReelFinalSymbols(0, res.symbols[0]);
      playSound("reel_stop");
      triggerHaptic("impact");
    }, 550);

    // Барабан 2 останавливается и фиксирует свой символ
    setTimeout(() => {
      isReelSpinning[1] = false;
      setReelFinalSymbols(1, res.symbols[1]);
      playSound("reel_stop");
      triggerHaptic("impact");
    }, 1050);

    // Барабан 3 останавливается и подводит итог
    setTimeout(() => {
      isReelSpinning[2] = false;
      clearInterval(tickInterval);
      clearInterval(spinInterval);
      setReelFinalSymbols(2, res.symbols[2]);
      playSound("reel_stop");
      triggerHaptic("impact");

      // Финал спина
      slotsIsSpinning = false;
      elSlotsSpinBtn.disabled = false;
      updateSlotsAutoUI();

      userBalance = res.balance;
      elUserBalance.textContent = userBalance;

      if (res.is_win) {
        [reelBox0, reelBox1, reelBox2].forEach(b => { if (b) b.classList.add("won"); });
        if (reelsContainer) reelsContainer.classList.add("win-pulse");
        if (elSlotsWinTitle) elSlotsWinTitle.textContent = res.combo_title;
        if (elSlotsWinAmount) {
          elSlotsWinAmount.textContent = `+${res.win} ⭐ (${res.multiplier}x)`;
          elSlotsWinAmount.style.display = "block";
        }

        if (res.is_jackpot) {
          playSound("jackpot");
          showToast(`🔥 ДЖЕКПОТ 777! ВЫИГРЫШ +${res.win} ⭐`);
          triggerHaptic("success");
        } else {
          playSound("cashout");
          showToast(`🎉 Выигрыш: +${res.win} ⭐`);
          triggerHaptic("success");
        }
      } else {
        if (elSlotsWinTitle) elSlotsWinTitle.textContent = res.combo_title || "Попробуйте ещё раз!";
        if (elSlotsWinAmount) elSlotsWinAmount.style.display = "none";
      }

      if (slotsAutoActive) {
        if (slotsAutoRemaining !== Infinity) {
          slotsAutoRemaining--;
        }
        updateSlotsAutoUI();
        if (slotsAutoRemaining <= 0) {
          stopSlotsAuto("Авто-спины завершены");
        } else if (userBalance < bet) {
          stopSlotsAuto("Недостаточно звёзд для следующего спина");
        } else {
          setTimeout(() => {
            if (slotsAutoActive) spinSlots();
          }, 850);
        }
      }
    }, 1600);

  } catch (e) {
    clearInterval(tickInterval);
    clearInterval(spinInterval);
    [reelBox0, reelBox1, reelBox2].forEach(b => { if (b) b.classList.remove("spinning"); });
    slotsIsSpinning = false;
    elSlotsSpinBtn.disabled = false;
    updateSlotsAutoUI();
    showToast("Ошибка соединения: " + e.message);
    if (slotsAutoActive) stopSlotsAuto();
  }
}

// ==================== МИНЁР (MINES 5x5) ====================
let minesGameActive = false;
let minesCount = 3;
let minesBet = 10;
let minesCurrentMult = 1.00;
let minesPotentialWin = 0;
let minesStepsCleared = 0;
let minesRevealedTiles = new Set();

const elMinesGrid = document.getElementById("mines-grid");
const elMinesBetAmount = document.getElementById("mines-bet-amount");
const elMinesCurMult = document.getElementById("mines-cur-mult");
const elMinesCurProfit = document.getElementById("mines-cur-profit");
const elMinesNextMult = document.getElementById("mines-next-mult");
const elMinesActionBtn = document.getElementById("mines-action-btn");
const elMinesBtnPrimary = document.getElementById("mines-btn-primary");
const elMinesBtnSub = document.getElementById("mines-btn-sub");
const elMinesCountLabel = document.getElementById("mines-count-label");
const elMinesSafeLabel = document.getElementById("mines-safe-count-label");

function initMinesGrid() {
  if (!elMinesGrid) return;
  elMinesGrid.innerHTML = "";
  for (let i = 0; i < 25; i++) {
    const tile = document.createElement("div");
    tile.className = "mines-tile";
    tile.dataset.index = i;
    tile.innerHTML = `<span class="tile-content"></span>`;
    tile.onclick = () => onTileClick(i);
    elMinesGrid.appendChild(tile);
  }
  updateMinesUI();
}

function updateMinesUI() {
  if (elMinesCountLabel) elMinesCountLabel.textContent = minesCount;
  if (elMinesSafeLabel) elMinesSafeLabel.textContent = 25 - minesCount;

  if (!minesGameActive) {
    if (elMinesActionBtn) {
      elMinesActionBtn.className = "mines-action-btn state-start";
      elMinesBtnPrimary.textContent = "💣 НАЧАТЬ ИГРУ";
      const bet = parseInt(elMinesBetAmount.value, 10) || 10;
      elMinesBtnSub.textContent = `Ставка ${bet} ⭐ (${minesCount} мин)`;
    }
    if (elMinesCurMult) elMinesCurMult.textContent = "1.00x";
    if (elMinesCurProfit) elMinesCurProfit.textContent = "0 ⭐";
    const nextMult = (25 / (25 - minesCount) * 0.96).toFixed(2);
    if (elMinesNextMult) elMinesNextMult.textContent = `${nextMult}x`;
    if (elMinesBetAmount) elMinesBetAmount.disabled = false;
    document.querySelectorAll(".mines-p-chip").forEach(c => c.disabled = false);
  } else {
    if (elMinesBetAmount) elMinesBetAmount.disabled = true;
    document.querySelectorAll(".mines-p-chip").forEach(c => c.disabled = true);
    if (minesStepsCleared === 0) {
      elMinesActionBtn.className = "mines-action-btn state-disabled";
      elMinesBtnPrimary.textContent = "🔍 ВЫБЕРИТЕ КЛЕТКУ";
      elMinesBtnSub.textContent = `Откройте хотя бы 1 алмаз`;
    } else {
      elMinesActionBtn.className = "mines-action-btn state-cashout";
      elMinesBtnPrimary.textContent = `💰 ЗАБРАТЬ ${minesPotentialWin} ⭐`;
      elMinesBtnSub.textContent = `Множитель: ${minesCurrentMult.toFixed(2)}x (Шагов: ${minesStepsCleared})`;
    }
  }
}

// Регулировка ставки минёра
if (document.getElementById("mines-btn-div2")) {
  document.getElementById("mines-btn-div2").onclick = () => {
    if (minesGameActive) return;
    let cur = parseInt(elMinesBetAmount.value, 10) || 10;
    elMinesBetAmount.value = Math.max(1, Math.floor(cur / 2));
    updateMinesUI();
  };
}
if (document.getElementById("mines-btn-mul2")) {
  document.getElementById("mines-btn-mul2").onclick = () => {
    if (minesGameActive) return;
    let cur = parseInt(elMinesBetAmount.value, 10) || 10;
    elMinesBetAmount.value = cur * 2;
    updateMinesUI();
  };
}
if (document.getElementById("mines-btn-max")) {
  document.getElementById("mines-btn-max").onclick = () => {
    if (minesGameActive) return;
    elMinesBetAmount.value = Math.max(1, userBalance);
    updateMinesUI();
  };
}

document.querySelectorAll(".mines-chip").forEach(chip => {
  chip.onclick = () => {
    if (minesGameActive) return;
    elMinesBetAmount.value = chip.dataset.amt;
    updateMinesUI();
  };
});

if (elMinesBetAmount) {
  elMinesBetAmount.oninput = updateMinesUI;
}

// Выбор количества мин
document.querySelectorAll(".mines-p-chip").forEach(chip => {
  chip.onclick = () => {
    if (minesGameActive) return;
    document.querySelectorAll(".mines-p-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    minesCount = parseInt(chip.dataset.mines, 10);
    updateMinesUI();
  };
});

// Клик по главной кнопке (Старт / Кэшаут)
if (elMinesActionBtn) {
  elMinesActionBtn.onclick = () => {
    if (!minesGameActive) {
      startMinesGame();
    } else if (minesStepsCleared > 0) {
      cashoutMines();
    }
  };
}

async function startMinesGame() {
  const bet = parseInt(elMinesBetAmount.value, 10);
  if (isNaN(bet) || bet <= 0) {
    showToast("Введите корректную ставку");
    return;
  }
  if (userBalance < bet) {
    showToast("Недостаточно звёзд на балансе!");
    return;
  }

  showToast("Запускаем минное поле... 💣");
  try {
    const res = await fetch("/api/mines/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, bet: bet, mines: minesCount })
    }).then(r => r.json());

    if (!res.ok) {
      showToast(res.error || "Ошибка старта");
      return;
    }

    userBalance = res.balance;
    elUserBalance.textContent = userBalance;

    minesGameActive = true;
    minesBet = bet;
    minesStepsCleared = 0;
    minesCurrentMult = 1.00;
    minesPotentialWin = bet;
    minesRevealedTiles.clear();

    initMinesGrid();

    elMinesCurMult.textContent = "1.00x";
    elMinesCurProfit.textContent = `${bet} ⭐`;
    elMinesNextMult.textContent = `${res.next_multiplier.toFixed(2)}x`;

    updateMinesUI();
    playSound("beep");
    triggerHaptic("impact");
  } catch (e) {
    showToast("Ошибка соединения: " + e.message);
  }
}

async function onTileClick(tileIndex) {
  if (!minesGameActive) {
    showToast("Нажмите «НАЧАТЬ ИГРУ», чтобы сделать ставку!");
    return;
  }
  if (minesRevealedTiles.has(tileIndex)) return;

  const tileEl = elMinesGrid.children[tileIndex];
  if (!tileEl) return;

  try {
    const res = await fetch("/api/mines/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, tile: tileIndex })
    }).then(r => r.json());

    if (!res.ok) {
      showToast(res.error || "Ошибка хода");
      return;
    }

    minesRevealedTiles.add(tileIndex);

    if (res.status === "safe") {
      // Алмаз
      tileEl.classList.add("revealed-gem");
      tileEl.querySelector(".tile-content").textContent = "💎";
      playSound("cashout");
      triggerHaptic("impact");

      minesStepsCleared = res.steps_cleared;
      minesCurrentMult = res.multiplier;
      minesPotentialWin = res.potential_win;

      elMinesCurMult.textContent = `${res.multiplier.toFixed(2)}x`;
      elMinesCurProfit.textContent = `${res.potential_win} ⭐`;
      elMinesNextMult.textContent = `${res.next_multiplier.toFixed(2)}x`;

      updateMinesUI();

    } else if (res.status === "all_cleared") {
      // Все алмазы открыты!
      tileEl.classList.add("revealed-gem");
      tileEl.querySelector(".tile-content").textContent = "💎";

      revealAllMines(res.all_mines, tileIndex);

      minesGameActive = false;
      userBalance = res.balance;
      elUserBalance.textContent = userBalance;

      playSound("jackpot");
      triggerHaptic("success");
      showToast(`🏆 ВСЕ АЛМАЗЫ СОБРАНЫ! ВЫИГРЫШ +${res.win} ⭐ (${res.multiplier}x)`);

      elMinesActionBtn.className = "mines-action-btn state-start";
      elMinesBtnPrimary.textContent = "🏆 ПОБЕДА! НАЧАТЬ ЗАНОВО";
      elMinesBtnSub.textContent = `Выигрыш +${res.win} ⭐`;
      updateMinesUI();

    } else if (res.status === "exploded") {
      // Взрыв мины!
      tileEl.classList.add("revealed-mine");
      tileEl.querySelector(".tile-content").textContent = "💣";

      revealAllMines(res.all_mines, tileIndex);

      minesGameActive = false;
      if (typeof res.balance === "number") {
        userBalance = res.balance;
        elUserBalance.textContent = userBalance;
      }

      playSound("crash");
      triggerHaptic("error");
      showToast(`💥 ВЗРЫВ! Ставка ${res.bet} ⭐ сгорела.`);

      elMinesActionBtn.className = "mines-action-btn state-start";
      elMinesBtnPrimary.textContent = "💥 ВЗРЫВ! НАЧАТЬ ЗАНОВО";
      elMinesBtnSub.textContent = `Попробуйте ещё раз`;
      updateMinesUI();
    }
  } catch (e) {
    showToast("Ошибка хода: " + e.message);
  }
}

function revealAllMines(minesList, hitIndex) {
  if (!minesList) return;
  minesList.forEach(idx => {
    if (idx !== hitIndex && elMinesGrid.children[idx]) {
      const tile = elMinesGrid.children[idx];
      tile.classList.add("ghost-mine", "disabled");
      tile.querySelector(".tile-content").textContent = "💣";
    }
  });
  for (let i = 0; i < elMinesGrid.children.length; i++) {
    elMinesGrid.children[i].classList.add("disabled");
  }
}

async function cashoutMines() {
  if (!minesGameActive || minesStepsCleared === 0) return;

  try {
    const res = await fetch("/api/mines/cashout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId })
    }).then(r => r.json());

    if (!res.ok) {
      showToast(res.error || "Ошибка кэшаута");
      return;
    }

    minesGameActive = false;
    userBalance = res.balance;
    elUserBalance.textContent = userBalance;

    revealAllMines(res.all_mines, -1);

    playSound("cashout");
    triggerHaptic("success");
    showToast(`💰 Вы забрали куш: +${res.win} ⭐ (${res.multiplier.toFixed(2)}x)!`);

    elMinesActionBtn.className = "mines-action-btn state-start";
    elMinesBtnPrimary.textContent = `🎉 КУШ ЗАБРАН (+${res.win} ⭐)`;
    elMinesBtnSub.textContent = "Начать новый раунд";
    updateMinesUI();
  } catch (e) {
    showToast("Ошибка кэшаута: " + e.message);
  }
}

// ==================== ИГРА 4: КОНТРАКТЫ ОБМЕНА (UPGRADE / CRAFT) ====================
let upgradeBet = 10;
let upgradeMult = 2.0;
let upgradeRot = 0;
let isUpgrading = false;

const elUpgradeBet = document.getElementById("upgrade-bet-amount");
const elUpgradeMultLabel = document.getElementById("upgrade-mult-label");
const elUpgradeProfitPreview = document.getElementById("upgrade-profit-preview");
const elUpgradeChanceVal = document.getElementById("upgrade-chance-val");
const elUpgradePayoutVal = document.getElementById("upgrade-payout-val");
const elWheelWinSlice = document.getElementById("wheel-win-slice");
const elWheelPointerPivot = document.getElementById("wheel-pointer-pivot");
const elUpgradeActionBtn = document.getElementById("upgrade-action-btn");
const elUpBtnPrimary = document.getElementById("up-btn-primary");
const elUpBtnSub = document.getElementById("up-btn-sub");

function calculateUpgradeChance(mult) {
  if (mult <= 1.0) return 95.0;
  const chance = (96.0 / mult);
  return Math.max(0.05, Math.min(95.0, chance));
}

function updateUpgradeUI() {
  const chance = calculateUpgradeChance(upgradeMult);
  const payout = Math.round(upgradeBet * upgradeMult);

  if (elUpgradeChanceVal) elUpgradeChanceVal.textContent = `${chance.toFixed(1)}%`;
  if (elUpgradePayoutVal) elUpgradePayoutVal.textContent = `${payout} ⭐`;
  if (elUpgradeMultLabel) elUpgradeMultLabel.textContent = `${upgradeMult.toFixed(2)}x`;
  if (elUpgradeProfitPreview) elUpgradeProfitPreview.textContent = `${payout} ⭐`;

  if (!isUpgrading) {
    if (elUpBtnPrimary) elUpBtnPrimary.textContent = "⚡ УЛУЧШИТЬ ПРЕДМЕТ";
    if (elUpBtnSub) elUpBtnSub.textContent = `Шанс ${chance.toFixed(1)}% | Выигрыш ${payout} ⭐`;
  }

  // Обновление сектора круга SVG (2 * PI * 110 ≈ 691.15)
  if (elWheelWinSlice) {
    const dashLength = (chance / 100) * 691.15;
    elWheelWinSlice.setAttribute("stroke-dasharray", `${dashLength.toFixed(2)} 691.15`);
  }
}

function initUpgradeWheel() {
  if (elUpgradeBet) {
    let b = parseInt(elUpgradeBet.value, 10);
    if (!isNaN(b) && b > 0) upgradeBet = b;
  }
  updateUpgradeUI();
}

if (elUpgradeBet) {
  elUpgradeBet.addEventListener("input", () => {
    let val = parseInt(elUpgradeBet.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    upgradeBet = val;
    updateUpgradeUI();
  });
}

if (document.getElementById("upgrade-btn-div2")) {
  document.getElementById("upgrade-btn-div2").onclick = () => {
    upgradeBet = Math.max(1, Math.floor(upgradeBet / 2));
    if (elUpgradeBet) elUpgradeBet.value = upgradeBet;
    updateUpgradeUI();
  };
}

if (document.getElementById("upgrade-btn-mul2")) {
  document.getElementById("upgrade-btn-mul2").onclick = () => {
    upgradeBet = Math.max(1, upgradeBet * 2);
    if (elUpgradeBet) elUpgradeBet.value = upgradeBet;
    updateUpgradeUI();
  };
}

if (document.getElementById("upgrade-btn-max")) {
  document.getElementById("upgrade-btn-max").onclick = () => {
    upgradeBet = Math.max(1, userBalance);
    if (elUpgradeBet) elUpgradeBet.value = upgradeBet;
    updateUpgradeUI();
  };
}

document.querySelectorAll(".upgrade-chip").forEach(chip => {
  chip.onclick = () => {
    const amt = parseInt(chip.dataset.amt, 10);
    if (!isNaN(amt)) {
      upgradeBet = amt;
      if (elUpgradeBet) elUpgradeBet.value = upgradeBet;
      updateUpgradeUI();
    }
  };
});

document.querySelectorAll(".up-m-chip").forEach(chip => {
  chip.onclick = () => {
    const mult = parseFloat(chip.dataset.mult);
    if (!isNaN(mult)) {
      upgradeMult = mult;
      document.querySelectorAll(".up-m-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      updateUpgradeUI();
    }
  };
});

if (elUpgradeActionBtn) {
  elUpgradeActionBtn.onclick = async () => {
    if (isUpgrading) return;

    if (upgradeBet < 1) {
      showToast("Минимальная ставка 1 ⭐");
      return;
    }
    if (userBalance < upgradeBet) {
      showToast("Недостаточно звёзд на балансе!");
      return;
    }

    isUpgrading = true;
    elUpgradeActionBtn.disabled = true;
    elUpgradeActionBtn.classList.remove("state-ready");
    elUpgradeActionBtn.classList.add("state-spinning");
    if (elUpBtnPrimary) elUpBtnPrimary.textContent = "⚡ ВРАЩЕНИЕ КОЛЕСА...";
    if (elUpBtnSub) elUpBtnSub.textContent = `Цель: ${upgradeMult.toFixed(2)}x (${Math.round(upgradeBet * upgradeMult)} ⭐)`;

    playSound("beep");
    triggerHaptic("impact");

    try {
      const res = await fetch("/api/upgrade/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userId,
          bet: upgradeBet,
          multiplier: upgradeMult
        })
      }).then(r => r.json());

      if (!res.ok) {
        showToast(res.error || "Ошибка апгрейда");
        isUpgrading = false;
        elUpgradeActionBtn.disabled = false;
        elUpgradeActionBtn.classList.add("state-ready");
        elUpgradeActionBtn.classList.remove("state-spinning");
        updateUpgradeUI();
        return;
      }

      // Мгновенно списываем ставку из отображения
      userBalance = Math.max(0, userBalance - upgradeBet);
      elUserBalance.textContent = userBalance;

      // Вычисляем целевой угол для плавной анимации вращения
      const extraSpins = 360 * 5;
      const roll = res.roll_angle || 0;
      upgradeRot = upgradeRot + (360 - (upgradeRot % 360)) + extraSpins + roll;

      if (elWheelPointerPivot) {
        elWheelPointerPivot.style.transition = "transform 3.2s cubic-bezier(0.12, 0.8, 0.2, 1)";
        elWheelPointerPivot.style.transform = `rotate(${upgradeRot}deg)`;
      }

      // По истечении времени вращения (3200ms) фиксируем результат
      setTimeout(() => {
        isUpgrading = false;
        elUpgradeActionBtn.disabled = false;
        elUpgradeActionBtn.classList.add("state-ready");
        elUpgradeActionBtn.classList.remove("state-spinning");

        userBalance = res.balance;
        elUserBalance.textContent = userBalance;

        if (res.is_win) {
          playSound("jackpot");
          triggerHaptic("success");
          showToast(`🎉 УСПЕШНЫЙ АПГРЕЙД! +${res.win} ⭐ (${res.target_multiplier}x)!`);
        } else {
          playSound("crash");
          triggerHaptic("error");
          showToast(`💀 ПРЕДМЕТ СГОРЕЛ! (Выпало ${res.roll_angle}°)`);
        }

        updateUpgradeUI();
      }, 3300);

    } catch (e) {
      showToast("Ошибка сети: " + e.message);
      isUpgrading = false;
      elUpgradeActionBtn.disabled = false;
      elUpgradeActionBtn.classList.add("state-ready");
      elUpgradeActionBtn.classList.remove("state-spinning");
      updateUpgradeUI();
    }
  };
}

// ==================== ИГРА «БАШНЯ» (TOWER / СТУПЕНИ) ====================
const TOWER_MULTS = {
  easy:   [1.25, 1.60, 2.10, 2.80, 3.80, 5.20, 7.50, 11.0],
  medium: [1.40, 2.00, 3.00, 4.50, 7.00, 11.0, 18.0, 32.0],
  hard:   [1.90, 3.80, 7.60, 15.5, 31.0, 62.0, 125.0, 250.0]
};

const TOWER_TILES = {
  easy: 4,
  medium: 3,
  hard: 2
};

let towerInGame = false;
let towerFloor = 0; // 0: не начато; 1..8: пройденные этажи
let towerDiff = "medium";
let towerBet = 10;
let towerCurrentWin = 0;
let towerCurrentMult = 1.0;
let towerStepping = false;

const elTowerFloorsList = document.getElementById("tower-floors-list");
const elTowerActionBtn = document.getElementById("tower-action-btn");
const elTowerBtnPrimary = document.getElementById("tower-btn-primary");
const elTowerBtnSub = document.getElementById("tower-btn-sub");
const elTowerBetAmount = document.getElementById("tower-bet-amount");
const elTowerDiffLabel = document.getElementById("tower-diff-label");
const elTowerMaxWinLabel = document.getElementById("tower-max-win-label");
const elTowerStatusBadge = document.getElementById("tower-status-badge");

function updateTowerControlsPreview() {
  const bet = parseInt(elTowerBetAmount ? elTowerBetAmount.value : 10, 10) || 10;
  towerBet = bet;
  const mults = TOWER_MULTS[towerDiff];
  const maxM = mults[mults.length - 1];
  const maxWin = Math.floor(bet * maxM);
  
  const diffNames = {
    easy: "🟢 Лёгкая (4 пл.)",
    medium: "🟡 Средняя (3 пл.)",
    hard: "🔴 Хард (2 пл.)"
  };
  if (elTowerDiffLabel) elTowerDiffLabel.textContent = diffNames[towerDiff];
  if (elTowerMaxWinLabel) elTowerMaxWinLabel.textContent = `${maxM.toFixed(1)}x (${maxWin} ⭐)`;

  if (!towerInGame && elTowerBtnSub) {
    elTowerBtnSub.textContent = `Ставка ${bet} ⭐ | 8 этажей`;
  }
}

function initTowerUI() {
  updateTowerControlsPreview();
  renderTowerLadder();
}

function renderTowerLadder() {
  if (!elTowerFloorsList) return;
  elTowerFloorsList.innerHTML = "";

  const mults = TOWER_MULTS[towerDiff];
  const tilesCount = TOWER_TILES[towerDiff];

  // Отрисовываем сверху вниз: от 8-го к 1-му этажу
  for (let f = 8; f >= 1; f--) {
    const row = document.createElement("div");
    row.className = "tower-floor-row";
    row.dataset.floor = f;

    if (!towerInGame) {
      row.classList.add("locked-floor");
    } else {
      if (f === towerFloor + 1) {
        row.classList.add("active-floor");
      } else if (f <= towerFloor) {
        row.classList.add("cleared-floor");
      } else {
        row.classList.add("locked-floor");
      }
    }

    const multVal = mults[f - 1];
    const multCol = document.createElement("div");
    multCol.className = "tower-floor-mult";
    multCol.innerHTML = `
      <span class="tower-floor-num">${f}F</span>
      <span class="tower-mult-val">${multVal.toFixed(2)}x</span>
    `;
    row.appendChild(multCol);

    const tilesCol = document.createElement("div");
    tilesCol.className = "tower-floor-tiles";

    for (let t = 0; t < tilesCount; t++) {
      const tile = document.createElement("button");
      tile.className = "tower-tile";
      tile.dataset.tileIndex = t;
      tile.dataset.floor = f;
      tile.type = "button";
      tile.innerHTML = "<span>❓</span>";

      if (towerInGame && f === towerFloor + 1) {
        tile.onclick = () => stepTower(t, tile, row);
      }

      tilesCol.appendChild(tile);
    }

    row.appendChild(tilesCol);
    elTowerFloorsList.appendChild(row);
  }
}

async function startTower() {
  const bet = parseInt(elTowerBetAmount.value, 10) || 10;
  if (bet < 1) {
    showToast("Минимальная ставка 1 ⭐");
    return;
  }
  if (userBalance < bet) {
    showToast("Недостаточно звёзд на балансе!");
    return;
  }

  if (elTowerActionBtn) elTowerActionBtn.disabled = true;

  try {
    const res = await fetch("/api/tower/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: userId,
        bet: bet,
        difficulty: towerDiff
      })
    }).then(r => r.json());

    if (elTowerActionBtn) elTowerActionBtn.disabled = false;

    if (!res.ok) {
      showToast(res.error || "Ошибка старта");
      return;
    }

    towerInGame = true;
    towerFloor = 0;
    towerCurrentWin = 0;
    towerCurrentMult = 1.0;
    towerStepping = false;
    userBalance = res.balance;
    elUserBalance.textContent = userBalance;

    if (elTowerActionBtn) {
      elTowerActionBtn.className = "tower-action-btn state-cashout";
    }
    if (elTowerBtnPrimary) elTowerBtnPrimary.textContent = "ЗАБРАТЬ 0 ⭐";
    if (elTowerBtnSub) elTowerBtnSub.textContent = "Этаж 1 из 8 (выберите плитку)";
    if (elTowerStatusBadge) {
      elTowerStatusBadge.textContent = "Штурм начался!";
      elTowerStatusBadge.classList.add("active-game");
    }

    document.querySelectorAll(".t-diff-chip").forEach(c => c.disabled = true);
    if (elTowerBetAmount) elTowerBetAmount.disabled = true;

    playSound("beep");
    triggerHaptic("impact");
    renderTowerLadder();

  } catch (e) {
    if (elTowerActionBtn) elTowerActionBtn.disabled = false;
    showToast("Ошибка сети: " + e.message);
  }
}

async function stepTower(tileIndex, tileEl, rowEl) {
  if (!towerInGame || towerStepping) return;
  towerStepping = true;

  try {
    const res = await fetch("/api/tower/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: userId,
        tile_index: tileIndex
      })
    }).then(r => r.json());

    towerStepping = false;

    if (!res.ok) {
      showToast(res.error || "Ошибка шага");
      return;
    }

    if (res.is_safe) {
      tileEl.innerHTML = "<span>💎</span>";
      tileEl.classList.add("safe");
      playSound("cashout");
      triggerHaptic("success");

      towerFloor = res.floor;
      towerCurrentWin = res.current_win;
      towerCurrentMult = res.current_multiplier;

      if (res.status === "won") {
        towerInGame = false;
        userBalance = res.balance;
        elUserBalance.textContent = userBalance;

        playSound("jackpot");
        triggerHaptic("success");
        showToast(`🏰 ВЕРШИНА ПОКОРЕНА! ВЫИГРЫШ +${res.win} ⭐ (${res.current_multiplier}x)!`);

        finishTowerSession();
      } else {
        if (elTowerBtnPrimary) elTowerBtnPrimary.textContent = `ЗАБРАТЬ ${towerCurrentWin} ⭐`;
        if (elTowerBtnSub) elTowerBtnSub.textContent = `Множитель ${towerCurrentMult}x (Этаж ${towerFloor + 1} из 8)`;
        renderTowerLadder();
      }
    } else {
      tileEl.innerHTML = "<span>💀</span>";
      tileEl.classList.add("trap");
      playSound("crash");
      triggerHaptic("error");

      if (res.trap_tiles && rowEl) {
        rowEl.querySelectorAll(".tower-tile").forEach(t => {
          const idx = parseInt(t.dataset.tileIndex, 10);
          if (res.trap_tiles.includes(idx) && t !== tileEl) {
            t.innerHTML = "<span>💀</span>";
            t.classList.add("ghost-trap");
          }
        });
      }

      towerInGame = false;
      showToast("💀 ЛОВУШКА! Ставка сгорела.");
      finishTowerSession();
    }

  } catch (e) {
    towerStepping = false;
    showToast("Ошибка шага: " + e.message);
  }
}

async function cashoutTower() {
  if (!towerInGame || towerFloor === 0) {
    showToast("Сначала пройдите хотя бы 1 этаж!");
    return;
  }

  if (elTowerActionBtn) elTowerActionBtn.disabled = true;

  try {
    const res = await fetch("/api/tower/cashout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId })
    }).then(r => r.json());

    if (elTowerActionBtn) elTowerActionBtn.disabled = false;

    if (!res.ok) {
      showToast(res.error || "Не удалось забрать куш");
      return;
    }

    towerInGame = false;
    userBalance = res.balance;
    elUserBalance.textContent = userBalance;

    playSound("jackpot");
    triggerHaptic("success");
    showToast(`💰 ВЫВОД КУША! +${res.win} ⭐ (${res.multiplier}x)!`);

    finishTowerSession();

  } catch (e) {
    if (elTowerActionBtn) elTowerActionBtn.disabled = false;
    showToast("Ошибка вывода: " + e.message);
  }
}

function finishTowerSession() {
  towerInGame = false;
  towerFloor = 0;
  towerStepping = false;

  if (elTowerActionBtn) {
    elTowerActionBtn.className = "tower-action-btn state-start";
  }
  if (elTowerBtnPrimary) elTowerBtnPrimary.textContent = "🏰 НАЧАТЬ ШТУРМ";
  updateTowerControlsPreview();

  if (elTowerStatusBadge) {
    elTowerStatusBadge.textContent = "Готов к штурму";
    elTowerStatusBadge.classList.remove("active-game");
  }

  document.querySelectorAll(".t-diff-chip").forEach(c => c.disabled = false);
  if (elTowerBetAmount) elTowerBetAmount.disabled = false;

  renderTowerLadder();
}

// Привязка событий кнопок Башни
if (elTowerActionBtn) {
  elTowerActionBtn.onclick = () => {
    if (!towerInGame) {
      startTower();
    } else {
      cashoutTower();
    }
  };
}

if (document.getElementById("tower-btn-div2")) {
  document.getElementById("tower-btn-div2").onclick = () => {
    let cur = parseInt(elTowerBetAmount.value, 10) || 10;
    elTowerBetAmount.value = Math.max(1, Math.floor(cur / 2));
    updateTowerControlsPreview();
  };
}
if (document.getElementById("tower-btn-mul2")) {
  document.getElementById("tower-btn-mul2").onclick = () => {
    let cur = parseInt(elTowerBetAmount.value, 10) || 10;
    elTowerBetAmount.value = cur * 2;
    updateTowerControlsPreview();
  };
}
if (document.getElementById("tower-btn-max")) {
  document.getElementById("tower-btn-max").onclick = () => {
    elTowerBetAmount.value = Math.max(1, userBalance);
    updateTowerControlsPreview();
  };
}
document.querySelectorAll(".tower-chip").forEach(chip => {
  chip.onclick = () => {
    elTowerBetAmount.value = chip.dataset.amt;
    updateTowerControlsPreview();
  };
});
if (elTowerBetAmount) {
  elTowerBetAmount.oninput = updateTowerControlsPreview;
}
document.querySelectorAll(".t-diff-chip").forEach(chip => {
  chip.onclick = () => {
    if (towerInGame) return;
    document.querySelectorAll(".t-diff-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    towerDiff = chip.dataset.diff;
    updateTowerControlsPreview();
    renderTowerLadder();
  };
});

// ==================== ЗАЛ СЛАВЫ: ТОП ЗАНОСОВ ====================
const elLeaderboardModal = document.getElementById("leaderboard-modal");
const elOpenLeaderboardBtn = document.getElementById("open-leaderboard-btn");
const elCloseLeaderboardBtn = document.getElementById("close-leaderboard-btn");
const elLeaderboardList = document.getElementById("leaderboard-list");
const elLeadTabDay = document.getElementById("lead-tab-day");
const elLeadTabWeek = document.getElementById("lead-tab-week");
let currentLeadPeriod = "day";

async function loadLeaderboard(period = "day") {
  currentLeadPeriod = period;
  if (!elLeaderboardList) return;

  elLeaderboardList.innerHTML = `<div class="lead-loading">Загрузка топ заносов...</div>`;

  try {
    const res = await fetch(`/api/leaderboard?period=${period}`).then(r => r.json());
    if (!res.ok || !res.leaderboard || res.leaderboard.length === 0) {
      elLeaderboardList.innerHTML = `<div class="lead-empty">Пока нет крупных заносов за этот период</div>`;
      return;
    }

    const cleanList = (res.leaderboard || []).filter(item => 
      !ADMIN_IDS.includes(Number(item.user_id)) && 
      !["владелец", "создатель", "owner", "admin"].includes((item.username || "").toLowerCase())
    );

    if (cleanList.length === 0) {
      elLeaderboardList.innerHTML = `<div class="lead-empty">Пока нет крупных заносов за этот период</div>`;
      return;
    }

    elLeaderboardList.innerHTML = "";
    cleanList.forEach((item, idx) => {
      let rankBadge = `#${idx + 1}`;
      let rankClass = "rank-other";
      if (idx === 0) { rankBadge = "🥇"; rankClass = "rank-1"; }
      else if (idx === 1) { rankBadge = "🥈"; rankClass = "rank-2"; }
      else if (idx === 2) { rankBadge = "🥉"; rankClass = "rank-3"; }

      let gameIcon = "🚀";
      let gameName = "Ракета";
      const g = (item.game || "").toLowerCase();
      if (g.includes("slot") || g.includes("слот")) {
        gameIcon = "🎰";
        gameName = "Слоты 777";
      } else if (g.includes("mine") || g.includes("мин")) {
        gameIcon = "💣";
        gameName = "Минёр";
      } else if (g.includes("upgrad") || g.includes("апгрейд") || g.includes("craft")) {
        gameIcon = "⚡";
        gameName = "Upgrade";
      } else if (g.includes("tower") || g.includes("башн")) {
        gameIcon = "🏰";
        gameName = "Башня";
      }

      const mult = (typeof item.multiplier === "number") ? item.multiplier.toFixed(2) : parseFloat(item.multiplier || 1).toFixed(2);
      const row = document.createElement("div");
      row.className = `lead-item ${rankClass}`;
      row.innerHTML = `
        <div class="lead-rank">${rankBadge}</div>
        <div class="lead-info">
          <div class="lead-user">
            <span class="lead-username">${item.username || "Игрок"}</span>
            <span class="lead-badge">${gameIcon} ${gameName}</span>
          </div>
          <div class="lead-time">${item.created_at || "сегодня"}</div>
        </div>
        <div class="lead-win-col">
          <span class="lead-payout">+${item.payout} ⭐</span>
          <span class="lead-mult">${mult}x</span>
        </div>
      `;
      elLeaderboardList.appendChild(row);
    });
  } catch (e) {
    elLeaderboardList.innerHTML = `<div class="lead-empty">Ошибка загрузки: ${e.message}</div>`;
  }
}

if (elOpenLeaderboardBtn) {
  elOpenLeaderboardBtn.onclick = () => {
    if (elLeaderboardModal) elLeaderboardModal.style.display = "flex";
    loadLeaderboard(currentLeadPeriod);
  };
}

if (elCloseLeaderboardBtn) {
  elCloseLeaderboardBtn.onclick = () => {
    if (elLeaderboardModal) elLeaderboardModal.style.display = "none";
  };
}

if (elLeadTabDay) {
  elLeadTabDay.onclick = () => {
    elLeadTabDay.classList.add("active");
    if (elLeadTabWeek) elLeadTabWeek.classList.remove("active");
    loadLeaderboard("day");
  };
}

if (elLeadTabWeek) {
  elLeadTabWeek.onclick = () => {
    elLeadTabWeek.classList.add("active");
    if (elLeadTabDay) elLeadTabDay.classList.remove("active");
    loadLeaderboard("week");
  };
}

// ==================== ОНЛАЙН-ЧАТ ИГРОКОВ ====================
const elChatDrawerOverlay = document.getElementById("chat-drawer-overlay");
const elOpenChatBtn = document.getElementById("open-chat-btn");
const elChatCloseBtn = document.getElementById("chat-close-btn");
const elChatMessagesList = document.getElementById("chat-messages-list");
const elChatForm = document.getElementById("chat-form");
const elChatInputText = document.getElementById("chat-input-text");
const elChatOnlineCount = document.getElementById("chat-online-count");
let chatPollTimer = null;
let lastRenderedChatMsgCount = 0;

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadChatMessages() {
  if (!elChatMessagesList) return;

  try {
    const res = await fetch("/api/chat/messages").then(r => r.json());
    if (res.ok && res.messages) {
      if (res.messages.length === lastRenderedChatMsgCount) return;
      lastRenderedChatMsgCount = res.messages.length;

      const wasScrolledToBottom = (elChatMessagesList.scrollHeight - elChatMessagesList.scrollTop <= elChatMessagesList.clientHeight + 60);

      elChatMessagesList.innerHTML = "";
      res.messages.forEach(msg => {
        const item = document.createElement("div");

        if (msg.badge === "win_alert" || msg.is_win) {
          item.className = "chat-msg chat-win-broadcast";
          const bannerText = msg.text ? escapeHtml(msg.text) : `<span class="chat-win-user">${escapeHtml(msg.username)}</span> занёс <b class="chat-win-gold">+${msg.win} ⭐</b> (<span class="chat-win-x">${Number(msg.mult).toFixed(2)}x</span>) в <b>${escapeHtml(msg.game)}</b>!`;
          item.innerHTML = `
            <span class="chat-win-icon">🎉</span>
            <div class="chat-win-text">${bannerText}</div>
          `;
        } else {
          const isMe = (Number(msg.user_id) === Number(userId));
          const isOwner = ADMIN_IDS.includes(Number(msg.user_id));

          let badgeHtml = "";
          if (isOwner) {
            badgeHtml = `<span class="chat-badge chat-badge-owner">👑 Создатель</span>`;
          } else if (msg.badge === "vip") {
            badgeHtml = `<span class="chat-badge chat-badge-vip">💎 VIP</span>`;
          }

          const avatarChar = isOwner ? "👑" : (msg.avatar || (msg.username ? msg.username[0].toUpperCase() : "👤"));

          item.className = `chat-msg ${isMe ? "chat-msg-mine" : ""} ${isOwner ? "chat-msg-owner" : ""}`;
          item.innerHTML = `
            <div class="chat-avatar ${isOwner ? "chat-avatar-owner" : ""}">${avatarChar}</div>
            <div class="chat-bubble">
              <div class="chat-sender-line">
                <span class="chat-username ${isOwner ? "chat-owner-name" : ""}">${escapeHtml(msg.username)}</span>
                ${badgeHtml}
                <span class="chat-time">${escapeHtml(msg.time || "")}</span>
              </div>
              <div class="chat-text">${escapeHtml(msg.text)}</div>
            </div>
          `;
        }

        elChatMessagesList.appendChild(item);
      });

      if (wasScrolledToBottom || lastRenderedChatMsgCount <= 10) {
        elChatMessagesList.scrollTop = elChatMessagesList.scrollHeight;
      }
    }
  } catch (e) {
    console.error("Chat load error:", e);
  }
}

function openChat() {
  if (!elChatDrawerOverlay) return;
  elChatDrawerOverlay.classList.add("active");
  loadChatMessages();
  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = setInterval(loadChatMessages, 3500);
}

function closeChat() {
  if (!elChatDrawerOverlay) return;
  elChatDrawerOverlay.classList.remove("active");
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

if (elOpenChatBtn) {
  elOpenChatBtn.onclick = openChat;
}

if (elChatCloseBtn) {
  elChatCloseBtn.onclick = closeChat;
}

if (elChatDrawerOverlay) {
  elChatDrawerOverlay.onclick = (e) => {
    if (e.target === elChatDrawerOverlay) {
      closeChat();
    }
  };
}

// Быстрые реакции эмодзи
document.querySelectorAll(".emoji-chip").forEach(chip => {
  chip.onclick = () => {
    const em = chip.dataset.emoji;
    if (em && elChatInputText) {
      elChatInputText.value += em;
      elChatInputText.focus();
    }
  };
});

// Отправка сообщения
if (elChatForm) {
  elChatForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!elChatInputText) return;

    const text = elChatInputText.value.trim();
    if (!text) return;

    elChatInputText.value = "";

    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userId,
          username: userName,
          text: text
        })
      }).then(r => r.json());

      if (res.ok) {
        loadChatMessages();
      } else {
        showToast(res.error || "Не удалось отправить сообщение");
      }
    } catch (err) {
      showToast("Ошибка отправки: " + err.message);
    }
  };
}

// Запуск при старте страницы
async function initApp() {
  elUserName.textContent = userName;
  elUserAvatar.textContent = userName.startsWith("@") ? userName[1].toUpperCase() : userName[0].toUpperCase();

  try {
    const userRes = await fetch(`/api/user?id=${userId}&name=${encodeURIComponent(userName)}`).then(r => r.json());
    userBalance = userRes.balance;
    elUserBalance.textContent = userBalance;
  } catch (e) {
    console.error("User fetch error:", e);
  }

  initUpgradeWheel();
  connectWS();
  requestAnimationFrame(renderLoop);
}

window.addEventListener("DOMContentLoaded", initApp);
