"""
Модуль игры «Минёр» (Mines / Минное поле 5x5).
Включает математику множителей с RTP 96%, отслеживание активных игр в реальном времени,
админ-мониторинг активных сессий (ник, ставка, текущий X, потенциальный выигрыш)
и возможность админского вмешательства (подложить мину / дать алмаз).
"""
import random
import logging
from typing import Dict, Any

log = logging.getLogger("mines")

TOTAL_TILES = 25

def calculate_mines_multiplier(mines: int, steps: int, rtp: float = 0.96) -> float:
    """Вычисляет множитель для заданного количества мин и открытых безопасных клеток."""
    if steps <= 0:
        return 1.00
    safe_tiles = TOTAL_TILES - mines
    if steps > safe_tiles:
        steps = safe_tiles
        
    mult = 1.0
    for i in range(steps):
        mult *= (TOTAL_TILES - i) / (TOTAL_TILES - mines - i)
        
    final_mult = mult * rtp
    return max(1.01, round(final_mult, 2))

class MinesEngine:
    def __init__(self):
        # user_id -> активная игра
        self.active_games: Dict[int, dict] = {}
        self.rig_mode: str = "normal"  # normal (96%), greedy (75%), boost (130%)
        # user_id или "all" -> "mine" | "gem" | None
        self.forced_outcomes: Dict[Any, str] = {}

    def set_rig_mode(self, mode: str):
        if mode in ("normal", "greedy", "hard_50", "trap_20", "super_greedy_5", "boost"):
            self.rig_mode = mode
            log.info(f"💣 Минёр: установлен режим RTP {mode}")

    def get_current_rtp(self) -> float:
        if self.rig_mode == "super_greedy_5":
            return 0.05
        elif self.rig_mode == "trap_20":
            return 0.20
        elif self.rig_mode == "hard_50":
            return 0.50
        elif self.rig_mode == "greedy":
            return 0.75
        elif self.rig_mode == "boost":
            return 1.30
        return 0.96

    def set_forced_outcome(self, user_id: int | str, outcome: str | None):
        """outcome: 'mine' (бомба на след. клик), 'gem' (алмаз), None (рандом)."""
        if outcome is None:
            self.forced_outcomes.pop(user_id, None)
        else:
            self.forced_outcomes[user_id] = outcome
        log.info(f"💣 Минёр: принудительный исход для {user_id}: {outcome}")

    def start_game(self, user_id: int, username: str, bet: int, mines_count: int) -> dict:
        """Начинает новую игру в Минёр."""
        if user_id in self.active_games:
            return {"ok": False, "error": "У вас уже есть активная игра! Завершите её."}

        if bet < 1:
            return {"ok": False, "error": "Минимальная ставка 1 ⭐"}

        mines_count = max(1, min(24, int(mines_count)))

        # Генерируем позиции мин (список индексов от 0 до 24)
        all_indices = list(range(TOTAL_TILES))
        mine_positions = set(random.sample(all_indices, mines_count))

        next_mult = calculate_mines_multiplier(mines_count, 1, self.get_current_rtp())

        game = {
            "user_id": user_id,
            "username": username,
            "bet": bet,
            "mines_count": mines_count,
            "mine_positions": mine_positions,
            "revealed_tiles": [],
            "current_multiplier": 1.00,
            "potential_win": bet,
            "next_multiplier": next_mult,
            "status": "active"
        }

        self.active_games[user_id] = game
        log.info(f"💣 Минёр: игрок {username} ({user_id}) начал игру со ставкой {bet} ⭐ ({mines_count} мин)")

        return {
            "ok": True,
            "bet": bet,
            "mines_count": mines_count,
            "current_multiplier": 1.00,
            "potential_win": bet,
            "next_multiplier": next_mult,
            "safe_remaining": TOTAL_TILES - mines_count
        }

    def reveal_tile(self, user_id: int, tile_index: int) -> dict:
        """Открывает клетку на поле (0..24)."""
        if user_id not in self.active_games:
            return {"ok": False, "error": "Нет активной игры. Сделайте ставку!"}

        game = self.active_games[user_id]
        if tile_index in game["revealed_tiles"]:
            return {"ok": False, "error": "Эта клетка уже открыта!"}

        if tile_index < 0 or tile_index >= TOTAL_TILES:
            return {"ok": False, "error": "Неверный номер клетки"}

        # Проверка админского принудительного исхода
        forced = self.forced_outcomes.get(user_id) or self.forced_outcomes.get("all")
        if forced == "mine":
            # Гарантируем, что выбранная клетка — бомба
            if tile_index not in game["mine_positions"]:
                # Заменяем случайную мину на эту клетку
                old_mine = random.choice(list(game["mine_positions"]))
                game["mine_positions"].remove(old_mine)
                game["mine_positions"].add(tile_index)
            self.forced_outcomes.pop(user_id, None)
            self.forced_outcomes.pop("all", None)
        elif forced == "gem":
            # Гарантируем, что выбранная клетка — алмаз (безопасна)
            if tile_index in game["mine_positions"]:
                # Переносим мину в любую неоткрытую другую клетку
                safe_spots = [i for i in range(TOTAL_TILES) if i not in game["mine_positions"] and i not in game["revealed_tiles"] and i != tile_index]
                if safe_spots:
                    new_mine = random.choice(safe_spots)
                    game["mine_positions"].remove(tile_index)
                    game["mine_positions"].add(new_mine)
            self.forced_outcomes.pop(user_id, None)
            self.forced_outcomes.pop("all", None)

        # Автоматическая RTP-ловушка (если нет явного админского разрешения "gem")
        if forced != "gem" and tile_index not in game["mine_positions"]:
            trap_chance = 0.0
            if self.rig_mode == "super_greedy_5":
                trap_chance = 0.95  # 95% шанс взрыва на любом шаге!
            elif self.rig_mode == "trap_20":
                trap_chance = 0.80  # 80% шанс взрыва
            elif self.rig_mode == "hard_50":
                trap_chance = 0.50  # 50% шанс взрыва
            elif self.rig_mode == "greedy" and len(game["revealed_tiles"]) >= 1:
                trap_chance = 0.25  # 25% шанс взрыва после 1-го шага

            if trap_chance > 0 and random.random() < trap_chance:
                # Перемещаем одну из мин прямо под эту клетку
                old_mine = random.choice(list(game["mine_positions"]))
                game["mine_positions"].remove(old_mine)
                game["mine_positions"].add(tile_index)
                log.info(f"💣 Минёр: сработала RTP-ловушка ({self.rig_mode}), мина перемещена на клетку {tile_index}")

        # 1. Попадание на мину (ВЗРЫВ!)
        if tile_index in game["mine_positions"]:
            mines_list = list(game["mine_positions"])
            bet = game["bet"]
            username = game["username"]
            steps = len(game["revealed_tiles"])
            
            # Удаляем активную сессию
            del self.active_games[user_id]

            log.info(f"💥 Минёр: игрок {username} подорвался на шаге {steps + 1}, ставка {bet} ⭐ сгорела!")

            return {
                "ok": True,
                "status": "exploded",
                "hit_mine": tile_index,
                "all_mines": mines_list,
                "steps_cleared": steps,
                "bet": bet
            }

        # 2. Безопасная клетка (АЛМАЗ!)
        game["revealed_tiles"].append(tile_index)
        steps = len(game["revealed_tiles"])
        rtp = self.get_current_rtp()
        new_mult = calculate_mines_multiplier(game["mines_count"], steps, rtp)
        game["current_multiplier"] = new_mult
        game["potential_win"] = int(game["bet"] * new_mult)

        safe_total = TOTAL_TILES - game["mines_count"]
        is_all_cleared = (steps >= safe_total)

        if is_all_cleared:
            # Игрок открыл все безопасные клетки (Авто-победа!)
            win_amount = game["potential_win"]
            all_mines = list(game["mine_positions"])
            del self.active_games[user_id]

            log.info(f"🏆 Минёр: игрок {game['username']} открыл ВСЕ безопасные клетки! Выигрыш: {win_amount} ⭐ ({new_mult}x)")

            return {
                "ok": True,
                "status": "all_cleared",
                "tile": tile_index,
                "multiplier": new_mult,
                "win": win_amount,
                "all_mines": all_mines,
                "steps_cleared": steps
            }

        next_mult = calculate_mines_multiplier(game["mines_count"], steps + 1, rtp)
        game["next_multiplier"] = next_mult

        return {
            "ok": True,
            "status": "safe",
            "tile": tile_index,
            "multiplier": new_mult,
            "potential_win": game["potential_win"],
            "next_multiplier": next_mult,
            "steps_cleared": steps,
            "safe_remaining": safe_total - steps
        }

    def cashout(self, user_id: int) -> dict:
        """Игрок нажал «Забрать»."""
        if user_id not in self.active_games:
            return {"ok": False, "error": "Нет активной игры для вывода"}

        game = self.active_games[user_id]
        steps = len(game["revealed_tiles"])
        if steps == 0:
            return {"ok": False, "error": "Сначала откройте хотя бы одну безопасную клетку!"}

        mult = game["current_multiplier"]
        win_amount = game["potential_win"]
        all_mines = list(game["mine_positions"])
        username = game["username"]
        bet = game["bet"]

        del self.active_games[user_id]

        log.info(f"💰 Минёр: игрок {username} забрал {win_amount} ⭐ ({mult}x, шагов: {steps})")

        return {
            "ok": True,
            "status": "cashed_out",
            "win": win_amount,
            "multiplier": mult,
            "bet": bet,
            "steps_cleared": steps,
            "all_mines": all_mines
        }

    def get_active_games_list(self) -> list[dict]:
        """Возвращает актуальный список всех играющих в данный момент людей для админ-панели."""
        result = []
        for uid, g in self.active_games.items():
            result.append({
                "user_id": uid,
                "username": g["username"],
                "bet": g["bet"],
                "mines_count": g["mines_count"],
                "steps_cleared": len(g["revealed_tiles"]),
                "current_multiplier": g["current_multiplier"],
                "potential_win": g["potential_win"],
                "next_multiplier": g["next_multiplier"]
            })
        return result

# Глобальный инстанс
mines_engine = MinesEngine()
