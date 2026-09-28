"""
Движок игры Coinflip (Орёл или Решка).
Поддерживает режим одиночных ставок и режим серии (Streak: удвоение x1.95, x3.80, x7.41...).
Включает админские режимы подкрутки (rig_mode) и принудительный исход (forced_next).
"""
import random
import logging

log = logging.getLogger("coinflip")

class CoinflipEngine:
    def __init__(self):
        # user_id -> {bet, streak, current_mult, current_payout, choice}
        self.active_games: dict[int, dict] = {}
        
        # Админские настройки
        self.rig_mode: str = "normal"  # "normal", "win", "loss", "rtp_5", "rtp_20", "rtp_50", "rtp_96", "rtp_130"
        self.forced_next: str | None = None  # "heads", "tails", "win", "loss", None

    def calculate_mult(self, streak: int) -> float:
        """Множитель для количества побед подряд."""
        # Базовый множитель 1.95x за шаг (дом 2.5%)
        return round(1.95 ** streak, 2)

    def determine_outcome(self, choice: str) -> str:
        """Определяет выпавшую сторону монеты с учётом админской подкрутки."""
        opposite = "tails" if choice == "heads" else "heads"

        # 1. Принудительный исход от админа
        if self.forced_next:
            fn = self.forced_next.lower()
            self.forced_next = None
            if fn in ("heads", "tails"):
                return fn
            elif fn == "win":
                return choice
            elif fn == "loss":
                return opposite

        # 2. Режимы подкрутки
        if self.rig_mode == "win":
            return choice
        elif self.rig_mode == "loss":
            return opposite
        elif self.rig_mode == "rtp_5":
            return choice if random.random() < 0.05 else opposite
        elif self.rig_mode == "rtp_20":
            return choice if random.random() < 0.20 else opposite
        elif self.rig_mode == "rtp_50":
            return choice if random.random() < 0.35 else opposite
        elif self.rig_mode == "rtp_130":
            return choice if random.random() < 0.65 else opposite

        # 3. Честный режим (49.5% победа)
        return choice if random.random() < 0.495 else opposite

    def play(self, user_id: int, bet: int, choice: str) -> dict:
        """
        Бросок монеты.
        Если уже есть активная серия (streak), продолжаем с текущей накопленной суммой.
        Если нет активной серии, начинаем с bet.
        """
        choice = choice.lower()
        if choice not in ("heads", "tails"):
            return {"ok": False, "error": "Выберите 'heads' (Орёл) или 'tails' (Решка)"}

        is_continuation = user_id in self.active_games

        if is_continuation:
            game = self.active_games[user_id]
            current_bet = game["bet"]
            current_streak = game["streak"]
        else:
            if bet < 1:
                return {"ok": False, "error": "Минимальная ставка 1 ⭐"}
            current_bet = bet
            current_streak = 0
            game = {
                "bet": bet,
                "streak": 0,
                "current_mult": 1.0,
                "current_payout": bet
            }

        outcome = self.determine_outcome(choice)
        is_win = (outcome == choice)

        if is_win:
            new_streak = current_streak + 1
            new_mult = self.calculate_mult(new_streak)
            new_payout = int(current_bet * new_mult)
            next_mult = self.calculate_mult(new_streak + 1)
            next_payout = int(current_bet * next_mult)

            self.active_games[user_id] = {
                "bet": current_bet,
                "streak": new_streak,
                "current_mult": new_mult,
                "current_payout": new_payout,
                "last_choice": choice
            }

            return {
                "ok": True,
                "win": True,
                "choice": choice,
                "outcome": outcome,
                "streak": new_streak,
                "multiplier": new_mult,
                "payout": new_payout,
                "next_mult": next_mult,
                "next_payout": next_payout,
                "is_continuation": is_continuation,
                "can_cashout": True
            }
        else:
            # Проигрыш: серия сгорает
            if user_id in self.active_games:
                del self.active_games[user_id]

            return {
                "ok": True,
                "win": False,
                "choice": choice,
                "outcome": outcome,
                "streak": current_streak,
                "multiplier": 0.0,
                "payout": 0,
                "is_continuation": is_continuation,
                "can_cashout": False
            }

    def cashout(self, user_id: int) -> dict:
        """Забрать текущий выигрыш из серии."""
        if user_id not in self.active_games:
            return {"ok": False, "error": "Нет активной серии для вывода"}

        game = self.active_games.pop(user_id)
        return {
            "ok": True,
            "bet": game["bet"],
            "streak": game["streak"],
            "multiplier": game["current_mult"],
            "payout": game["current_payout"]
        }

    def get_game(self, user_id: int) -> dict | None:
        return self.active_games.get(user_id)

coinflip_engine = CoinflipEngine()
