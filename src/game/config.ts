import Phaser from 'phaser';
import { GameScene } from './GameScene';

// ---------- Игровые параметры ----------

// Раунд
export const GAME_DURATION_SEC = 90; // длительность одного раунда, сек
export const ROUND_TICK_MS = 1000; // период обновления обратного отсчёта
export const UNIQUE_ENEMIES_AT_SCORE = 10; // вторая фаза: с этого количества очков спавнятся уникальные враги

// Игрок
export const PLAYER_SPEED = 260; // скорость игрока, px/сек
export const START_HP = 3; // стартовое здоровье

// Стамина и рывок
export const STAMINA_MAX = 100; // максимум стамины
export const STAMINA_REGEN_PER_SEC = 20; // восстановление стамины в секунду
export const DASH_COST = 30; // сколько стамины стоит рывок
export const DASH_FORCE = 420; // скорость рывка, px/сек
export const DASH_COOLDOWN_MS = 300; // пауза между рывками
export const DASH_DURATION_MS = 150; // длительность рывка

// Враги
export const ENEMY_SPEED = 60; // скорость обычных и элитных врагов, px/сек
export const SPAWN_INTERVAL_MS = 1500; // как часто спавнятся новые враги
export const INVULNERABILITY_MS = 1000; // неуязвимость после урона или победы в дуэли

// Вероятности спавна (применяются только во второй фазе)
export const ARCHER_SPAWN_ROLL_MAX = 0.2; // roll меньше — стрелок (20%)
export const ELITE_SPAWN_ROLL_MAX = 0.7; // roll меньше — элитный (50%), остальное — мелкие (30%)

// Стрелки
export const ARCHER_RANGE = 260; // дистанцию которую стрелок старается держать
export const ARCHER_SHOOT_COOLDOWN_MS = 1800; // пауза между выстрелами
export const PROJECTILE_SPEED = 300; // скорость снаряда, px/сек
export const PROJECTILE_RADIUS = 6; // радиус снаряда

// Дуэль
export const DUEL_TRIGGER_DISTANCE = 55; // с какого расстояния начинается дуэль
export const DUEL_SEQUENCE_LENGTH_SMALL = 2; // длина серии у обычного врага
export const DUEL_SEQUENCE_LENGTH_ELITE = 5; // длина серии у элитного врага
export const DUEL_SEQUENCE_LENGTH_ARCHER = 2; // длина серии у стрелка
export const DUEL_TIME_LIMIT_MS = 4000; // время на выполнение серии
export const DUEL_TIME_SCALE_MIN = 0.15; // замедление мира вдали от героя во время дуэли
export const DUEL_TIME_SCALE_FREEZE = 0; // замедление у самого героя во время дуэли (полная остановка)
export const DUEL_TIME_SCALE_RADIUS = 140; // радиус вокруг героя, где время замирает постепенно
export const DUEL_TIME_SCALE_STOP = 30; // ближе этого расстояния время полностью стоит
export const DUEL_KNOCKBACK = 140; // на сколько px отталкивается враг при проигранной дуэли

// ---------- Конфиг Phaser ----------

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 640,
    backgroundColor: '#0f172a',
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
  };

  return new Phaser.Game(config);
}
