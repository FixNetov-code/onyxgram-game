"""
Модуль базы данных SQLite для OnyxGram Crash с поддержкой админ-аналитики.
"""
import aiosqlite
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "crash.db")

INIT_SQL = """
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    balance INTEGER DEFAULT 100,
    total_bet INTEGER DEFAULT 0,
    total_won INTEGER DEFAULT 0,
    is_banned INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crash_point REAL NOT NULL,
    total_bets_sum INTEGER DEFAULT 0,
    total_payout_sum INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER,
    user_id INTEGER,
    amount INTEGER NOT NULL,
    cashout_mult REAL DEFAULT NULL,
    profit INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS slot_spins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    bet INTEGER NOT NULL,
    payout INTEGER NOT NULL,
    multiplier REAL NOT NULL,
    symbols TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS mines_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    bet INTEGER NOT NULL,
    mines_count INTEGER NOT NULL,
    steps_cleared INTEGER DEFAULT 0,
    multiplier REAL DEFAULT 1.0,
    payout INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS upgrade_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    bet INTEGER NOT NULL,
    target_multiplier REAL NOT NULL,
    payout INTEGER NOT NULL,
    chance REAL NOT NULL,
    roll REAL NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS tower_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    bet INTEGER NOT NULL,
    difficulty TEXT NOT NULL,
    floors_cleared INTEGER NOT NULL,
    multiplier REAL NOT NULL,
    payout INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS coinflip_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    bet INTEGER NOT NULL,
    choice TEXT NOT NULL,
    outcome TEXT NOT NULL,
    multiplier REAL NOT NULL,
    payout INTEGER NOT NULL,
    streak INTEGER DEFAULT 1,
    status TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS plinko_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    bet INTEGER NOT NULL,
    risk TEXT NOT NULL,
    rows INTEGER NOT NULL,
    slot_index INTEGER NOT NULL,
    multiplier REAL NOT NULL,
    payout INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS promocodes (
    code TEXT PRIMARY KEY,
    reward INTEGER NOT NULL,
    max_activations INTEGER NOT NULL,
    used_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS promocode_activations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(code, user_id)
);

CREATE TABLE IF NOT EXISTS daily_spins (
    user_id INTEGER PRIMARY KEY,
    last_spin_time TIMESTAMP,
    total_spins INTEGER DEFAULT 0,
    total_reward INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_id INTEGER NOT NULL,
    referred_id INTEGER NOT NULL UNIQUE,
    reward_earned INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dice_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    bet INTEGER NOT NULL,
    target REAL NOT NULL,
    condition TEXT NOT NULL,
    roll REAL NOT NULL,
    multiplier REAL NOT NULL,
    payout INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS case_openings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    case_id TEXT NOT NULL,
    cost INTEGER NOT NULL,
    reward_type TEXT NOT NULL,
    reward_title TEXT NOT NULL,
    reward_amount INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS pvp_duels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER NOT NULL,
    creator_name TEXT NOT NULL,
    bet INTEGER NOT NULL,
    choice TEXT NOT NULL,
    opponent_id INTEGER DEFAULT NULL,
    opponent_name TEXT DEFAULT NULL,
    winner_id INTEGER DEFAULT NULL,
    outcome TEXT DEFAULT NULL,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(INIT_SQL)
        # Проверяем наличие колонок (миграция для существующих баз)
        for col_def in [
            "ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN referred_by INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN ref_earnings INTEGER DEFAULT 0"
        ]:
            try:
                await db.execute(col_def)
            except Exception:
                pass
        await db.commit()

async def get_or_create_user(user_id: int, username: str = "Player") -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)) as cur:
            row = await cur.fetchone()
            if row:
                return dict(row)
        
        await db.execute(
            "INSERT INTO users (user_id, username, balance) VALUES (?, ?, 0)",
            (user_id, username)
        )
        await db.commit()
        return {"user_id": user_id, "username": username, "balance": 0, "total_bet": 0, "total_won": 0, "is_banned": 0}

async def update_balance(user_id: int, delta: int) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(
            "UPDATE users SET balance = balance + ? WHERE user_id = ?",
            (delta, user_id)
        )
        await db.commit()
        async with db.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,)) as cur:
            row = await cur.fetchone()
            return row["balance"] if row else 0

async def record_round(crash_point: float, total_bets: int, total_payout: int) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO rounds (crash_point, total_bets_sum, total_payout_sum) VALUES (?, ?, ?)",
            (crash_point, total_bets, total_payout)
        )
        await db.commit()
        return cursor.lastrowid

async def get_recent_rounds(limit: int = 15) -> list[float]:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT crash_point FROM rounds ORDER BY id DESC LIMIT ?", (limit,)
        ) as cur:
            rows = await cur.fetchall()
            return [round(r[0], 2) for r in rows][::-1]

async def record_slot_spin(user_id: int, bet: int, payout: int, multiplier: float, symbols: list[str]) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "INSERT INTO slot_spins (user_id, bet, payout, multiplier, symbols) VALUES (?, ?, ?, ?, ?)",
            (user_id, bet, payout, multiplier, ",".join(symbols))
        )
        await db.commit()
        return cur.lastrowid

async def record_mines_game(user_id: int, bet: int, mines_count: int, steps_cleared: int, multiplier: float, payout: int, status: str) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "INSERT INTO mines_games (user_id, bet, mines_count, steps_cleared, multiplier, payout, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, bet, mines_count, steps_cleared, multiplier, payout, status)
        )
        await db.commit()
        return cur.lastrowid

async def record_upgrade_game(user_id: int, bet: int, target_multiplier: float, payout: int, chance: float, roll: float, status: str) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "INSERT INTO upgrade_games (user_id, bet, target_multiplier, payout, chance, roll, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, bet, target_multiplier, payout, chance, roll, status)
        )
        await db.commit()
        return cur.lastrowid

async def record_tower_game(user_id: int, bet: int, difficulty: str, floors_cleared: int, multiplier: float, payout: int, status: str) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "INSERT INTO tower_games (user_id, bet, difficulty, floors_cleared, multiplier, payout, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, bet, difficulty, floors_cleared, multiplier, payout, status)
        )
        await db.commit()
        return cur.lastrowid

async def get_leaderboard(period: str = "day", exclude_owner_ids=(2127001, 289802, 968937)) -> list[dict]:
    """Возвращает топ заносов игроков за день или за неделю (исключая создателя)."""
    time_filter = "datetime('now', '-1 day')" if period == "day" else "datetime('now', '-7 days')"
    
    if isinstance(exclude_owner_ids, int):
        ex_set = {exclude_owner_ids}
    else:
        ex_set = set(exclude_owner_ids)
    in_clause = ",".join(str(x) for x in ex_set) if ex_set else "0"

    query = f"""
    SELECT * FROM (
        SELECT b.user_id, COALESCE(u.username, 'Player') as username, b.profit as payout, b.cashout_mult as multiplier, '🚀 Crash' as game, b.created_at
        FROM bets b
        LEFT JOIN users u ON b.user_id = u.user_id
        WHERE b.status = 'won' AND b.profit > 0 AND b.created_at >= {time_filter} AND b.user_id NOT IN ({in_clause})

        UNION ALL

        SELECT s.user_id, COALESCE(u.username, 'Player') as username, s.payout, s.multiplier, '🎰 Слоты' as game, s.created_at
        FROM slot_spins s
        LEFT JOIN users u ON s.user_id = u.user_id
        WHERE s.payout > 0 AND s.created_at >= {time_filter} AND s.user_id NOT IN ({in_clause})

        UNION ALL

        SELECT m.user_id, COALESCE(u.username, 'Player') as username, m.payout, m.multiplier, '💣 Минёр' as game, m.created_at
        FROM mines_games m
        LEFT JOIN users u ON m.user_id = u.user_id
        WHERE m.payout > 0 AND (m.status = 'cashed_out' OR m.status = 'win') AND m.created_at >= {time_filter} AND m.user_id NOT IN ({in_clause})

        UNION ALL

        SELECT up.user_id, COALESCE(u.username, 'Player') as username, up.payout, up.target_multiplier as multiplier, '⚡ Апгрейд' as game, up.created_at
        FROM upgrade_games up
        LEFT JOIN users u ON up.user_id = u.user_id
        WHERE up.status = 'win' AND up.payout > 0 AND up.created_at >= {time_filter} AND up.user_id NOT IN ({in_clause})

        UNION ALL

        SELECT tw.user_id, COALESCE(u.username, 'Player') as username, tw.payout, tw.multiplier, '🏰 Башня' as game, tw.created_at
        FROM tower_games tw
        LEFT JOIN users u ON tw.user_id = u.user_id
        WHERE (tw.status = 'won' OR tw.status = 'cashed_out') AND tw.payout > 0 AND tw.created_at >= {time_filter} AND tw.user_id NOT IN ({in_clause})
    )
    WHERE user_id NOT IN ({in_clause})
    ORDER BY payout DESC, multiplier DESC
    LIMIT 15
    """

    results = []
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query) as cur:
                rows = await cur.fetchall()
                results = [
                    dict(r) for r in rows
                    if r["user_id"] not in ex_set
                    and (r["username"] or "").lower() not in ("владелец", "создатель", "owner", "admin")
                ]
    except Exception:
        pass

    # Если мало записей, дополняем яркими демо-заносами для подогрева азарта
    if len(results) < 5:
        demo_wins = [
            {"username": "💎 ton_whale", "game": "🎰 Слоты", "multiplier": 100.0, "payout": 5000, "user_id": 9001},
            {"username": "🚀 crypto_kid", "game": "🚀 Crash", "multiplier": 28.40, "payout": 2840, "user_id": 9002},
            {"username": "👑 star_king", "game": "💣 Минёр", "multiplier": 14.85, "payout": 1485, "user_id": 9003},
            {"username": "⚡ onyx_pro", "game": "⚡ Апгрейд", "multiplier": 10.00, "payout": 1000, "user_id": 9004},
            {"username": "🎯 sniper_99", "game": "🚀 Crash", "multiplier": 8.50, "payout": 850, "user_id": 9005},
            {"username": "🦊 lucky_fox", "game": "💣 Минёр", "multiplier": 6.20, "payout": 620, "user_id": 9006},
            {"username": "🔥 fire_hand", "game": "🎰 Слоты", "multiplier": 50.0, "payout": 500, "user_id": 9007},
        ]
        for d in demo_wins:
            if len(results) >= 10:
                break
            if not any(r.get("username") == d["username"] for r in results):
                results.append(d)

    return results

# --- Админские функции ---

async def get_casino_stats() -> dict:
    """Возвращает агрегированную статистику казино по всем играм."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        # Пользователи
        async with db.execute("SELECT COUNT(*) as cnt, SUM(balance) as total_bal FROM users") as cur:
            u_row = await cur.fetchone()
            users_count = u_row["cnt"] or 0
            users_balance = u_row["total_bal"] or 0
            
        # Crash раунды и ставки
        async with db.execute("SELECT COUNT(*) as rounds_cnt, SUM(total_bets_sum) as total_in, SUM(total_payout_sum) as total_out FROM rounds") as cur:
            r_row = await cur.fetchone()
            rounds_count = r_row["rounds_cnt"] or 0
            crash_in = r_row["total_in"] or 0
            crash_out = r_row["total_out"] or 0
            
        # Слоты 777
        async with db.execute("SELECT COUNT(*) as spins_cnt, SUM(bet) as total_bet, SUM(payout) as total_payout FROM slot_spins") as cur:
            s_row = await cur.fetchone()
            spins_count = s_row["spins_cnt"] or 0
            slots_in = s_row["total_bet"] or 0
            slots_out = s_row["total_payout"] or 0

        # Минёр
        async with db.execute("SELECT COUNT(*) as mines_cnt, SUM(bet) as total_bet, SUM(payout) as total_payout FROM mines_games") as cur:
            m_row = await cur.fetchone()
            mines_count = m_row["mines_cnt"] or 0
            mines_in = m_row["total_bet"] or 0
            mines_out = m_row["total_payout"] or 0

        # Апгрейд
        async with db.execute("SELECT COUNT(*) as up_cnt, SUM(bet) as total_bet, SUM(payout) as total_payout FROM upgrade_games") as cur:
            up_row = await cur.fetchone()
            upgrade_count = up_row["up_cnt"] or 0 if up_row else 0
            upgrade_in = up_row["total_bet"] or 0 if up_row else 0
            upgrade_out = up_row["total_payout"] or 0 if up_row else 0

        # Башня (Tower)
        async with db.execute("SELECT COUNT(*) as tw_cnt, SUM(bet) as total_bet, SUM(payout) as total_payout FROM tower_games") as cur:
            tw_row = await cur.fetchone()
            tower_count = tw_row["tw_cnt"] or 0 if tw_row else 0
            tower_in = tw_row["total_bet"] or 0 if tw_row else 0
            tower_out = tw_row["total_payout"] or 0 if tw_row else 0

        # Монетка (Coinflip)
        async with db.execute("SELECT COUNT(*) as cf_cnt, SUM(bet) as total_bet, SUM(payout) as total_payout FROM coinflip_games") as cur:
            cf_row = await cur.fetchone()
            coinflip_count = cf_row["cf_cnt"] or 0 if cf_row else 0
            coinflip_in = cf_row["total_bet"] or 0 if cf_row else 0
            coinflip_out = cf_row["total_payout"] or 0 if cf_row else 0

        # Плинко (Plinko)
        async with db.execute("SELECT COUNT(*) as pl_cnt, SUM(bet) as total_bet, SUM(payout) as total_payout FROM plinko_games") as cur:
            pl_row = await cur.fetchone()
            plinko_count = pl_row["pl_cnt"] or 0 if pl_row else 0
            plinko_in = pl_row["total_bet"] or 0 if pl_row else 0
            plinko_out = pl_row["total_payout"] or 0 if pl_row else 0

        total_bets = crash_in + slots_in + mines_in + upgrade_in + tower_in + coinflip_in + plinko_in
        total_payout = crash_out + slots_out + mines_out + upgrade_out + tower_out + coinflip_out + plinko_out
        profit = total_bets - total_payout
            
        return {
            "users_count": users_count,
            "users_balance": users_balance,
            "rounds_count": rounds_count,
            "spins_count": spins_count,
            "mines_games_count": mines_count,
            "upgrade_games_count": upgrade_count,
            "tower_games_count": tower_count,
            "coinflip_games_count": coinflip_count,
            "plinko_games_count": plinko_count,
            "crash_bets": crash_in,
            "slots_bets": slots_in,
            "mines_bets": mines_in,
            "upgrade_bets": upgrade_in,
            "tower_bets": tower_in,
            "coinflip_bets": coinflip_in,
            "plinko_bets": plinko_in,
            "total_bets": total_bets,
            "total_payout": total_payout,
            "net_profit": profit
        }

# --- Coinflip Games ---
async def record_coinflip_game(user_id: int, bet: int, choice: str, outcome: str, multiplier: float, payout: int, streak: int, status: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO coinflip_games (user_id, bet, choice, outcome, multiplier, payout, streak, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, bet, choice, outcome, multiplier, payout, streak, status)
        )
        await db.execute("UPDATE users SET total_bet = total_bet + ?, total_won = total_won + ? WHERE user_id = ?", (bet, payout, user_id))
        await db.commit()

# --- Plinko Games ---
async def record_plinko_game(user_id: int, bet: int, risk: str, rows: int, slot_index: int, multiplier: float, payout: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO plinko_games (user_id, bet, risk, rows, slot_index, multiplier, payout)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (user_id, bet, risk, rows, slot_index, multiplier, payout)
        )
        await db.execute("UPDATE users SET total_bet = total_bet + ?, total_won = total_won + ? WHERE user_id = ?", (bet, payout, user_id))
        await db.commit()

# --- Промокоды (Promocodes) ---
async def create_promocode(code: str, reward: int, max_activations: int) -> dict:
    code = code.strip().upper()
    if not code or reward <= 0 or max_activations <= 0:
        return {"ok": False, "error": "Некорректные параметры промокода"}
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute(
                "INSERT INTO promocodes (code, reward, max_activations, used_count) VALUES (?, ?, ?, 0)",
                (code, reward, max_activations)
            )
            await db.commit()
            return {"ok": True, "code": code, "reward": reward, "max_activations": max_activations}
        except Exception as e:
            return {"ok": False, "error": f"Такой промокод уже существует ({e})"}

async def list_promocodes() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM promocodes ORDER BY created_at DESC") as cur:
            rows = await cur.fetchall()
            return [dict(r) for r in rows]

async def delete_promocode(code: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM promocodes WHERE code = ?", (code.strip().upper(),))
        await db.commit()
        return True

async def activate_promocode(code: str, user_id: int) -> dict:
    code = code.strip().upper()
    if not code:
        return {"ok": False, "error": "Введите промокод"}

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM promocodes WHERE code = ?", (code,)) as cur:
            promo = await cur.fetchone()
            if not promo:
                return {"ok": False, "error": "Промокод не найден или устарел ❌"}

        if promo["used_count"] >= promo["max_activations"]:
            return {"ok": False, "error": "Лимит активаций этого промокода исчерпан! ❌"}

        # Проверяем, не активировал ли юзер ранее
        async with db.execute("SELECT id FROM promocode_activations WHERE code = ? AND user_id = ?", (code, user_id)) as cur:
            act = await cur.fetchone()
            if act:
                return {"ok": False, "error": "Вы уже активировали этот промокод! ⚠️"}

        # Активируем
        try:
            await db.execute("INSERT INTO promocode_activations (code, user_id) VALUES (?, ?)", (code, user_id))
            await db.execute("UPDATE promocodes SET used_count = used_count + 1 WHERE code = ?", (code,))
            reward = promo["reward"]
            await db.execute("UPDATE users SET balance = balance + ? WHERE user_id = ?", (reward, user_id))
            await db.commit()

            async with db.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,)) as cur:
                u_row = await cur.fetchone()
                new_bal = u_row["balance"] if u_row else reward

            return {"ok": True, "reward": reward, "balance": new_bal, "message": f"Промокод активирован! Вам начислено +{reward} ⭐"}
        except Exception as e:
            await db.rollback()
            return {"ok": False, "error": f"Ошибка активации: {e}"}

async def admin_set_balance(user_id: int, new_balance: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE users SET balance = ? WHERE user_id = ?", (new_balance, user_id))
        await db.commit()
        return True

async def admin_set_balance(user_id: int, new_balance: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE users SET balance = ? WHERE user_id = ?", (new_balance, user_id))
        await db.commit()
        return True

async def admin_ban_user(user_id: int, ban: bool) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE users SET is_banned = ? WHERE user_id = ?", (1 if ban else 0, user_id))
        await db.commit()
        return True

async def get_all_users(search: str = "") -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if search:
            q = f"%{search.strip()}%"
            async with db.execute(
                "SELECT user_id, username, balance, total_bet, total_won, is_banned, created_at FROM users WHERE user_id LIKE ? OR username LIKE ? ORDER BY balance DESC LIMIT 150",
                (q, q)
            ) as cur:
                rows = await cur.fetchall()
        else:
            async with db.execute(
                "SELECT user_id, username, balance, total_bet, total_won, is_banned, created_at FROM users ORDER BY balance DESC LIMIT 150"
            ) as cur:
                rows = await cur.fetchall()
        return [dict(r) for r in rows]

# --- Ежедневное Колесо Фортуны (Daily Free Spin) ---
import datetime

async def get_daily_spin_status(user_id: int) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM daily_spins WHERE user_id = ?", (user_id,)) as cur:
            row = await cur.fetchone()
            if not row or not row["last_spin_time"]:
                return {"can_spin": True, "seconds_left": 0, "total_spins": row["total_spins"] if row else 0}
            
            try:
                last_time = datetime.datetime.fromisoformat(str(row["last_spin_time"]))
            except Exception:
                return {"can_spin": True, "seconds_left": 0, "total_spins": row["total_spins"]}
            
            now = datetime.datetime.utcnow()
            diff = (now - last_time).total_seconds()
            cooldown = 24 * 3600  # 24 часа
            if diff >= cooldown:
                return {"can_spin": True, "seconds_left": 0, "total_spins": row["total_spins"]}
            else:
                return {"can_spin": False, "seconds_left": int(cooldown - diff), "total_spins": row["total_spins"]}

async def claim_daily_spin(user_id: int, reward: int) -> dict:
    status = await get_daily_spin_status(user_id)
    if not status["can_spin"]:
        hrs = status['seconds_left'] // 3600
        mins = (status['seconds_left'] % 3600) // 60
        return {"ok": False, "error": f"Следующий спин будет доступен через {hrs} ч. {mins} мин."}
    
    now_iso = datetime.datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO daily_spins (user_id, last_spin_time, total_spins, total_reward)
               VALUES (?, ?, 1, ?)
               ON CONFLICT(user_id) DO UPDATE SET
                   last_spin_time = excluded.last_spin_time,
                   total_spins = total_spins + 1,
                   total_reward = total_reward + excluded.total_reward""",
            (user_id, now_iso, reward)
        )
        if reward > 0:
            await db.execute("UPDATE users SET balance = balance + ? WHERE user_id = ?", (reward, user_id))
        await db.commit()
    
    new_bal = await update_balance(user_id, 0)
    return {"ok": True, "reward": reward, "balance": new_bal}

# --- Реферальная система (Referrals) ---
async def register_referral(referrer_id: int, referred_id: int) -> bool:
    if referrer_id == referred_id or referrer_id <= 0:
        return False
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id FROM referrals WHERE referred_id = ?", (referred_id,)) as cur:
            if await cur.fetchone():
                return False
        
        try:
            await db.execute("INSERT INTO referrals (referrer_id, referred_id, reward_earned) VALUES (?, ?, 5)", (referrer_id, referred_id))
            await db.execute("UPDATE users SET balance = balance + 5, ref_earnings = ref_earnings + 5 WHERE user_id = ?", (referrer_id,))
            await db.execute("UPDATE users SET referred_by = ? WHERE user_id = ?", (referrer_id, referred_id))
            await db.commit()
            return True
        except Exception:
            return False

async def get_referral_info(user_id: int) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT COUNT(*) as count, COALESCE(SUM(reward_earned), 0) as total FROM referrals WHERE referrer_id = ?", (user_id,)) as cur:
            row = await cur.fetchone()
            count = row["count"] if row else 0
            total_earned = row["total"] if row else 0
        
        async with db.execute("SELECT u.username, r.reward_earned, r.created_at FROM referrals r JOIN users u ON r.referred_id = u.user_id WHERE r.referrer_id = ? ORDER BY r.created_at DESC LIMIT 20", (user_id,)) as cur:
            ref_list = [dict(r) for r in await cur.fetchall()]
            
        return {
            "referrals_count": count,
            "total_earned": total_earned,
            "friends": ref_list
        }

# --- Игра Кости (Dice 1-100) ---
async def record_dice_game(user_id: int, bet: int, target: float, condition: str, roll: float, multiplier: float, payout: int, status: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO dice_games (user_id, bet, target, condition, roll, multiplier, payout, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, bet, target, condition, roll, multiplier, payout, status)
        )
        await db.execute("UPDATE users SET total_bet = total_bet + ?, total_won = total_won + ? WHERE user_id = ?", (bet, payout, user_id))
        await db.commit()

# --- Игра Кейсы (Cases) ---
async def record_case_opening(user_id: int, case_id: str, cost: int, reward_type: str, reward_title: str, reward_amount: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO case_openings (user_id, case_id, cost, reward_type, reward_title, reward_amount)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (user_id, case_id, cost, reward_type, reward_title, reward_amount)
        )
        await db.execute("UPDATE users SET total_bet = total_bet + ?, total_won = total_won + ? WHERE user_id = ?", (cost, reward_amount, user_id))
        await db.commit()

# --- PvP Дуэли (PvP Coinflip 1v1) ---
async def create_pvp_duel(creator_id: int, creator_name: str, bet: int, choice: str) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            """INSERT INTO pvp_duels (creator_id, creator_name, bet, choice, status)
               VALUES (?, ?, ?, ?, 'open')""",
            (creator_id, creator_name, bet, choice)
        )
        duel_id = cur.lastrowid
        await db.commit()
        return duel_id

async def list_open_pvp_duels() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM pvp_duels WHERE status = 'open' ORDER BY created_at DESC LIMIT 30") as cur:
            rows = await cur.fetchall()
            return [dict(r) for r in rows]

async def get_pvp_duel(duel_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM pvp_duels WHERE id = ?", (duel_id,)) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None

async def join_pvp_duel(duel_id: int, opponent_id: int, opponent_name: str, winner_id: int, outcome: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE pvp_duels
               SET opponent_id = ?, opponent_name = ?, winner_id = ?, outcome = ?, status = 'finished'
               WHERE id = ? AND status = 'open'""",
            (opponent_id, opponent_name, winner_id, outcome, duel_id)
        )
        await db.commit()
        return True

async def cancel_pvp_duel(duel_id: int, user_id: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "UPDATE pvp_duels SET status = 'cancelled' WHERE id = ? AND creator_id = ? AND status = 'open'",
            (duel_id, user_id)
        )
        await db.commit()
        return cur.rowcount > 0
