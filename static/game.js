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
    } else if (type === "coin_flip") {
      for (let i = 0; i < 6; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1100 + i * 140, now + i * 0.04);
        gain.gain.setValueAtTime(0.07, now + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.03);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.03);
      }
    } else if (type === "plinko_peg") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(900 + Math.random() * 350, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
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
const elPromoModal = document.getElementById("promo-modal");

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

// Промокоды модалка
if (document.getElementById("open-promo-btn")) {
  document.getElementById("open-promo-btn").onclick = () => {
    if (elPromoModal) {
      elPromoModal.style.display = "flex";
      const statusEl = document.getElementById("promo-status-msg");
      if (statusEl) statusEl.style.display = "none";
      const inp = document.getElementById("promo-input-code");
      if (inp) {
        inp.value = "";
        inp.focus();
      }
    }
  };
}
if (document.getElementById("close-promo-btn")) {
  document.getElementById("close-promo-btn").onclick = () => {
    if (elPromoModal) elPromoModal.style.display = "none";
  };
}

// --- НАВИГАЦИЯ МЕЖДУ ИГРАМИ (ЛОББИ / КРАШ / СЛОТЫ / МИНЁР / UPGRADE / БАШНЯ / МОНЕТКА / ПЛИНКО) ---
const elViewLobby = document.getElementById("view-lobby");
const elViewCrash = document.getElementById("view-crash");
const elViewSlots = document.getElementById("view-slots");
const elViewMines = document.getElementById("view-mines");
const elViewUpgrade = document.getElementById("view-upgrade");
const elViewTower = document.getElementById("view-tower");
const elViewCoinflip = document.getElementById("view-coinflip");
const elViewPlinko = document.getElementById("view-plinko");
const elViewDice = document.getElementById("view-dice");
const elViewCases = document.getElementById("view-cases");
const elViewPvp = document.getElementById("view-pvp");
const elBackLobbyBtn = document.getElementById("back-lobby-btn");

function switchView(viewName) {
  if (elViewLobby) elViewLobby.style.display = viewName === "lobby" ? "flex" : "none";
  if (elViewCrash) elViewCrash.style.display = viewName === "crash" ? "flex" : "none";
  if (elViewSlots) elViewSlots.style.display = viewName === "slots" ? "flex" : "none";
  if (elViewMines) elViewMines.style.display = viewName === "mines" ? "flex" : "none";
  if (elViewUpgrade) elViewUpgrade.style.display = viewName === "upgrade" ? "flex" : "none";
  if (elViewTower) elViewTower.style.display = viewName === "tower" ? "flex" : "none";
  if (elViewCoinflip) elViewCoinflip.style.display = viewName === "coinflip" ? "flex" : "none";
  if (elViewPlinko) elViewPlinko.style.display = viewName === "plinko" ? "flex" : "none";
  if (elViewDice) elViewDice.style.display = viewName === "dice" ? "flex" : "none";
  if (elViewCases) elViewCases.style.display = viewName === "cases" ? "flex" : "none";
  if (elViewPvp) elViewPvp.style.display = viewName === "pvp" ? "flex" : "none";

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
    } else if (viewName === "coinflip") {
      initCoinflipUI();
    } else if (viewName === "plinko") {
      initPlinkoUI();
    } else if (viewName === "dice") {
      initDiceUI();
    } else if (viewName === "cases") {
      initCasesUI();
    } else if (viewName === "pvp") {
      initPvpUI();
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
if (document.getElementById("card-play-coinflip")) {
  document.getElementById("card-play-coinflip").onclick = () => switchView("coinflip");
}
if (document.getElementById("card-play-plinko")) {
  document.getElementById("card-play-plinko").onclick = () => switchView("plinko");
}
if (document.getElementById("card-play-dice")) {
  document.getElementById("card-play-dice").onclick = () => switchView("dice");
}
if (document.getElementById("card-play-cases")) {
  document.getElementById("card-play-cases").onclick = () => switchView("cases");
}
if (document.getElementById("card-play-pvp")) {
  document.getElementById("card-play-pvp").onclick = () => switchView("pvp");
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
    if (targetTab === "adm-tab-promo" && typeof refreshAdminPromos === "function") {
      refreshAdminPromos();
    }
    if (targetTab === "adm-tab-users" && typeof refreshAdminUsers === "function") {
      refreshAdminUsers();
    }
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
      const coinflipBetsEl = document.getElementById("adm-coinflip-bets-cnt");
      if (coinflipBetsEl) coinflipBetsEl.textContent = `${res.coinflip_bets || 0} ⭐`;
      const plinkoBetsEl = document.getElementById("adm-plinko-bets-cnt");
      if (plinkoBetsEl) plinkoBetsEl.textContent = `${res.plinko_bets || 0} ⭐`;
      const diceBetsEl = document.getElementById("adm-dice-bets-cnt");
      if (diceBetsEl) diceBetsEl.textContent = `${res.dice_bets || 0} ⭐`;
      const casesBetsEl = document.getElementById("adm-cases-bets-cnt");
      if (casesBetsEl) casesBetsEl.textContent = `${res.cases_bets || 0} ⭐`;

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

      // Режим RTP Coinflip
      document.querySelectorAll(".seg-btn-coinflip").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === (res.coinflip_rig_mode || "normal"));
      });

      // Режим RTP Plinko
      document.querySelectorAll(".seg-btn-plinko").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === (res.plinko_rig_mode || "normal"));
      });

      // Режим RTP Dice
      document.querySelectorAll(".seg-btn-dice").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === (res.dice_rig_mode || "normal"));
      });

      // Режим RTP Cases
      document.querySelectorAll(".seg-btn-cases").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === (res.cases_rig_mode || "normal"));
      });

      // Мастер-RTP (если все игры совпадают)
      const masterTag = document.getElementById("adm-master-rtp-tag");
      const upMode = res.upgrade_rig_mode || res.rig_mode;
      const towerMode = res.tower_rig_mode || res.rig_mode;
      const cfMode = res.coinflip_rig_mode || res.rig_mode;
      const plMode = res.plinko_rig_mode || res.rig_mode;
      const dMode = res.dice_rig_mode || res.rig_mode;
      const csMode = res.cases_rig_mode || res.rig_mode;
      if (res.rig_mode === res.slots_rig_mode && res.rig_mode === res.mines_rig_mode && res.rig_mode === upMode && res.rig_mode === towerMode && res.rig_mode === cfMode && res.rig_mode === plMode && res.rig_mode === dMode && res.rig_mode === csMode) {
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
      document.querySelectorAll(".seg-btn-coinflip").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
      document.querySelectorAll(".seg-btn-plinko").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
      const masterTag = document.getElementById("adm-master-rtp-tag");
      if (masterTag) masterTag.textContent = RTP_LABELS[mode] || mode;
      showToast(`⚡ RTP всех игр казино: ${RTP_LABELS[mode] || mode}`);
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

// Админ: Режим RTP Монетки (Coinflip)
document.querySelectorAll(".seg-btn-coinflip").forEach(btn => {
  btn.onclick = async () => {
    const mode = btn.dataset.mode;
    const res = await fetch("/api/admin/coinflip/rig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, mode: mode })
    }).then(r => r.json());
    if (res.ok) {
      document.querySelectorAll(".seg-btn-coinflip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      showToast(`🪙 RTP монетки: ${RTP_LABELS[mode] || mode}`);
    }
  };
});

// Админ: Принудительный исход Монетки (Heads / Tails / Win / Loss / Reset)
document.querySelectorAll(".adm-cf-force-btn").forEach(btn => {
  btn.onclick = async () => {
    const forceType = btn.dataset.force;
    const res = await fetch("/api/admin/coinflip/force", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, force: forceType })
    }).then(r => r.json());
    if (res.ok) {
      const labels = {
        heads: "🦅 След. бросок: 100% ОРЁЛ!",
        tails: "👑 След. бросок: 100% РЕШКА!",
        win: "💎 След. бросок: 100% ПОБЕДА игрока!",
        loss: "💀 След. бросок: 100% СЛИВ игрока!",
        reset: "🎲 Принудительный исход монетки сброшен"
      };
      showToast(labels[forceType] || "Обновлено");
    }
  };
});

// Админ: Режим RTP Плинко (Plinko)
document.querySelectorAll(".seg-btn-plinko").forEach(btn => {
  btn.onclick = async () => {
    const mode = btn.dataset.mode;
    const res = await fetch("/api/admin/plinko/rig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, mode: mode })
    }).then(r => r.json());
    if (res.ok) {
      document.querySelectorAll(".seg-btn-plinko").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      showToast(`🔴 RTP плинко: ${RTP_LABELS[mode] || mode}`);
    }
  };
});

// Админ: Принудительный слот Плинко (0 / 5 / 10 / -1)
document.querySelectorAll(".adm-plinko-force-btn").forEach(btn => {
  btn.onclick = async () => {
    const slot = parseInt(btn.dataset.slot, 10);
    const res = await fetch("/api/admin/plinko/force", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, slot: slot })
    }).then(r => r.json());
    if (res.ok) {
      if (slot >= 0) {
        showToast(`💥 След. шарик Плинко упадет в слот ${slot}!`);
      } else {
        showToast("🎲 Принудительный слот Плинко сброшен");
      }
    }
  };
});

// Админ: Управление промокодами
async function refreshAdminPromos() {
  const listEl = document.getElementById("adm-promo-list");
  if (!listEl) return;
  listEl.innerHTML = '<div class="adm-empty-list">Загрузка промокодов...</div>';

  try {
    const res = await fetch(`/api/admin/promo/list?id=${userId}`).then(r => r.json());
    if (res.ok && res.promos) {
      if (res.promos.length === 0) {
        listEl.innerHTML = '<div class="adm-empty-list">Нет активных промокодов</div>';
        return;
      }
      listEl.innerHTML = "";
      res.promos.forEach(p => {
        const item = document.createElement("div");
        item.className = "adm-promo-item";
        item.innerHTML = `
          <div>
            <span class="adm-promo-code">${escapeHtml(p.code)}</span>
            <span class="adm-promo-meta"> • +${p.reward} ⭐ (${p.activations_count || 0}/${p.max_activations})</span>
          </div>
          <button class="adm-promo-del-btn" data-code="${escapeHtml(p.code)}">✕ Удалить</button>
        `;
        item.querySelector(".adm-promo-del-btn").onclick = async () => {
          await deleteAdminPromo(p.code);
        };
        listEl.appendChild(item);
      });
    }
  } catch (e) {
    listEl.innerHTML = '<div class="adm-empty-list">Ошибка загрузки</div>';
  }
}

async function deleteAdminPromo(code) {
  try {
    const res = await fetch("/api/admin/promo/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, code: code })
    }).then(r => r.json());
    if (res.ok) {
      showToast(`Промокод ${code} удалён`);
      refreshAdminPromos();
    }
  } catch (e) {
    showToast("Ошибка удаления: " + e.message);
  }
}

if (document.getElementById("adm-promo-create-btn")) {
  document.getElementById("adm-promo-create-btn").onclick = async () => {
    const codeInp = document.getElementById("adm-promo-code-input");
    const rewInp = document.getElementById("adm-promo-reward-input");
    const maxInp = document.getElementById("adm-promo-max-input");

    const code = codeInp?.value.trim().toUpperCase();
    const reward = parseInt(rewInp?.value, 10) || 50;
    const maxAct = parseInt(maxInp?.value, 10) || 100;

    if (!code) {
      showToast("Введите код промокода");
      return;
    }

    try {
      const res = await fetch("/api/admin/promo/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userId,
          code: code,
          reward: reward,
          max_activations: maxAct
        })
      }).then(r => r.json());

      if (res.ok) {
        showToast(`🎟️ Промокод ${code} (+${reward} ⭐) создан!`);
        if (codeInp) codeInp.value = "";
        refreshAdminPromos();
      } else {
        showToast(res.error || "Ошибка создания промокода");
      }
    } catch (e) {
      showToast("Ошибка: " + e.message);
    }
  };
}

if (document.getElementById("adm-promo-refresh-btn")) {
  document.getElementById("adm-promo-refresh-btn").onclick = refreshAdminPromos;
}

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
              // Даем боту 500мс обработать successful_payment от Telegram
              await new Promise(r => setTimeout(r, 600));
              const u = await fetch(`/api/user?id=${userId}&name=${encodeURIComponent(userName)}`).then(r => r.json());
              if (u && typeof u.balance === "number") {
                userBalance = u.balance;
                elUserBalance.textContent = userBalance;
              }
            } catch (err) {
              console.error("Balance sync error:", err);
            }
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

// ==================== 🎟️ ПРОМОКОДЫ: АКТИВАЦИЯ ====================
const elPromoSubmitBtn = document.getElementById("promo-submit-btn");
const elPromoInputCode = document.getElementById("promo-input-code");
const elPromoStatusMsg = document.getElementById("promo-status-msg");

async function activatePromoCode() {
  if (!elPromoInputCode) return;
  const code = elPromoInputCode.value.trim().toUpperCase();
  if (!code) {
    showPromoStatus("Введите промокод!", "error");
    return;
  }

  if (elPromoSubmitBtn) elPromoSubmitBtn.disabled = true;

  try {
    const res = await fetch("/api/promo/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, code: code })
    }).then(r => r.json());

    if (elPromoSubmitBtn) elPromoSubmitBtn.disabled = false;

    if (res.ok) {
      userBalance = res.balance;
      elUserBalance.textContent = userBalance;
      playSound("jackpot");
      triggerHaptic("success");
      showPromoStatus(`🎉 Успешно! Вам начислено +${res.reward} ⭐ на баланс!`, "success");
      showToast(`🎟️ Промокод активирован: +${res.reward} ⭐!`);
      elPromoInputCode.value = "";
    } else {
      playSound("crash");
      triggerHaptic("error");
      showPromoStatus(res.error || "Неверный промокод", "error");
    }
  } catch (e) {
    if (elPromoSubmitBtn) elPromoSubmitBtn.disabled = false;
    showPromoStatus("Ошибка сети: " + e.message, "error");
  }
}

function showPromoStatus(msg, type) {
  if (!elPromoStatusMsg) return;
  elPromoStatusMsg.textContent = msg;
  elPromoStatusMsg.className = `promo-status-msg ${type}`;
  elPromoStatusMsg.style.display = "block";
}

if (elPromoSubmitBtn) {
  elPromoSubmitBtn.onclick = activatePromoCode;
}
if (elPromoInputCode) {
  elPromoInputCode.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      activatePromoCode();
    }
  };
}

// ==================== 🪙 ИГРА 6: МОНЕТКА (COINFLIP) ====================
let coinflipBet = 10;
let coinflipChoice = "heads"; // "heads" | "tails"
let coinflipStreak = 0;
let coinflipCurrentPot = 0;
let coinflipFlipping = false;
let coinflipTotalRotation = 0;

const elCoin3d = document.getElementById("coin-3d");
const elCoinflipBetAmount = document.getElementById("coinflip-bet-amount");
const elCoinflipStreakVal = document.getElementById("coinflip-streak-val");
const elCoinflipMultVal = document.getElementById("coinflip-mult-val");
const elCoinflipPotVal = document.getElementById("coinflip-pot-val");
const elCoinflipStatusBadge = document.getElementById("coinflip-status-badge");
const elCoinflipFlipBtn = document.getElementById("coinflip-flip-btn");
const elCoinflipCashoutBtn = document.getElementById("coinflip-cashout-btn");
const elCfBtnPrimary = document.getElementById("cf-btn-primary");
const elCfBtnSub = document.getElementById("cf-btn-sub");
const elCfCashoutVal = document.getElementById("cf-cashout-val");

function updateCoinflipUI() {
  const mult = coinflipStreak === 0 ? 1.0 : Math.round(Math.pow(1.95, coinflipStreak) * 100) / 100;
  const nextMult = Math.round(Math.pow(1.95, coinflipStreak + 1) * 100) / 100;
  const nextWin = Math.floor(coinflipBet * nextMult);

  if (elCoinflipStreakVal) elCoinflipStreakVal.textContent = coinflipStreak;
  if (elCoinflipMultVal) elCoinflipMultVal.textContent = `${mult.toFixed(2)}x`;
  if (elCoinflipPotVal) elCoinflipPotVal.textContent = `${coinflipCurrentPot} ⭐`;

  document.querySelectorAll("#coinflip-series-bar .series-step").forEach((step, idx) => {
    step.classList.toggle("active", idx === Math.min(coinflipStreak, 5));
  });

  if (coinflipStreak > 0) {
    if (elCoinflipCashoutBtn) {
      elCoinflipCashoutBtn.style.display = "block";
      if (elCfCashoutVal) elCfCashoutVal.textContent = `${coinflipCurrentPot} ⭐`;
    }
    if (elCfBtnPrimary) elCfBtnPrimary.textContent = `🪙 СЛЕДУЮЩИЙ БРОСОК (${nextMult.toFixed(2)}x)`;
    if (elCfBtnSub) elCfBtnSub.textContent = `Куш вырастет до ${nextWin} ⭐`;
  } else {
    if (elCoinflipCashoutBtn) elCoinflipCashoutBtn.style.display = "none";
    if (elCfBtnPrimary) elCfBtnPrimary.textContent = "🪙 БРОСИТЬ МОНЕТУ";
    if (elCfBtnSub) elCfBtnSub.textContent = `Ставка ${coinflipBet} ⭐ • Победа ${Math.floor(coinflipBet * 1.95)} ⭐`;
  }
}

function initCoinflipUI() {
  if (elCoinflipBetAmount) {
    let b = parseInt(elCoinflipBetAmount.value, 10);
    if (!isNaN(b) && b > 0) coinflipBet = b;
  }
  updateCoinflipUI();
}

async function playCoinflip() {
  if (coinflipFlipping) return;

  const bet = parseInt(elCoinflipBetAmount.value, 10) || 10;
  if (coinflipStreak === 0) {
    if (bet < 1) {
      showToast("Минимальная ставка 1 ⭐");
      return;
    }
    if (userBalance < bet) {
      showToast("Недостаточно звёзд на балансе!");
      return;
    }
    coinflipBet = bet;
  }

  coinflipFlipping = true;
  if (elCoinflipFlipBtn) elCoinflipFlipBtn.disabled = true;
  if (elCoinflipCashoutBtn) elCoinflipCashoutBtn.disabled = true;
  if (elCoinflipBetAmount) elCoinflipBetAmount.disabled = true;

  try {
    const res = await fetch("/api/coinflip/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: userId,
        bet: coinflipBet,
        choice: coinflipChoice
      })
    }).then(r => r.json());

    if (!res.ok) {
      coinflipFlipping = false;
      if (elCoinflipFlipBtn) elCoinflipFlipBtn.disabled = false;
      if (elCoinflipCashoutBtn) elCoinflipCashoutBtn.disabled = false;
      if (elCoinflipBetAmount) elCoinflipBetAmount.disabled = false;
      showToast(res.error || "Ошибка игры");
      return;
    }

    if (coinflipStreak === 0) {
      userBalance -= coinflipBet;
      elUserBalance.textContent = userBalance;
    }

    playSound("coin_flip");
    triggerHaptic("impact");

    if (elCoinflipStatusBadge) {
      elCoinflipStatusBadge.textContent = "Монета в воздухе...";
    }

    const targetIsHeads = res.outcome === "heads";
    const baseSpins = 1800;
    const targetMod = targetIsHeads ? 0 : 180;
    coinflipTotalRotation += baseSpins + ((targetMod - (coinflipTotalRotation % 360) + 360) % 360);
    if (elCoin3d) {
      elCoin3d.style.transform = `rotateY(${coinflipTotalRotation}deg)`;
    }

    setTimeout(() => {
      coinflipFlipping = false;
      if (elCoinflipFlipBtn) elCoinflipFlipBtn.disabled = false;
      if (elCoinflipCashoutBtn) elCoinflipCashoutBtn.disabled = false;

      if (res.win) {
        playSound("cashout");
        triggerHaptic("success");
        coinflipStreak = res.streak;
        coinflipCurrentPot = res.payout;

        if (elCoinflipStatusBadge) {
          elCoinflipStatusBadge.textContent = `Победа! Серия ${coinflipStreak} 🔥 (${res.outcome === "heads" ? "Орёл" : "Решка"})`;
        }
        updateCoinflipUI();
        showToast(`🎉 Победа! Выпал ${res.outcome === "heads" ? "🦅 ОРЁЛ" : "👑 РЕШКА"}! Серия x${res.multiplier.toFixed(2)}`);
      } else {
        playSound("crash");
        triggerHaptic("error");
        coinflipStreak = 0;
        coinflipCurrentPot = 0;
        userBalance = res.balance;
        elUserBalance.textContent = userBalance;

        if (elCoinflipStatusBadge) {
          elCoinflipStatusBadge.textContent = `Слив! Выпал ${res.outcome === "heads" ? "Орёл" : "Решка"}`;
        }
        if (elCoinflipBetAmount) elCoinflipBetAmount.disabled = false;
        updateCoinflipUI();
        showToast(`💀 Слив! Выпал ${res.outcome === "heads" ? "🦅 ОРЁЛ" : "👑 РЕШКА"}.`);
      }
    }, 2200);

  } catch (e) {
    coinflipFlipping = false;
    if (elCoinflipFlipBtn) elCoinflipFlipBtn.disabled = false;
    if (elCoinflipCashoutBtn) elCoinflipCashoutBtn.disabled = false;
    if (elCoinflipBetAmount) elCoinflipBetAmount.disabled = false;
    showToast("Ошибка сети: " + e.message);
  }
}

async function cashoutCoinflip() {
  if (coinflipFlipping || coinflipStreak === 0) return;
  if (elCoinflipCashoutBtn) elCoinflipCashoutBtn.disabled = true;

  try {
    const res = await fetch("/api/coinflip/cashout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId })
    }).then(r => r.json());

    if (!res.ok) {
      if (elCoinflipCashoutBtn) elCoinflipCashoutBtn.disabled = false;
      showToast(res.error || "Ошибка кэшаута");
      return;
    }

    userBalance = res.balance;
    elUserBalance.textContent = userBalance;
    playSound("jackpot");
    triggerHaptic("success");
    showToast(`💰 Вы забрали куш +${res.win} ⭐ (${res.multiplier.toFixed(2)}x)!`);

    coinflipStreak = 0;
    coinflipCurrentPot = 0;
    if (elCoinflipBetAmount) elCoinflipBetAmount.disabled = false;
    if (elCoinflipStatusBadge) elCoinflipStatusBadge.textContent = "Куш забран!";
    updateCoinflipUI();

  } catch (e) {
    if (elCoinflipCashoutBtn) elCoinflipCashoutBtn.disabled = false;
    showToast("Ошибка сети: " + e.message);
  }
}

if (elCoinflipFlipBtn) elCoinflipFlipBtn.onclick = playCoinflip;
if (elCoinflipCashoutBtn) elCoinflipCashoutBtn.onclick = cashoutCoinflip;

document.getElementById("cf-choice-heads")?.addEventListener("click", () => {
  if (coinflipFlipping) return;
  coinflipChoice = "heads";
  document.getElementById("cf-choice-heads")?.classList.add("active");
  document.getElementById("cf-choice-tails")?.classList.remove("active");
});
document.getElementById("cf-choice-tails")?.addEventListener("click", () => {
  if (coinflipFlipping) return;
  coinflipChoice = "tails";
  document.getElementById("cf-choice-tails")?.classList.add("active");
  document.getElementById("cf-choice-heads")?.classList.remove("active");
});

document.getElementById("coinflip-btn-div2")?.addEventListener("click", () => {
  if (coinflipStreak > 0) return;
  let cur = parseInt(elCoinflipBetAmount.value, 10) || 10;
  elCoinflipBetAmount.value = Math.max(1, Math.floor(cur / 2));
  coinflipBet = parseInt(elCoinflipBetAmount.value, 10);
  updateCoinflipUI();
});
document.getElementById("coinflip-btn-mul2")?.addEventListener("click", () => {
  if (coinflipStreak > 0) return;
  let cur = parseInt(elCoinflipBetAmount.value, 10) || 10;
  elCoinflipBetAmount.value = Math.min(userBalance, cur * 2);
  coinflipBet = parseInt(elCoinflipBetAmount.value, 10);
  updateCoinflipUI();
});
document.getElementById("coinflip-btn-max")?.addEventListener("click", () => {
  if (coinflipStreak > 0) return;
  elCoinflipBetAmount.value = Math.max(1, userBalance);
  coinflipBet = parseInt(elCoinflipBetAmount.value, 10);
  updateCoinflipUI();
});
document.querySelectorAll(".coinflip-chip").forEach(chip => {
  chip.onclick = () => {
    if (coinflipStreak > 0) return;
    const amt = parseInt(chip.dataset.amt, 10);
    elCoinflipBetAmount.value = amt;
    coinflipBet = amt;
    updateCoinflipUI();
  };
});
if (elCoinflipBetAmount) {
  elCoinflipBetAmount.oninput = () => {
    let b = parseInt(elCoinflipBetAmount.value, 10);
    if (!isNaN(b) && b > 0) {
      coinflipBet = b;
      updateCoinflipUI();
    }
  };
}

// ==================== 🔴 ИГРА 7: ПЛИНКО (PLINKO) ====================
let plinkoBet = 10;
let plinkoRisk = "medium";
let plinkoCanvas = null;
let plinkoCtx = null;
let plinkoBalls = [];
let plinkoSlotHighlights = Array(11).fill(0);

const PLINKO_PAYTABLES = {
  low:    [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
  medium: [22.0, 5.0, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5.0, 22.0],
  high:   [110.0, 20.0, 4.0, 1.5, 0.3, 0.2, 0.3, 1.5, 4.0, 20.0, 110.0]
};

const elPlinkoBet = document.getElementById("plinko-bet-amount");
const elPlinkoRiskLabel = document.getElementById("plinko-risk-label");
const elPlinkoMaxWinLabel = document.getElementById("plinko-max-win-label");
const elPlinkoDropBtn = document.getElementById("plinko-drop-btn");
const elPlinkoStatusBadge = document.getElementById("plinko-status-badge");
const elPlinkoBtnPrimary = document.getElementById("plinko-btn-primary");
const elPlinkoBtnSub = document.getElementById("plinko-btn-sub");

function updatePlinkoControls() {
  const mults = PLINKO_PAYTABLES[plinkoRisk];
  const maxMult = mults[0];
  const maxWin = Math.floor(plinkoBet * maxMult);

  const riskTitles = { low: "Низкий", medium: "Средний", high: "Высокий" };
  if (elPlinkoRiskLabel) elPlinkoRiskLabel.textContent = riskTitles[plinkoRisk];
  if (elPlinkoMaxWinLabel) elPlinkoMaxWinLabel.textContent = `${maxMult.toFixed(1)}x (${maxWin} ⭐)`;
  if (elPlinkoBtnSub) elPlinkoBtnSub.textContent = `Ставка ${plinkoBet} ⭐`;
}

function initPlinkoUI() {
  plinkoCanvas = document.getElementById("plinko-canvas");
  if (plinkoCanvas) {
    plinkoCtx = plinkoCanvas.getContext("2d");
  }
  if (elPlinkoBet) {
    let b = parseInt(elPlinkoBet.value, 10);
    if (!isNaN(b) && b > 0) plinkoBet = b;
  }
  updatePlinkoControls();
  drawPlinkoBoard();
}

const PLINKO_ROWS = 10;
function getPlinkoPegs() {
  if (!plinkoCanvas) return [];
  const W = plinkoCanvas.width;
  const H = plinkoCanvas.height;
  const startY = 40;
  const endY = H - 65;
  const rowSpacing = (endY - startY) / PLINKO_ROWS;
  const pegs = [];

  for (let r = 0; r <= PLINKO_ROWS; r++) {
    const pinsInRow = r + 3;
    const y = startY + r * rowSpacing;
    const pinSpacing = Math.min(28, (W - 40) / (PLINKO_ROWS + 3));
    const startX = (W / 2) - ((pinsInRow - 1) * pinSpacing) / 2;

    for (let c = 0; c < pinsInRow; c++) {
      pegs.push({
        x: startX + c * pinSpacing,
        y: y,
        r: r,
        c: c
      });
    }
  }
  return pegs;
}

function drawPlinkoBoard() {
  if (!plinkoCanvas || !plinkoCtx) return;
  const ctx = plinkoCtx;
  const W = plinkoCanvas.width;
  const H = plinkoCanvas.height;

  ctx.fillStyle = "#0c0e17";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  const pegs = getPlinkoPegs();
  pegs.forEach(peg => {
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#cbd5e1";
    ctx.shadowColor = "rgba(255, 255, 255, 0.35)";
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  const mults = PLINKO_PAYTABLES[plinkoRisk];
  const slotCount = 11;
  const slotWidth = (W - 20) / slotCount;
  const slotY = H - 42;
  const slotH = 34;

  for (let i = 0; i < slotCount; i++) {
    const x = 10 + i * slotWidth;
    const mult = mults[i];
    const highlight = plinkoSlotHighlights[i];

    const distFromCenter = Math.abs(i - 5) / 5;
    let baseColor = "#10b981";
    if (distFromCenter > 0.7) baseColor = "#ef4444";
    else if (distFromCenter > 0.4) baseColor = "#f59e0b";
    else if (distFromCenter > 0.15) baseColor = "#eab308";

    ctx.save();
    ctx.fillStyle = highlight > 0 ? "#ffffff" : baseColor;
    if (highlight > 0) {
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = 15 * highlight;
    }
    ctx.beginPath();
    ctx.roundRect(x + 1, slotY, slotWidth - 2, slotH, 5);
    ctx.fill();

    ctx.fillStyle = "#000";
    ctx.font = "bold 9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = mult >= 10 ? `${mult.toFixed(0)}x` : `${mult.toFixed(1)}x`;
    ctx.fillText(label, x + slotWidth / 2, slotY + slotH / 2);
    ctx.restore();

    if (plinkoSlotHighlights[i] > 0) {
      plinkoSlotHighlights[i] = Math.max(0, plinkoSlotHighlights[i] - 0.04);
    }
  }

  for (let i = plinkoBalls.length - 1; i >= 0; i--) {
    const b = plinkoBalls[i];
    b.update();
    b.draw(ctx);
    if (b.done) {
      plinkoBalls.splice(i, 1);
    }
  }
}

class PlinkoBall {
  constructor(path, targetSlot, payout, multiplier) {
    this.path = path;
    this.targetSlot = targetSlot;
    this.payout = payout;
    this.multiplier = multiplier;
    this.stepIndex = 0;
    this.stepProgress = 0;
    this.done = false;

    const W = plinkoCanvas.width;
    const startY = 40;
    const endY = plinkoCanvas.height - 65;
    const rowSpacing = (endY - startY) / PLINKO_ROWS;
    const pinSpacing = Math.min(28, (W - 40) / (PLINKO_ROWS + 3));

    this.points = [{ x: W / 2, y: 15 }];
    let col = 1;

    for (let r = 0; r < path.length; r++) {
      const pinsInRow = r + 3;
      const startX = (W / 2) - ((pinsInRow - 1) * pinSpacing) / 2;
      const turn = path[r];
      if (turn === 1) col++;
      const pegX = startX + (col - 1) * pinSpacing;
      const pegY = startY + r * rowSpacing;

      this.points.push({
        x: pegX + (Math.random() * 2 - 1),
        y: pegY,
        isPeg: true
      });
    }

    const slotCount = 11;
    const slotWidth = (W - 20) / slotCount;
    const finalX = 10 + targetSlot * slotWidth + slotWidth / 2;
    this.points.push({ x: finalX, y: plinkoCanvas.height - 25, isSlot: true });

    this.x = this.points[0].x;
    this.y = this.points[0].y;
  }

  update() {
    if (this.done) return;

    this.stepProgress += 0.085;
    if (this.stepProgress >= 1) {
      this.stepProgress = 0;
      this.stepIndex++;

      if (this.stepIndex < this.points.length) {
        const pt = this.points[this.stepIndex];
        if (pt.isPeg) {
          playSound("plinko_peg");
          triggerHaptic("impact");
        }
      } else {
        this.done = true;
        plinkoSlotHighlights[this.targetSlot] = 1.0;

        if (this.multiplier >= 10) {
          playSound("jackpot");
          triggerHaptic("success");
        } else if (this.multiplier >= 1.5) {
          playSound("cashout");
          triggerHaptic("success");
        }

        if (elPlinkoStatusBadge) {
          elPlinkoStatusBadge.textContent = `Куш ${this.multiplier.toFixed(1)}x (+${this.payout} ⭐)!`;
        }
        showToast(`🔴 Шарик попал в ${this.multiplier.toFixed(1)}x: +${this.payout} ⭐!`);
        return;
      }
    }

    const p0 = this.points[this.stepIndex];
    const p1 = this.points[Math.min(this.stepIndex + 1, this.points.length - 1)];

    const t = this.stepProgress;
    this.x = p0.x + (p1.x - p0.x) * t;
    this.y = p0.y + (p1.y - p0.y) * (t * t);
  }

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ff3366";
    ctx.shadowColor = "#ff3366";
    ctx.shadowBlur = 10;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x - 1.5, this.y - 1.5, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
  }
}

let plinkoAnimId = null;
function runPlinkoLoop() {
  drawPlinkoBoard();
  if (plinkoBalls.length > 0 || plinkoSlotHighlights.some(h => h > 0)) {
    plinkoAnimId = requestAnimationFrame(runPlinkoLoop);
  } else {
    plinkoAnimId = null;
  }
}

async function dropPlinkoBall() {
  const bet = parseInt(elPlinkoBet.value, 10) || 10;
  if (bet < 1) {
    showToast("Минимальная ставка 1 ⭐");
    return;
  }
  if (userBalance < bet) {
    showToast("Недостаточно звёзд на балансе!");
    return;
  }

  plinkoBet = bet;
  if (elPlinkoDropBtn) elPlinkoDropBtn.disabled = true;

  try {
    const res = await fetch("/api/plinko/drop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: userId,
        bet: plinkoBet,
        risk: plinkoRisk
      })
    }).then(r => r.json());

    if (elPlinkoDropBtn) elPlinkoDropBtn.disabled = false;

    if (!res.ok) {
      showToast(res.error || "Ошибка пуска шарика");
      return;
    }

    userBalance = res.balance;
    elUserBalance.textContent = userBalance;

    if (elPlinkoStatusBadge) {
      elPlinkoStatusBadge.textContent = "Шарик летит сквозь препятствия...";
    }

    const ball = new PlinkoBall(res.path, res.slot_index, res.payout, res.multiplier);
    plinkoBalls.push(ball);

    if (!plinkoAnimId) {
      plinkoAnimId = requestAnimationFrame(runPlinkoLoop);
    }

  } catch (e) {
    if (elPlinkoDropBtn) elPlinkoDropBtn.disabled = false;
    showToast("Ошибка сети: " + e.message);
  }
}

if (elPlinkoDropBtn) {
  elPlinkoDropBtn.onclick = dropPlinkoBall;
}

document.querySelectorAll(".p-risk-chip").forEach(chip => {
  chip.onclick = () => {
    document.querySelectorAll(".p-risk-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    plinkoRisk = chip.dataset.risk;
    updatePlinkoControls();
    drawPlinkoBoard();
  };
});

document.getElementById("plinko-btn-div2")?.addEventListener("click", () => {
  let cur = parseInt(elPlinkoBet.value, 10) || 10;
  elPlinkoBet.value = Math.max(1, Math.floor(cur / 2));
  plinkoBet = parseInt(elPlinkoBet.value, 10);
  updatePlinkoControls();
});
document.getElementById("plinko-btn-mul2")?.addEventListener("click", () => {
  let cur = parseInt(elPlinkoBet.value, 10) || 10;
  elPlinkoBet.value = Math.min(userBalance, cur * 2);
  plinkoBet = parseInt(elPlinkoBet.value, 10);
  updatePlinkoControls();
});
document.getElementById("plinko-btn-max")?.addEventListener("click", () => {
  elPlinkoBet.value = Math.max(1, userBalance);
  plinkoBet = parseInt(elPlinkoBet.value, 10);
  updatePlinkoControls();
});
document.querySelectorAll(".plinko-chip").forEach(chip => {
  chip.onclick = () => {
    const amt = parseInt(chip.dataset.amt, 10);
    elPlinkoBet.value = amt;
    plinkoBet = amt;
    updatePlinkoControls();
  };
});
if (elPlinkoBet) {
  elPlinkoBet.oninput = () => {
    let b = parseInt(elPlinkoBet.value, 10);
    if (!isNaN(b) && b > 0) {
      plinkoBet = b;
      updatePlinkoControls();
    }
  };
}

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
      } else if (g.includes("coinflip") || g.includes("монет")) {
        gameIcon = "🪙";
        gameName = "Монетка";
      } else if (g.includes("plinko") || g.includes("плинко")) {
        gameIcon = "🔴";
        gameName = "Плинко";
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

// ==================== РЕФЕРАЛЬНАЯ СИСТЕМА ====================
const elReferralsModal = document.getElementById("referrals-modal");
const elOpenReferralsBtn = document.getElementById("open-referrals-btn");
const elCloseReferralsBtn = document.getElementById("close-referrals-btn");
const elRefCountVal = document.getElementById("ref-count-val");
const elRefEarnedVal = document.getElementById("ref-earned-val");
const elRefLinkInput = document.getElementById("ref-link-input");
const elRefCopyBtn = document.getElementById("ref-copy-btn");
const elRefShareBtn = document.getElementById("ref-share-btn");
const elRefFriendsList = document.getElementById("ref-friends-list");

function getReferralLink() {
  const botUser = "OnyxCasino_bot";
  return `https://t.me/${botUser}?start=ref_${userId}`;
}

async function loadReferralsData() {
  if (elRefLinkInput) elRefLinkInput.value = getReferralLink();
  try {
    const res = await fetch(`/api/referrals?id=${userId}`).then(r => r.json());
    if (res.ok) {
      if (elRefCountVal) elRefCountVal.textContent = res.referrals_count;
      if (elRefEarnedVal) elRefEarnedVal.textContent = `${res.total_earned} ⭐`;

      if (elRefFriendsList) {
        if (!res.friends || res.friends.length === 0) {
          elRefFriendsList.innerHTML = `<div class="ref-empty-state">У вас пока нет приглашённых друзей</div>`;
        } else {
          elRefFriendsList.innerHTML = res.friends.map(f => `
            <div class="adm-promo-item">
              <span class="adm-promo-code">@${escapeHtml(f.username || "Игрок")}</span>
              <span class="adm-promo-meta">+${f.reward_earned} ⭐</span>
            </div>
          `).join("");
        }
      }
    }
  } catch (e) {
    console.error("Referrals load error:", e);
  }
}

function initReferrals() {
  if (elOpenReferralsBtn) {
    elOpenReferralsBtn.onclick = () => {
      if (elReferralsModal) elReferralsModal.style.display = "flex";
      loadReferralsData();
    };
  }

  if (elCloseReferralsBtn) {
    elCloseReferralsBtn.onclick = () => {
      if (elReferralsModal) elReferralsModal.style.display = "none";
    };
  }

  if (elRefCopyBtn) {
    elRefCopyBtn.onclick = () => {
      const link = getReferralLink();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => {
          showToast("Ссылка-приглашение скопирована! 📋");
        }).catch(() => {
          if (elRefLinkInput) {
            elRefLinkInput.select();
            document.execCommand("copy");
            showToast("Ссылка-приглашение скопирована! 📋");
          }
        });
      } else if (elRefLinkInput) {
        elRefLinkInput.select();
        document.execCommand("copy");
        showToast("Ссылка-приглашение скопирована! 📋");
      }
    };
  }

  if (elRefShareBtn) {
    elRefShareBtn.onclick = () => {
      const link = getReferralLink();
      const shareText = "🎰 Заходи в Onyx Casino! Играй в Ракету, Слоты 777, Минёр, Кости и Кейсы со звездами Telegram Stars! 🚀⭐";
      const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`;
      window.open(tgUrl, "_blank");
    };
  }
}

// ==================== АДМИНКА: УПРАВЛЕНИЕ ИГРОКАМИ (БАНЫ / БАЛАНС) ====================
const elAdmUsersList = document.getElementById("adm-users-list");
const elAdmUsersSearchInput = document.getElementById("adm-users-search-input");
const elAdmUsersSearchBtn = document.getElementById("adm-users-search-btn");
const elAdmUsersRefreshBtn = document.getElementById("adm-users-refresh-btn");

async function refreshAdminUsers(search = "") {
  if (!elAdmUsersList) return;
  elAdmUsersList.innerHTML = `<div class="adm-empty-list">Загрузка игроков...</div>`;

  try {
    const q = search || (elAdmUsersSearchInput ? elAdmUsersSearchInput.value.trim() : "");
    const res = await fetch(`/api/admin/users/list?id=${userId}&search=${encodeURIComponent(q)}`).then(r => r.json());
    if (res.ok) {
      if (!res.users || res.users.length === 0) {
        elAdmUsersList.innerHTML = `<div class="adm-empty-list">Игроки не найдены</div>`;
        return;
      }

      elAdmUsersList.innerHTML = res.users.map(u => {
        const isBanned = !!u.is_banned;
        return `
          <div class="adm-user-row ${isBanned ? "banned" : ""}" data-uid="${u.user_id}">
            <div class="adm-user-header">
              <div>
                <span class="adm-user-name">${escapeHtml(u.username || "Игрок")}</span>
                <span class="adm-user-id">#${u.user_id}</span>
              </div>
              ${isBanned ? '<span class="adm-user-banned-tag">ЗАБАНЕН</span>' : '<span style="color:#10b981;font-size:11px;font-weight:700;">🟢 Активен</span>'}
            </div>
            <div class="adm-user-details">
              <span>Баланс: <b class="adm-user-bal">${u.balance} ⭐</b></span>
              <span>Ставок: ${u.total_bet || 0} ⭐ • Выиграно: ${u.total_won || 0} ⭐</span>
            </div>
            <div class="adm-user-actions-bar">
              <input type="number" class="adm-user-new-bal" placeholder="Новый баланс" min="0" step="1" value="${u.balance}">
              <button class="adm-set-bal-btn" onclick="adminSetUserBalance(${u.user_id}, this)">Задать ⭐</button>
              ${isBanned 
                ? `<button class="adm-unban-btn" onclick="adminToggleUserBan(${u.user_id}, false)">🟢 Разбанить</button>`
                : `<button class="adm-ban-btn" onclick="adminToggleUserBan(${u.user_id}, true)">🚫 Бан</button>`}
            </div>
          </div>
        `;
      }).join("");
    } else {
      elAdmUsersList.innerHTML = `<div class="adm-empty-list" style="color:#ef4444;">${res.error || "Ошибка загрузки"}</div>`;
    }
  } catch (err) {
    elAdmUsersList.innerHTML = `<div class="adm-empty-list" style="color:#ef4444;">Ошибка: ${err.message}</div>`;
  }
}

async function adminToggleUserBan(targetId, ban) {
  try {
    const res = await fetch("/api/admin/users/ban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_id: userId, target_id: targetId, ban: ban })
    }).then(r => r.json());

    if (res.ok) {
      showToast(ban ? `Игрок #${targetId} заблокирован!` : `Игрок #${targetId} разблокирован!`);
      refreshAdminUsers();
    } else {
      showToast(res.error || "Ошибка изменения статуса");
    }
  } catch (e) {
    showToast("Ошибка: " + e.message);
  }
}

async function adminSetUserBalance(targetId, btnEl) {
  const row = btnEl.closest(".adm-user-row");
  const input = row ? row.querySelector(".adm-user-new-bal") : null;
  if (!input) return;
  const newBal = parseInt(input.value, 10);
  if (isNaN(newBal) || newBal < 0) {
    showToast("Введите корректный баланс");
    return;
  }

  try {
    const res = await fetch("/api/admin/set_balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_id: userId, target_id: targetId, balance: newBal })
    }).then(r => r.json());

    if (res.ok) {
      showToast(`Баланс игрока #${targetId} установлен на ${res.balance} ⭐`);
      refreshAdminUsers();
      if (targetId === Number(userId)) {
        userBalance = res.balance;
        elUserBalance.textContent = userBalance;
      }
    } else {
      showToast(res.error || "Ошибка изменения баланса");
    }
  } catch (e) {
    showToast("Ошибка: " + e.message);
  }
}

// ==================== АДМИНКА: КОСТИ И КЕЙСЫ ====================
function initAdminDiceAndCases() {
  if (elAdmUsersSearchBtn) {
    elAdmUsersSearchBtn.onclick = () => refreshAdminUsers();
  }
  if (elAdmUsersRefreshBtn) {
    elAdmUsersRefreshBtn.onclick = () => refreshAdminUsers();
  }

  // Принудительный исход Костей
  document.querySelectorAll(".adm-dice-force-btn").forEach(btn => {
    btn.onclick = async () => {
      const outcome = btn.dataset.outcome === "reset" ? null : btn.dataset.outcome;
      try {
        const res = await fetch("/api/admin/dice/force", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: userId, outcome: outcome })
        }).then(r => r.json());
        if (res.ok) {
          showToast(outcome ? `Кости: следующий исход '${outcome}'!` : "Кости: принудительный исход сброшен");
        }
      } catch (e) { showToast("Ошибка: " + e.message); }
    };
  });

  // RTP Костей
  document.querySelectorAll(".seg-btn-dice").forEach(btn => {
    btn.onclick = async () => {
      const mode = btn.dataset.mode;
      try {
        const res = await fetch("/api/admin/dice/rig", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: userId, mode: mode })
        }).then(r => r.json());
        if (res.ok) {
          document.querySelectorAll(".seg-btn-dice").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
          const tag = document.getElementById("adm-dice-rtp-tag");
          if (tag) tag.textContent = RTP_LABELS[mode] || mode;
          showToast(`Кости: режим RTP '${mode}' сохранён!`);
        }
      } catch (e) { showToast("Ошибка: " + e.message); }
    };
  });

  // Принудительный исход Кейсов
  document.querySelectorAll(".adm-cases-force-btn").forEach(btn => {
    btn.onclick = async () => {
      const item = btn.dataset.item === "reset" ? null : btn.dataset.item;
      try {
        const res = await fetch("/api/admin/cases/force", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: userId, item_id: item })
        }).then(r => r.json());
        if (res.ok) {
          showToast(item ? `Кейсы: следующий дроп ID '${item}'!` : "Кейсы: принудительный дроп сброшен");
        }
      } catch (e) { showToast("Ошибка: " + e.message); }
    };
  });

  // RTP Кейсов
  document.querySelectorAll(".seg-btn-cases").forEach(btn => {
    btn.onclick = async () => {
      const mode = btn.dataset.mode;
      try {
        const res = await fetch("/api/admin/cases/rig", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: userId, mode: mode })
        }).then(r => r.json());
        if (res.ok) {
          document.querySelectorAll(".seg-btn-cases").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
          const tag = document.getElementById("adm-cases-rtp-tag");
          if (tag) tag.textContent = RTP_LABELS[mode] || mode;
          showToast(`Кейсы: режим RTP '${mode}' сохранён!`);
        }
      } catch (e) { showToast("Ошибка: " + e.message); }
    };
  });
}

// ==================== ИГРА 8: КОСТИ (DICE 1-100) ====================
let diceCondition = "under";
let diceTarget = 50.0;
let diceBet = 10;
let isDiceRolling = false;

function calcDiceMultiplier(winChance) {
  winChance = Math.max(1.0, Math.min(95.0, winChance));
  return Number((97.0 / winChance).toFixed(2));
}

function updateDiceUI() {
  const elSlider = document.getElementById("dice-slider");
  const elUnderVal = document.getElementById("dice-target-under-val");
  const elOverVal = document.getElementById("dice-target-over-val");
  const elMultLabel = document.getElementById("dice-mult-label");
  const elChanceLabel = document.getElementById("dice-chance-label");
  const elPayoutLabel = document.getElementById("dice-payout-label");

  if (elSlider) diceTarget = parseFloat(elSlider.value);
  if (elUnderVal) elUnderVal.textContent = diceTarget.toFixed(2);
  if (elOverVal) elOverVal.textContent = diceTarget.toFixed(2);

  let winChance = diceCondition === "under" ? diceTarget : (100.0 - diceTarget);
  winChance = Math.max(1.0, Math.min(95.0, winChance));
  const mult = calcDiceMultiplier(winChance);
  const payout = Math.floor(diceBet * mult);

  if (elChanceLabel) elChanceLabel.textContent = `${winChance.toFixed(2)}%`;
  if (elMultLabel) elMultLabel.textContent = `${mult.toFixed(2)}x`;
  if (elPayoutLabel) elPayoutLabel.textContent = `${payout} ⭐`;

  // Подсветка ползунка
  if (elSlider) {
    const pct = ((diceTarget - 1) / (95 - 1)) * 100;
    if (diceCondition === "under") {
      elSlider.style.background = `linear-gradient(to right, #10b981 0%, #10b981 ${pct}%, #ef4444 ${pct}%, #ef4444 100%)`;
    } else {
      elSlider.style.background = `linear-gradient(to right, #ef4444 0%, #ef4444 ${pct}%, #10b981 ${pct}%, #10b981 100%)`;
    }
  }
}

function initDiceUI() {
  const elSlider = document.getElementById("dice-slider");
  const elBetInput = document.getElementById("dice-bet-amount");
  const elRollBtn = document.getElementById("dice-roll-btn");
  const elCondUnder = document.getElementById("dice-cond-under");
  const elCondOver = document.getElementById("dice-cond-over");

  if (elSlider) {
    elSlider.oninput = () => updateDiceUI();
  }

  if (elBetInput) {
    elBetInput.oninput = () => {
      diceBet = Math.max(1, parseInt(elBetInput.value || "1", 10));
      updateDiceUI();
    };
  }

  if (elCondUnder && elCondOver) {
    elCondUnder.onclick = () => {
      diceCondition = "under";
      elCondUnder.classList.add("active");
      elCondOver.classList.remove("active");
      updateDiceUI();
    };
    elCondOver.onclick = () => {
      diceCondition = "over";
      elCondOver.classList.add("active");
      elCondUnder.classList.remove("active");
      updateDiceUI();
    };
  }

  // Фишки
  document.querySelectorAll(".dice-chip").forEach(chip => {
    chip.onclick = () => {
      diceBet = parseInt(chip.dataset.amt, 10);
      if (elBetInput) elBetInput.value = diceBet;
      updateDiceUI();
    };
  });

  const bDiv2 = document.getElementById("dice-btn-div2");
  if (bDiv2) bDiv2.onclick = () => {
    diceBet = Math.max(1, Math.floor(diceBet / 2));
    if (elBetInput) elBetInput.value = diceBet;
    updateDiceUI();
  };
  const bMul2 = document.getElementById("dice-btn-mul2");
  if (bMul2) bMul2.onclick = () => {
    diceBet = Math.min(userBalance || 100000, diceBet * 2);
    if (elBetInput) elBetInput.value = diceBet;
    updateDiceUI();
  };
  const bMax = document.getElementById("dice-btn-max");
  if (bMax) bMax.onclick = () => {
    diceBet = Math.max(1, userBalance);
    if (elBetInput) elBetInput.value = diceBet;
    updateDiceUI();
  };

  if (elRollBtn) {
    elRollBtn.onclick = async () => {
      if (isDiceRolling) return;
      if (userBalance < diceBet) {
        showToast("Недостаточно звёзд на балансе!");
        return;
      }

      isDiceRolling = true;
      elRollBtn.disabled = true;

      const elNum = document.getElementById("dice-result-number");
      const elStatus = document.getElementById("dice-result-status");
      const elBox = document.getElementById("dice-display-box");
      if (elBox) elBox.className = "dice-display-box";
      if (elStatus) elStatus.textContent = "Бросок костей...";

      // Быстрая анимация счетчика
      const rollInterval = setInterval(() => {
        if (elNum) elNum.textContent = (Math.random() * 99.99).toFixed(2);
      }, 50);

      playSound("beep");

      try {
        const res = await fetch("/api/dice/roll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: userId,
            bet: diceBet,
            target: diceTarget,
            condition: diceCondition
          })
        }).then(r => r.json());

        setTimeout(() => {
          clearInterval(rollInterval);
          isDiceRolling = false;
          elRollBtn.disabled = false;

          if (!res.ok) {
            showToast(res.error || "Ошибка броска");
            if (elStatus) elStatus.textContent = "Ошибка";
            return;
          }

          userBalance = res.balance;
          elUserBalance.textContent = userBalance;

          if (elNum) elNum.textContent = res.roll.toFixed(2);

          if (res.win) {
            playSound("cashout");
            if (elBox) elBox.classList.add("win");
            if (elStatus) elStatus.textContent = `ВЫИГРЫШ! +${res.payout} ⭐ (${res.multiplier}x)`;
            showToast(`🎉 Победа! Вы выиграли ${res.payout} ⭐!`);
          } else {
            playSound("crash");
            if (elBox) elBox.classList.add("loss");
            if (elStatus) elStatus.textContent = "Не повезло, попробуйте еще раз!";
          }
        }, 600);
      } catch (err) {
        clearInterval(rollInterval);
        isDiceRolling = false;
        elRollBtn.disabled = false;
        showToast("Ошибка сети: " + err.message);
      }
    };
  }

  updateDiceUI();
}

// ==================== ИГРА 9: КЕЙСЫ (CASES / ЛУТБОКСЫ) ====================
let casesCatalog = null;
let activeCaseId = "novice";
let isCaseOpening = false;

async function loadCasesCatalog() {
  try {
    const res = await fetch("/api/cases/list").then(r => r.json());
    if (res.ok) {
      casesCatalog = res.cases;
      renderActiveCase();
    }
  } catch (e) {
    console.error("Cases catalog error:", e);
  }
}

function renderActiveCase() {
  if (!casesCatalog) return;
  const c = casesCatalog[activeCaseId];
  if (!c) return;

  const elBtn = document.getElementById("case-open-btn");
  const elOpenText = document.getElementById("case-open-text");
  if (elOpenText) elOpenText.textContent = `ОТКРЫТЬ ЗА ${c.cost} ⭐`;

  const elGrid = document.getElementById("case-items-grid");
  if (elGrid) {
    elGrid.innerHTML = c.items.map(it => `
      <div class="case-preview-item" style="--item-color: ${it.color};">
        <span class="cp-icon">${it.icon}</span>
        <span class="cp-name">${escapeHtml(it.name)}</span>
        <span class="cp-amount">${it.amount} ⭐</span>
      </div>
    `).join("");
  }

  // Заполняем начальную ленту рулетки
  const track = document.getElementById("roulette-track");
  if (track) {
    track.style.transition = "none";
    track.style.transform = "translateX(0px)";
    const initialItems = [];
    for (let i = 0; i < 35; i++) {
      initialItems.push(c.items[i % c.items.length]);
    }
    track.innerHTML = initialItems.map(it => `
      <div class="roulette-item-card" style="--item-color: ${it.color};">
        <span class="r-item-icon">${it.icon}</span>
        <span class="r-item-name">${escapeHtml(it.name)}</span>
        <span class="r-item-amount">${it.amount} ⭐</span>
      </div>
    `).join("");
  }
}

function initCasesUI() {
  loadCasesCatalog();

  document.querySelectorAll(".case-select-tab").forEach(tab => {
    tab.onclick = () => {
      if (isCaseOpening) return;
      document.querySelectorAll(".case-select-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activeCaseId = tab.dataset.case;
      renderActiveCase();
    };
  });

  const elOpenBtn = document.getElementById("case-open-btn");
  if (elOpenBtn) {
    elOpenBtn.onclick = async () => {
      if (isCaseOpening) return;
      if (!casesCatalog || !casesCatalog[activeCaseId]) return;

      const cost = casesCatalog[activeCaseId].cost;
      if (userBalance < cost) {
        showToast(`Недостаточно звёзд! Нужно ${cost} ⭐`);
        return;
      }

      isCaseOpening = true;
      elOpenBtn.disabled = true;

      try {
        const res = await fetch("/api/cases/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: userId, case_id: activeCaseId })
        }).then(r => r.json());

        if (!res.ok) {
          showToast(res.error || "Ошибка открытия кейса");
          isCaseOpening = false;
          elOpenBtn.disabled = false;
          return;
        }

        const reel = res.reel || [];
        const winIdx = 30; // Выигрышный индекс в ленте
        const track = document.getElementById("roulette-track");
        const container = document.querySelector(".cases-roulette-container");

        if (track && container) {
          track.style.transition = "none";
          track.style.transform = "translateX(0px)";

          // Отрисовываем серверную ленту
          track.innerHTML = reel.map(it => `
            <div class="roulette-item-card" style="--item-color: ${it.color};">
              <span class="r-item-icon">${it.icon}</span>
              <span class="r-item-name">${escapeHtml(it.name)}</span>
              <span class="r-item-amount">${it.amount} ⭐</span>
            </div>
          `).join("");

          void track.offsetWidth; // Force reflow

          const cardWidth = 90;
          const containerWidth = container.offsetWidth;
          // Центрируем выигрышный элемент точно под маркером с небольшим разбросом
          const randomOffset = (Math.random() - 0.5) * 35;
          const targetTranslate = - (winIdx * cardWidth - (containerWidth / 2) + (cardWidth / 2) + randomOffset);

          track.style.transition = "transform 5.5s cubic-bezier(0.12, 0.8, 0.2, 1)";
          track.style.transform = `translateX(${targetTranslate}px)`;

          playSound("reel_stop");

          setTimeout(() => {
            isCaseOpening = false;
            elOpenBtn.disabled = false;
            userBalance = res.balance;
            elUserBalance.textContent = userBalance;

            const won = res.won_item;
            if (won.rarity === "legendary" || won.rarity === "epic") {
              playSound("jackpot");
            } else {
              playSound("cashout");
            }
            showToast(`🎁 Вы открыли ${res.case.name}: выигрыш ${won.name} (+${won.amount} ⭐)!`);
          }, 5600);
        }
      } catch (err) {
        isCaseOpening = false;
        elOpenBtn.disabled = false;
        showToast("Ошибка сети: " + err.message);
      }
    };
  }
}

// ==================== ИГРА 10: PvP ДУЭЛИ (1v1) ====================
let pvpSelectedSide = "heads";
let isPvPPlaying = false;

async function refreshPvPDuels() {
  const elList = document.getElementById("pvp-duels-list");
  const elCount = document.getElementById("pvp-open-count");
  if (!elList) return;

  try {
    const res = await fetch("/api/pvp/list").then(r => r.json());
    if (res.ok) {
      const duels = res.duels || [];
      if (elCount) elCount.textContent = `${duels.length} лобби`;

      if (duels.length === 0) {
        elList.innerHTML = `<div class="pvp-empty-msg">Пока нет открытых дуэлей. Создайте первую!</div>`;
        return;
      }

      elList.innerHTML = duels.map(d => {
        const isMy = d.creator_id === Number(userId);
        const choiceText = d.choice === "heads" ? "🦅 Орёл" : "🪙 Решка";
        return `
          <div class="pvp-duel-item" data-duel-id="${d.id}">
            <div class="pvp-duel-info">
              <span class="pvp-duel-creator">${escapeHtml(d.creator_name)} ${isMy ? "(Вы)" : ""}</span>
              <span class="pvp-duel-meta">Ставка: <b>${d.bet} ⭐</b> • Сторона: ${choiceText}</span>
            </div>
            ${isMy 
              ? `<button class="pvp-cancel-btn" onclick="cancelPvPDuel(${d.id})">Отменить</button>`
              : `<button class="pvp-join-btn" onclick="joinPvPDuel(${d.id})">Сразиться (${d.bet} ⭐)</button>`}
          </div>
        `;
      }).join("");
    }
  } catch (e) {
    console.error("PvP list error:", e);
  }
}

async function cancelPvPDuel(duelId) {
  try {
    const res = await fetch("/api/pvp/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, duel_id: duelId })
    }).then(r => r.json());
    if (res.ok) {
      showToast("Дуэль отменена, ставка возвращена! ⭐");
      userBalance = res.balance;
      elUserBalance.textContent = userBalance;
      refreshPvPDuels();
    } else {
      showToast(res.error || "Не удалось отменить");
    }
  } catch (e) { showToast("Ошибка: " + e.message); }
}

async function joinPvPDuel(duelId) {
  if (isPvPPlaying) return;
  isPvPPlaying = true;

  const elArena = document.getElementById("pvp-arena-card");
  const elCoin = document.getElementById("pvp-coin-disc");
  const elMsg = document.getElementById("pvp-result-msg");

  if (elArena) elArena.style.display = "block";
  if (elMsg) elMsg.textContent = "Бросок монеты...";
  if (elCoin) elCoin.classList.add("flipping");
  playSound("coin_flip");

  try {
    const res = await fetch("/api/pvp/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, duel_id: duelId })
    }).then(r => r.json());

    setTimeout(() => {
      if (elCoin) elCoin.classList.remove("flipping");
      isPvPPlaying = false;

      if (!res.ok) {
        showToast(res.error || "Ошибка участия в дуэли");
        if (elArena) elArena.style.display = "none";
        return;
      }

      const outcomeSym = res.outcome === "heads" ? "🦅" : "🪙";
      if (elCoin) elCoin.textContent = outcomeSym;

      const isWinner = res.winner_id === Number(userId);
      userBalance = res.balance;
      elUserBalance.textContent = userBalance;

      if (isWinner) {
        playSound("jackpot");
        if (elMsg) elMsg.textContent = `🏆 ВЫ ПОБЕДИЛИ! Куш: +${res.prize} ⭐!`;
        showToast(`🎉 Вы выиграли дуэль! +${res.prize} ⭐!`);
      } else {
        playSound("crash");
        if (elMsg) elMsg.textContent = `💀 Победил ${escapeHtml(res.winner_name)}!`;
        showToast(`Вы проиграли дуэль. Победил ${res.winner_name}`);
      }

      refreshPvPDuels();
    }, 2800);
  } catch (err) {
    if (elCoin) elCoin.classList.remove("flipping");
    isPvPPlaying = false;
    showToast("Ошибка сети: " + err.message);
  }
}

function initPvpUI() {
  refreshPvPDuels();

  const elRefreshBtn = document.getElementById("pvp-refresh-btn");
  if (elRefreshBtn) elRefreshBtn.onclick = () => refreshPvPDuels();

  const bHeads = document.getElementById("pvp-side-heads");
  const bTails = document.getElementById("pvp-side-tails");
  if (bHeads && bTails) {
    bHeads.onclick = () => {
      pvpSelectedSide = "heads";
      bHeads.classList.add("active");
      bTails.classList.remove("active");
    };
    bTails.onclick = () => {
      pvpSelectedSide = "tails";
      bTails.classList.add("active");
      bHeads.classList.remove("active");
    };
  }

  const elCreateBtn = document.getElementById("pvp-create-btn");
  const elBetInput = document.getElementById("pvp-bet-amount");

  if (elBetInput && elCreateBtn) {
    elBetInput.oninput = () => {
      const b = Math.max(1, parseInt(elBetInput.value || "1", 10));
      elCreateBtn.textContent = `СОЗДАТЬ ДУЭЛЬ ЗА ${b} ⭐`;
    };
  }

  if (elCreateBtn) {
    elCreateBtn.onclick = async () => {
      const bet = Math.max(1, parseInt(elBetInput ? elBetInput.value || "10" : "10", 10));
      if (userBalance < bet) {
        showToast("Недостаточно звёзд на балансе!");
        return;
      }

      elCreateBtn.disabled = true;
      try {
        const res = await fetch("/api/pvp/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: userId, bet: bet, choice: pvpSelectedSide })
        }).then(r => r.json());

        elCreateBtn.disabled = false;
        if (res.ok) {
          userBalance = res.balance;
          elUserBalance.textContent = userBalance;
          showToast(`Дуэль на ${bet} ⭐ создана! Ждём оппонента ⚔️`);
          refreshPvPDuels();
        } else {
          showToast(res.error || "Не удалось создать дуэль");
        }
      } catch (e) {
        elCreateBtn.disabled = false;
        showToast("Ошибка: " + e.message);
      }
    };
  }
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
  initReferrals();
  initAdminDiceAndCases();
  connectWS();
  requestAnimationFrame(renderLoop);
}

window.addEventListener("DOMContentLoaded", initApp);
