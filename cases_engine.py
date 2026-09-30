"""
Движок игры Кейсы (Cases / Лутбоксы в стиле CS:GO).
Включает 3 кейса: Новичок (10⭐), Космос (50⭐), Олигарх (200⭐).
Поддерживает админскую подкрутку и возврат набора элементов для горизонтальной рулетки.
"""
import random
import logging

log = logging.getLogger("cases")

CASES_CONFIG = {
    "novice": {
        "id": "novice",
        "name": "Новичок",
        "cost": 10,
        "icon": "📦",
        "color": "#38bdf8",
        "items": [
            {"id": "n1", "name": "1 ⭐ Звезда", "amount": 1, "rarity": "common", "color": "#94a3b8", "icon": "⭐", "weight": 25},
            {"id": "n2", "name": "3 ⭐ Звезды", "amount": 3, "rarity": "common", "color": "#94a3b8", "icon": "⭐", "weight": 25},
            {"id": "n3", "name": "8 ⭐ Звезд", "amount": 8, "rarity": "rare", "color": "#38bdf8", "icon": "🪙", "weight": 20},
            {"id": "n4", "name": "15 ⭐ Монетка", "amount": 15, "rarity": "rare", "color": "#6366f1", "icon": "💰", "weight": 15},
            {"id": "n5", "name": "30 ⭐ Мешочек", "amount": 30, "rarity": "epic", "color": "#a855f7", "icon": "💎", "weight": 10},
            {"id": "n6", "name": "75 ⭐ ДЖЕКПОТ", "amount": 75, "rarity": "legendary", "color": "#f59e0b", "icon": "👑", "weight": 5},
        ]
    },
    "cosmos": {
        "id": "cosmos",
        "name": "Космос",
        "cost": 50,
        "icon": "🚀",
        "color": "#8b5cf6",
        "items": [
            {"id": "c1", "name": "10 ⭐ Астероид", "amount": 10, "rarity": "common", "color": "#94a3b8", "icon": "🪨", "weight": 25},
            {"id": "c2", "name": "25 ⭐ Спутник", "amount": 25, "rarity": "common", "color": "#94a3b8", "icon": "🛰️", "weight": 25},
            {"id": "c3", "name": "45 ⭐ Орбита", "amount": 45, "rarity": "rare", "color": "#38bdf8", "icon": "🪐", "weight": 20},
            {"id": "c4", "name": "90 ⭐ Ракета", "amount": 90, "rarity": "rare", "color": "#6366f1", "icon": "🚀", "weight": 15},
            {"id": "c5", "name": "180 ⭐ Сверхновая", "amount": 180, "rarity": "epic", "color": "#a855f7", "icon": "✨", "weight": 10},
            {"id": "c6", "name": "400 ⭐ КВАЗАР", "amount": 400, "rarity": "legendary", "color": "#f59e0b", "icon": "🌌", "weight": 5},
        ]
    },
    "oligarch": {
        "id": "oligarch",
        "name": "Олигарх",
        "cost": 200,
        "icon": "👑",
        "color": "#f59e0b",
        "items": [
            {"id": "o1", "name": "40 ⭐ Чемоданчик", "amount": 40, "rarity": "common", "color": "#94a3b8", "icon": "💼", "weight": 25},
            {"id": "o2", "name": "100 ⭐ Слиток золота", "amount": 100, "rarity": "common", "color": "#94a3b8", "icon": "🥇", "weight": 25},
            {"id": "o3", "name": "190 ⭐ Спорткар", "amount": 190, "rarity": "rare", "color": "#38bdf8", "icon": "🏎️", "weight": 20},
            {"id": "o4", "name": "380 ⭐ Пентхаус", "amount": 380, "rarity": "rare", "color": "#6366f1", "icon": "🏙️", "weight": 15},
            {"id": "o5", "name": "800 ⭐ Супер-Яхта", "amount": 800, "rarity": "epic", "color": "#a855f7", "icon": "🛥️", "weight": 10},
            {"id": "o6", "name": "2000 ⭐ ИМПЕРИЯ", "amount": 2000, "rarity": "legendary", "color": "#f59e0b", "icon": "👑", "weight": 5},
        ]
    }
}

class CasesEngine:
    def __init__(self):
        self.rig_mode: str = "normal"  # "normal", "win", "loss", "rtp_5", "rtp_20", "rtp_50", "rtp_96", "rtp_130"
        self.forced_item_id: str | None = None

    def get_cases_catalog(self) -> dict:
        return CASES_CONFIG

    def open_case(self, case_id: str) -> dict:
        case = CASES_CONFIG.get(case_id)
        if not case:
            return {"ok": False, "error": "Кейс не найден"}

        items = case["items"]

        # Админский forced_item
        if self.forced_item_id:
            for it in items:
                if it["id"] == self.forced_item_id:
                    self.forced_item_id = None
                    return {"ok": True, "case": case, "won_item": it, "reel": self._generate_reel(items, it)}
            self.forced_item_id = None

        # Админские режимы rig_mode
        weights = [it["weight"] for it in items]
        if self.rig_mode == "win":
            won_item = items[-1]
            return {"ok": True, "case": case, "won_item": won_item, "reel": self._generate_reel(items, won_item)}
        elif self.rig_mode == "loss":
            won_item = items[0]
            return {"ok": True, "case": case, "won_item": won_item, "reel": self._generate_reel(items, won_item)}
        elif self.rig_mode in ("rtp_5", "rtp_20"):
            # Сильный сдвиг к дешёвым предметам
            weights = [w * (len(items) - i) ** 2 for i, w in enumerate(weights)]
        elif self.rig_mode == "rtp_130":
            # Сдвиг к дорогим
            weights = [w * (i + 1) ** 2 for i, w in enumerate(weights)]

        won_item = random.choices(items, weights=weights, k=1)[0]
        reel = self._generate_reel(items, won_item)

        return {
            "ok": True,
            "case": case,
            "won_item": won_item,
            "reel": reel
        }

    def _generate_reel(self, items: list[dict], winning_item: dict, total_items: int = 40, win_index: int = 30) -> list[dict]:
        """Генерирует ленту для анимации горизонтальной рулетки."""
        reel = [random.choice(items) for _ in range(total_items)]
        reel[win_index] = winning_item
        return reel

cases_engine = CasesEngine()
