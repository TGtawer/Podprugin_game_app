import Phaser from 'phaser';

const PLAYER_SPEED = 260;
const ENEMY_SPEED = 60;
const INVULNERABILITY_MS = 1000;
const GAME_DURATION_SEC = 90;
const UNIQUE_ENEMIES_AFTER_SEC = 15; // до этой секунды раунда спавнятся только слабые кружочки

// Стамина и рывок
const STAMINA_MAX = 100;
const STAMINA_REGEN_PER_SEC = 20;
const DASH_COST = 30;
const DASH_FORCE = 420;
const DASH_COOLDOWN_MS = 300;
const DASH_DURATION_MS = 150;

// Стрелки
const ARCHER_RANGE = 260;
const ARCHER_SHOOT_COOLDOWN_MS = 1800;
const PROJECTILE_SPEED = 300;
const PROJECTILE_RADIUS = 6;

// Дуэль
const DUEL_TRIGGER_DISTANCE = 55;
const DUEL_SEQUENCE_LENGTH_SMALL = 2;  // обычный враг
const DUEL_SEQUENCE_LENGTH_ELITE = 5;  // элитный враг
const DUEL_SEQUENCE_LENGTH_ARCHER = 2; // стрелок (треугольник)
const DUEL_TIME_LIMIT_MS = 4000;       // сколько времени даётся

type EnemyType = 'small' | 'elite' | 'archer';

type DuelState = {
  active: boolean;
  enemy: Phaser.GameObjects.Shape;
  enemyType: EnemyType;
  sequence: ('Q' | 'E')[];
  index: number;
  startedAt: number;
  ui: Phaser.GameObjects.Container;
  timeBar: Phaser.GameObjects.Rectangle;
};

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

  private scoreText!: Phaser.GameObjects.Text;
  private score = 0;

  private hpText!: Phaser.GameObjects.Text;
  private hp = 3;
  private invulnerableUntil = 0;

  private staminaText!: Phaser.GameObjects.Text;
  private stamina = STAMINA_MAX;
  private lastStaminaTick = 0;
  private lastDash = 0;
  private dashUntil = 0;
  private dashDirX = 0;
  private dashDirY = 0;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  private paused = false;
  private pausedAt = 0;
  private pauseLabel: Phaser.GameObjects.Text | null = null;

  private timerText!: Phaser.GameObjects.Text;
  private timeLeft = GAME_DURATION_SEC;
  private gameOver = false;
  private hordeAnnounced = false;

  private enemies: Phaser.GameObjects.Shape[] = [];
  private enemyTypes = new WeakMap<Phaser.GameObjects.Shape, EnemyType>();
  private enemyNextShot = new WeakMap<Phaser.GameObjects.Shape, number>();

  private projectiles: Phaser.GameObjects.Shape[] = [];
  private projectileVel = new WeakMap<Phaser.GameObjects.Shape, { x: number; y: number }>();

  private duel: DuelState | null = null;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('GameScene');
  }

  create(): void {
    // Сброс состояния при рестарте
    this.score = 0;
    this.hp = 3;
    this.invulnerableUntil = 0;
    this.stamina = STAMINA_MAX;
    this.lastStaminaTick = 0;
    this.lastDash = 0;
    this.dashUntil = 0;
    this.dashDirX = 0;
    this.dashDirY = 0;
    this.timeLeft = GAME_DURATION_SEC;
    this.gameOver = false;
    this.paused = false;
    this.pauseLabel = null;
    this.enemies = [];
    this.projectiles = [];
    this.duel = null;
    this.hordeAnnounced = false;

    const { width, height } = this.scale;

    this.player = this.add.rectangle(width / 2, height / 2, 42, 42, 0x38bdf8);

    this.scoreText = this.add.text(24, height - 48, 'Score: 0', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#ffffff',
    });

    this.hpText = this.add.text(24, height - 80, `HP: ${this.hp}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#f87171',
    });

    this.staminaText = this.add.text(24, height - 112, `Stamina: ${Math.floor(this.stamina)}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#38bdf8',
    });
    this.add.text(24, height - 144, 'Space - рывок', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#cbd5e1',
    });

    this.timerText = this.add
      .text(width - 24, height - 48, `Time: ${this.timeLeft}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(1, 0);

    if (!this.input.keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

    this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keyQ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // A и D в дуэли не должны двигать игрока
    this.keyA.on('down', () => {});
    this.keyD.on('down', () => {});
    this.keyQ.on('down', () => this.handleDuelInput('Q'));
    this.keyE.on('down', () => this.handleDuelInput('E'));

    this.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => this.spawnEnemy(),
    });

    this.spawnEnemy();

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.gameOver || this.duel?.active || this.paused) return;
        this.timeLeft -= 1;
        this.timerText.setText(`Time: ${this.timeLeft}`);
        if (!this.hordeAnnounced && this.timeLeft <= GAME_DURATION_SEC - UNIQUE_ENEMIES_AFTER_SEC) {
          this.hordeAnnounced = true;
          this.showHordaWarning();
        }
        if (this.timeLeft <= 0) {
          this.endGame('Время вышло!');
        }
      },
    });
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
        this.scene.restart();
      }
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.togglePause(_time);
    }
    if (this.paused) return;

    // Восстановление стамины
    if (_time - this.lastStaminaTick > 100) {
      this.lastStaminaTick = _time;
      this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN_PER_SEC * 0.1);
      this.staminaText.setText(`Stamina: ${Math.floor(this.stamina)}`);
    }

    // Время дуэли - заморозка
    if (this.duel?.active) {
      this.updateDuelTimer();
      return;
    }

    const seconds = delta / 1000;
    const dashPressed = Phaser.Input.Keyboard.JustDown(this.keySpace);
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      const ndx = dx / length;
      const ndy = dy / length;
      this.player.x += ndx * PLAYER_SPEED * seconds;
      this.player.y += ndy * PLAYER_SPEED * seconds;

      if (dashPressed &&
          _time - this.lastDash >= DASH_COOLDOWN_MS &&
          _time >= this.dashUntil &&
          this.stamina >= DASH_COST) {
        this.lastDash = _time;
        this.dashUntil = _time + DASH_DURATION_MS;
        this.dashDirX = ndx;
        this.dashDirY = ndy;
        this.stamina -= DASH_COST;
        this.staminaText.setText(`Stamina: ${Math.floor(this.stamina)}`);
      }
    }

    // Рывок: короткий мощный рывок в выбранном направлении
    if (_time < this.dashUntil) {
      this.player.x += this.dashDirX * DASH_FORCE * seconds;
      this.player.y += this.dashDirY * DASH_FORCE * seconds;
    }

    this.keepPlayerOnScreen();
    this.updateEnemies(seconds);
    this.updateProjectiles(seconds);
    this.checkDuelTrigger();
  }

  // ---------- Враги ----------

  private spawnEnemy(): void {
    if (this.gameOver || this.duel?.active || this.paused) return;

    const { width, height } = this.scale;
    const side = Phaser.Math.Between(0, 3);
    let x = 0;
    let y = 0;

    if (side === 0) {
      x = Phaser.Math.Between(0, width);
      y = 120;
    } else if (side === 1) {
      x = Phaser.Math.Between(0, width);
      y = height;
    } else if (side === 2) {
      x = 0;
      y = Phaser.Math.Between(120, height);
    } else {
      x = width;
      y = Phaser.Math.Between(120, height);
    }

    // До UNIQUE_ENEMIES_AFTER_SEC секунды раунда - только слабые красные кружочки
    const elapsed = GAME_DURATION_SEC - this.timeLeft;
    const uniquesAllowed = elapsed >= UNIQUE_ENEMIES_AFTER_SEC;
    const roll = Phaser.Math.FloatBetween(0, 1);
    if (uniquesAllowed && roll < 0.2) {
      // Стрелок (жёлтый треугольник)
      const enemy = this.add.triangle(x, y, 0, -20, -16, 20, 16, 20, 0xfacc15);
      this.enemies.push(enemy as unknown as Phaser.GameObjects.Shape);
      this.enemyTypes.set(enemy as unknown as Phaser.GameObjects.Shape, 'archer');
      this.enemyNextShot.set(enemy as unknown as Phaser.GameObjects.Shape, this.time.now + ARCHER_SHOOT_COOLDOWN_MS);
    } else if (uniquesAllowed && roll < 0.7) {
      // Элитный
      const enemy = this.add.circle(x, y, 24, 0x991b1b);
      this.enemies.push(enemy);
      this.enemyTypes.set(enemy, 'elite');
    } else {
      // Обычный
      const enemy = this.add.circle(x, y, 16, 0xef4444);
      this.enemies.push(enemy);
      this.enemyTypes.set(enemy, 'small');
    }
  }

  private updateEnemies(seconds: number): void {
    this.enemies.forEach((enemy) => {
      const angle = Phaser.Math.Angle.Between(
        enemy.x,
        enemy.y,
        this.player.x,
        this.player.y,
      );
      const type = this.enemyTypes.get(enemy);

      if (type === 'archer') {
        const distance = Phaser.Math.Distance.Between(
          enemy.x, enemy.y, this.player.x, this.player.y,
        );
        // Держит дистанцию: подходит издалека, отходит вблизи
        let isRetreating = false;
        if (distance > ARCHER_RANGE + 40) {
          enemy.x += Math.cos(angle) * ENEMY_SPEED * seconds;
          enemy.y += Math.sin(angle) * ENEMY_SPEED * seconds;
        } else if (distance < ARCHER_RANGE - 40) {
          enemy.x -= Math.cos(angle) * ENEMY_SPEED * seconds;
          enemy.y -= Math.sin(angle) * ENEMY_SPEED * seconds;
          isRetreating = true;
        }

        // Стреляет только когда не убегает
        const nextShot = this.enemyNextShot.get(enemy) ?? 0;
        if (!isRetreating && this.time.now >= nextShot && distance <= ARCHER_RANGE * 1.5) {
          this.enemyNextShot.set(enemy, this.time.now + ARCHER_SHOOT_COOLDOWN_MS);
          this.fireProjectile(enemy, angle);
        }
      } else {
        enemy.x += Math.cos(angle) * ENEMY_SPEED * seconds;
        enemy.y += Math.sin(angle) * ENEMY_SPEED * seconds;
      }
    });
  }

  private fireProjectile(enemy: Phaser.GameObjects.Shape, angle: number): void {
    const projectile = this.add.circle(
      enemy.x,
      enemy.y,
      PROJECTILE_RADIUS,
      0xfacc15,
    );
    this.projectiles.push(projectile);
    this.projectileVel.set(projectile, {
      x: Math.cos(angle) * PROJECTILE_SPEED,
      y: Math.sin(angle) * PROJECTILE_SPEED,
    });
  }

  private updateProjectiles(seconds: number): void {
    const { width, height } = this.scale;
    const playerRadius = this.player.width / 2;

    this.projectiles = this.projectiles.filter((projectile) => {
      const vel = this.projectileVel.get(projectile);
      if (!vel) return false;

      projectile.x += vel.x * seconds;
      projectile.y += vel.y * seconds;

      if (projectile.x < -20 || projectile.x > width + 20 ||
          projectile.y < -20 || projectile.y > height + 20) {
        projectile.destroy();
        return false;
      }

      const distance = Phaser.Math.Distance.Between(
        projectile.x, projectile.y, this.player.x, this.player.y,
      );
      if (distance < playerRadius + PROJECTILE_RADIUS) {
        projectile.destroy();
        if (this.time.now >= this.invulnerableUntil) {
          this.damagePlayer();
        }
        return false;
      }

      return true;
    });
  }

  private showHordaWarning(): void {
    const label = this.add
      .text(this.scale.width / 2, 160, 'Орда на подходе!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '32px',
        color: '#facc15',
        backgroundColor: '#000000aa',
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(180);

    this.tweens.add({
      targets: label,
      alpha: 0,
      delay: 1800,
      duration: 700,
      onComplete: () => label.destroy(),
    });
  }

  private togglePause(now: number): void {
    this.paused = !this.paused;

    if (this.paused) {
      this.pausedAt = now;
      this.pauseLabel = this.add
        .text(this.scale.width / 2, this.scale.height / 2, 'Пауза\nESC - продолжить', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '32px',
          color: '#ffffff',
          align: 'center',
          backgroundColor: '#000000aa',
          padding: { x: 24, y: 12 },
        })
        .setOrigin(0.5)
        .setDepth(150);
    } else {
      this.pauseLabel?.destroy();
      this.pauseLabel = null;
      // Продлеваем таймер дуэли на время паузы
      if (this.duel) {
        this.duel.startedAt += now - this.pausedAt;
      }
    }
  }

  // ---------- Триггер дуэли ----------

  private checkDuelTrigger(): void {
    if (this.duel?.active) return;
    //if (this.time.now < this.invulnerableUntil) return;

    for (const enemy of this.enemies) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y,
      );
      if (distance < DUEL_TRIGGER_DISTANCE) {
        this.startDuel(enemy);
        return;
      }
    }
  }

  private startDuel(enemy: Phaser.GameObjects.Shape): void {
    const type = this.enemyTypes.get(enemy) ?? 'small';
    let seqLen = DUEL_SEQUENCE_LENGTH_SMALL;
    if (type === 'elite') seqLen = DUEL_SEQUENCE_LENGTH_ELITE;
    if (type === 'archer') seqLen = DUEL_SEQUENCE_LENGTH_ARCHER;
    const sequence: ('Q' | 'E')[] = [];
    for (let i = 0; i < seqLen; i++) {
      sequence.push(Phaser.Math.Between(0, 1) === 0 ? 'Q' : 'E');
    }

    const ui = this.buildDuelUI(sequence);

    this.duel = {
      active: true,
      enemy,
      enemyType: type,
      sequence,
      index: 0,
      startedAt: this.time.now,
      ui,
      timeBar: ui.getByName('timeBar') as Phaser.GameObjects.Rectangle,
    };
  }

  private buildDuelUI(sequence: ('Q' | 'E')[]): Phaser.GameObjects.Container {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Затемнение
    const overlay = this.add
      .rectangle(cx, cy, width, height, 0x000000, 0.55)
      .setDepth(100);

    // Панель
    const panel = this.add
      .rectangle(cx, cy, 520, 240, 0x0f172a, 0.95)
      .setStrokeStyle(2, 0x38bdf8)
      .setDepth(101);

    const title = this.add
      .text(cx, cy - 90, 'ДУЭЛЬ!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '32px',
        color: '#facc15',
      })
      .setOrigin(0.5)
      .setDepth(102);

    const hint = this.add
      .text(cx, cy - 50, 'Нажимай Q и E в правильном порядке!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5)
      .setDepth(102);

    // Полоса времени
    const barBg = this.add
      .rectangle(cx, cy + 80, 440, 16, 0x1e293b)
      .setDepth(102);
    const timeBar = this.add
      .rectangle(cx - 220, cy + 80, 440, 16, 0x38bdf8)
      .setOrigin(0, 0.5)
      .setDepth(103);
    timeBar.setName('timeBar');

    // Кнопки-индикаторы
    const container = this.add.container(0, 0).setDepth(102);
    container.add([overlay, panel, title, hint, barBg, timeBar]);

    const startX = cx - ((sequence.length - 1) * 70) / 2;
    sequence.forEach((key, i) => {
      const keyBg = this.add
        .rectangle(startX + i * 70, cy, 56, 56, 0x1e293b)
        .setStrokeStyle(2, 0x64748b)
        .setName(`key-${i}`)
        .setDepth(102);
      const keyText = this.add
        .text(startX + i * 70, cy, key, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '28px',
          color: '#e2e8f0',
        })
        .setOrigin(0.5)
        .setDepth(103);

      container.add([keyBg, keyText]);
    });

    return container;
  }

  private updateDuelTimer(): void {
    if (!this.duel) return;

    const elapsed = this.time.now - this.duel.startedAt;
    const remaining = Math.max(0, 1 - elapsed / DUEL_TIME_LIMIT_MS);

    this.duel.timeBar.width = 440 * remaining;

    if (remaining <= 0) {
      this.failDuel();
    }
  }

  private handleDuelInput(key: 'Q' | 'E'): void {
    if (!this.duel?.active || this.gameOver) return;

    const expected = this.duel.sequence[this.duel.index];
    const ui = this.duel.ui;

    const keyBg = ui.getByName(`key-${this.duel.index}`) as Phaser.GameObjects.Rectangle;

    if (key === expected) {
      // Подсветить зелёным
      keyBg.setFillStyle(0x22c55e);
      keyBg.setStrokeStyle(2, 0x86efac);
      this.duel.index += 1;

      if (this.duel.index >= this.duel.sequence.length) {
        this.winDuel();
      }
    } else {
      // Подсветить красным и сразу проигрыш
      keyBg.setFillStyle(0xef4444);
      keyBg.setStrokeStyle(2, 0xfca5a5);
      this.failDuel();
    }
  }

  private winDuel(): void {
    if (!this.duel) return;
    const enemy = this.duel.enemy;

    // Убираем врага
    enemy.destroy();
    this.enemies = this.enemies.filter((e) => e !== enemy);

    // Очки только за победу над врагом
    this.score += 1;
    this.scoreText.setText(`Score: ${this.score}`);

    this.closeDuelUI();
    this.duel = null;
    this.invulnerableUntil = this.time.now + INVULNERABILITY_MS;
  }

  private failDuel(): void {
    if (!this.duel) return;
    const enemy = this.duel.enemy;

    this.closeDuelUI();
    this.duel = null;

    // Отталкиваем врага, чтобы не начать дуэль заново мгновенно
    const angle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      enemy.x,
      enemy.y,
    );
    enemy.x += Math.cos(angle) * 140;
    enemy.y += Math.sin(angle) * 140;

    this.damagePlayer();
  }

  private closeDuelUI(): void {
    if (!this.duel) return;
    this.duel.ui.destroy(true);
  }

  // ---------- Урон / конец игры ----------

  private damagePlayer(): void {
    this.hp -= 1;
    this.hpText.setText(`HP: ${this.hp}`);
    this.invulnerableUntil = this.time.now + INVULNERABILITY_MS;

    this.player.setFillStyle(0xffffff);
    this.time.delayedCall(150, () => {
      if (!this.gameOver) this.player.setFillStyle(0x38bdf8);
    });

    if (this.hp <= 0) {
      this.endGame('Ты проиграл!');
    }
  }

  private keepPlayerOnScreen(): void {
    const half = this.player.width / 2;
    this.player.x = Phaser.Math.Clamp(this.player.x, half, this.scale.width - half);
    this.player.y = Phaser.Math.Clamp(this.player.y, 110 + half, this.scale.height - half);
  }

  private endGame(message: string): void {
    if (this.gameOver) return;
    this.gameOver = true;

    // Закрыть дуэль, если была открыта
    if (this.duel) {
      this.closeDuelUI();
      this.duel = null;
    }

    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, message, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '48px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5)
      .setDepth(200);

    this.add
      .text(width / 2, height / 2 + 60, `Итоговый счёт: ${this.score}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        color: '#facc15',
      })
      .setOrigin(0.5)
      .setDepth(200);

    this.add
      .text(width / 2, height / 2 + 110, 'Нажми R - рестарт', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5)
      .setDepth(200);
  }
}