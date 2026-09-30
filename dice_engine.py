"""
Движок классической игры Кости (Dice 1-100).
Поддерживает ставки "Больше" (over) и "Меньше" (under),
динамический расчет коэффициентов с учетом house edge (3%),
админские режимы подкрутки RTP и принудительный исход.
"""
import random
import logging

log = logging.getLogger("dice")

class DiceEngine:
    def __init__(self):
        # Админские настройки
        self.rig_mode: str = "normal"  # "normal", "win", "loss", "rtp_5", "rtp_20", "rtp_50", "rtp_96", "rtp_130"
        self.forced_next: str | float | None = None

    def calculate_multiplier(self, win_chance: float) -> float:
        """
        Коэффициент выплаты на основе шанса победы (с 3% маржой казино / 97% базовый RTP).
        """
        win_chance = max(1.0, min(95.0, float(win_chance)))
        mult = 97.0 / win_chance
        return round(mult, 2)

    def roll(self, bet: int, target: float, condition: str = "under") -> dict:
        """
        Бросок костей.
        bet: сумма ставки в ⭐
        target: целевое число (от 1.00 до 98.00)
        condition: 'under' (выпавшее число < target) или 'over' (выпавшее число > target)
        """
        if bet < 1:
            return {"ok": False, "error": "Минимальная ставка 1 ⭐"}

        condition = condition.lower()
        if condition not in ("under", "over"):
            return {"ok": False, "error": "Неверное условие: должно быть 'under' или 'over'"}

        target = round(float(target), 2)
        if condition == "under":
            target = max(1.0, min(95.0, target))
            win_chance = target
        else:
            target = max(5.0, min(99.0, target))
            win_chance = 100.0 - target

        win_chance = round(win_chance, 2)
        multiplier = self.calculate_multiplier(win_chance)

        # Вычисление результата броска с учётом админских настроек
        outcome_number = self._generate_roll(condition, target, win_chance)

        is_win = False
        if condition == "under":
            is_win = outcome_number < target
        else:
            is_win = outcome_number > target

        payout = int(bet * multiplier) if is_win else 0

        return {
            "ok": True,
            "bet": bet,
            "target": target,
            "condition": condition,
            "win_chance": win_chance,
            "roll": outcome_number,
            "multiplier": multiplier,
            "win": is_win,
            "payout": payout
        }

    def _generate_roll(self, condition: str, target: float, win_chance: float) -> float:
        # 1. Принудительный исход админа
        if self.forced_next is not None:
            fn = self.forced_next
            self.forced_next = None
            if isinstance(fn, (int, float)):
                return round(float(fn), 2)
            fn_str = str(fn).lower()
            if fn_str == "win":
                return self._forced_win_roll(condition, target)
            elif fn_str == "loss":
                return self._forced_loss_roll(condition, target)
            try:
                val = float(fn_str)
                return round(val, 2)
            except ValueError:
                pass

        # 2. Админский RTP режим
        p_win = (win_chance / 100.0)
        if self.rig_mode == "win":
            return self._forced_win_roll(condition, target)
        elif self.rig_mode == "loss":
            return self._forced_loss_roll(condition, target)
        elif self.rig_mode == "rtp_5":
            p_win *= 0.05
        elif self.rig_mode == "rtp_20":
            p_win *= 0.20
        elif self.rig_mode == "rtp_50":
            p_win *= 0.50
        elif self.rig_mode == "rtp_96":
            p_win *= 0.96
        elif self.rig_mode == "rtp_130":
            p_win = min(0.95, p_win * 1.30)

        should_win = random.random() < p_win
        if should_win:
            return self._forced_win_roll(condition, target)
        else:
            return self._forced_loss_roll(condition, target)

    def _forced_win_roll(self, condition: str, target: float) -> float:
        if condition == "under":
            # Число строго меньше target (0.01 до target - 0.01)
            high = max(0.01, target - 0.01)
            return round(random.uniform(0.01, high), 2)
        else:
            # Число строго больше target (target + 0.01 до 99.99)
            low = min(99.99, target + 0.01)
            return round(random.uniform(low, 99.99), 2)

    def _forced_loss_roll(self, condition: str, target: float) -> float:
        if condition == "under":
            # Число >= target (target до 99.99)
            return round(random.uniform(target, 99.99), 2)
        else:
            # Число <= target (0.01 до target)
            return round(random.uniform(0.01, target), 2)

dice_engine = DiceEngine()
