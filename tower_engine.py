"""
Модуль игры «Tower» (Башня / Ступени).
Игрок поднимается по этажам башни. На каждом этаже несколько плиток (плитки с сокровищами и плитки-ловушки).
С каждым успешным шагом множитель растет.
Игрок может забрать куш на любом пройденном этаже.
"""
import random
import logging
from typing import Dict, Any, List

log = logging.getLogger("tower")

# Базовые множители этажей для разных сложностей (8 этажей)
TOWER_CONFIG = {
    "easy": {
        "title": "Легкая (4 плитки: 3 💎 / 1 💀)",
        "tiles_per_row": 4,
        "traps_per_row": 1,
        "multipliers": [1.28, 1.70, 2.28, 3.05, 4.10, 5.50, 7.40, 10.00]
    },
    "medium": {
        "title": "Средняя (3 плитки: 2 💎 / 1 💀)",
        "tiles_per_row": 3,
        "traps_per_row": 1,
        "multipliers": [1.44, 2.16, 3.24, 4.86, 7.30, 11.00, 16.50, 25.00]
    },
    "hard": {
        "title": "Сложная (2 плитки: 1 💎 / 1 💀)",
        "tiles_per_row": 2,
        "traps_per_row": 1,
        "multipliers": [1.92, 3.84, 7.68, 15.36, 30.70, 61.40, 122.00, 250.00]
    }
}

class TowerEngine:
    def __init__(self):
        self.rig_mode: str = "normal"  # normal, greedy, hard_50, trap_20, super_greedy_5, boost
        self.forced_next: str | None = None  # "safe" | "trap" | None
        self.active_games: Dict[int, Dict[str, Any]] = {}

    def set_rig_mode(self, mode: str):
        if mode in ("normal", "greedy", "hard_50", "trap_20", "super_greedy_5", "boost"):
            self.rig_mode = mode
            log.info(f"🏰 Tower: установлен режим RTP {mode}")

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

    def set_forced_result(self, result: str | None):
        """result: 'safe' | 'trap' | None"""
        self.forced_next = result
        log.info(f"🏰 Tower: принудительный исход след. шага: {result}")

    def get_multipliers(self, difficulty: str) -> List[float]:
        cfg = TOWER_CONFIG.get(difficulty, TOWER_CONFIG["medium"])
        rtp = self.get_current_rtp()
        rtp_factor = rtp / 0.96
        # Масштабируем множители относительно текущего RTP
        return [round(max(1.05, m * rtp_factor), 2) for m in cfg["multipliers"]]

    def start_game(self, user_id: int, bet: int, difficulty: str = "medium") -> dict:
        if bet < 1:
            return {"ok": False, "error": "Минимальная ставка 1 ⭐"}
        if difficulty not in TOWER_CONFIG:
            difficulty = "medium"

        cfg = TOWER_CONFIG[difficulty]
        mults = self.get_multipliers(difficulty)

        # Генерируем секретное расположение ловушек для всех 8 этажей
        # Для каждого этажа список индексов ловушек
        floors_traps = []
        for _ in range(8):
            traps = set(random.sample(range(cfg["tiles_per_row"]), cfg["traps_per_row"]))
            floors_traps.append(traps)

        game = {
            "user_id": user_id,
            "bet": bet,
            "difficulty": difficulty,
            "tiles_per_row": cfg["tiles_per_row"],
            "traps_per_row": cfg["traps_per_row"],
            "multipliers": mults,
            "current_floor": 0,  # 0: до первого шага, 1..8: пройденные этажи
            "floors_traps": floors_traps,
            "cleared_tiles": [],  # выбранные плитки [(floor, tile_idx, is_gem)]
            "status": "in_progress",  # "in_progress" | "won" | "lost" | "cashed_out"
            "current_multiplier": 1.0,
            "potential_win": bet
        }

        self.active_games[user_id] = game
        log.info(f"🏰 Tower: игрок {user_id} начал игру на ставку {bet} ⭐ (Сложность: {difficulty})")

        return {
            "ok": True,
            "bet": bet,
            "difficulty": difficulty,
            "tiles_per_row": cfg["tiles_per_row"],
            "traps_per_row": cfg["traps_per_row"],
            "multipliers": mults,
            "current_floor": 0,
            "potential_win": bet
        }

    def step(self, user_id: int, tile_index: int) -> dict:
        game = self.active_games.get(user_id)
        if not game or game["status"] != "in_progress":
            return {"ok": False, "error": "Нет активной игры в Tower"}

        current_floor = game["current_floor"]  # 0..7
        if current_floor >= 8:
            return {"ok": False, "error": "Башня уже полностью пройдена"}

        tiles_count = game["tiles_per_row"]
        if tile_index < 0 or tile_index >= tiles_count:
            return {"ok": False, "error": "Неверный индекс плитки"}

        floor_traps = game["floors_traps"][current_floor]

        # Проверка принудительного исхода от админа
        if self.forced_next == "safe":
            self.forced_next = None
            is_trap = False
            # Если выбранная плитка была в ловушках, переносим ловушку на другую плитку
            if tile_index in floor_traps:
                floor_traps.remove(tile_index)
                other_indices = [i for i in range(tiles_count) if i != tile_index]
                floor_traps.add(random.choice(other_indices))
        elif self.forced_next == "trap":
            self.forced_next = None
            is_trap = True
            floor_traps.add(tile_index)
        else:
            # Обычный ход по сгенерированной карте
            is_trap = (tile_index in floor_traps)

        if is_trap:
            # Ловушка! Башня обрушилась
            game["status"] = "lost"
            game["cleared_tiles"].append({"floor": current_floor, "tile": tile_index, "is_safe": False})
            all_floor_traps = [list(t) for t in game["floors_traps"]]
            del self.active_games[user_id]

            log.info(f"💥 Tower: игрок {user_id} подорвался на этаже {current_floor + 1}")

            return {
                "ok": True,
                "status": "lost",
                "floor": current_floor + 1,
                "tile_index": tile_index,
                "is_safe": False,
                "current_multiplier": 0.0,
                "win": 0,
                "floor_traps": list(floor_traps),
                "all_traps": all_floor_traps
            }
        else:
            # Успешный шаг!
            new_floor = current_floor + 1
            game["current_floor"] = new_floor
            new_mult = game["multipliers"][new_floor - 1]
            potential_win = int(round(game["bet"] * new_mult))
            game["current_multiplier"] = new_mult
            game["potential_win"] = potential_win
            game["cleared_tiles"].append({"floor": current_floor, "tile": tile_index, "is_safe": True})

            is_top = (new_floor == 8)
            if is_top:
                # Достигнут 8 этаж - автопобеда (Вершина Башни!)
                game["status"] = "won"
                all_floor_traps = [list(t) for t in game["floors_traps"]]
                del self.active_games[user_id]
                log.info(f"👑 Tower: игрок {user_id} покорил вершину башни! Куш: {potential_win} ⭐ ({new_mult}x)")

                return {
                    "ok": True,
                    "status": "won",
                    "floor": new_floor,
                    "tile_index": tile_index,
                    "is_safe": True,
                    "is_top": True,
                    "current_multiplier": new_mult,
                    "potential_win": potential_win,
                    "win": potential_win,
                    "floor_traps": list(floor_traps),
                    "all_traps": all_floor_traps
                }

            log.info(f"💎 Tower: игрок {user_id} прошел этаж {new_floor}, множитель {new_mult}x ({potential_win} ⭐)")

            return {
                "ok": True,
                "status": "in_progress",
                "floor": new_floor,
                "tile_index": tile_index,
                "is_safe": True,
                "is_top": False,
                "current_multiplier": new_mult,
                "potential_win": potential_win,
                "floor_traps": list(floor_traps)
            }

    def cashout(self, user_id: int) -> dict:
        game = self.active_games.get(user_id)
        if not game or game["status"] != "in_progress":
            return {"ok": False, "error": "Нет активной игры в Tower"}

        if game["current_floor"] == 0:
            return {"ok": False, "error": "Пройдите хотя бы один этаж"}

        win_amount = game["potential_win"]
        mult = game["current_multiplier"]
        floor = game["current_floor"]
        all_floor_traps = [list(t) for t in game["floors_traps"]]

        game["status"] = "cashed_out"
        del self.active_games[user_id]

        log.info(f"💰 Tower: игрок {user_id} забрал куш {win_amount} ⭐ на этаже {floor} ({mult}x)")

        return {
            "ok": True,
            "status": "cashed_out",
            "floor": floor,
            "multiplier": mult,
            "win": win_amount,
            "all_traps": all_floor_traps
        }

    def get_game(self, user_id: int) -> dict | None:
        return self.active_games.get(user_id)

tower_engine = TowerEngine()
