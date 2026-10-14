import Phaser from 'phaser';

const PLAYER_SPEED = 260;
const ENEMY_SPEED = 90;
const INVULNERABILITY_MS = 1000;
const GAME_DURATION_SEC = 60;

// Дуэль
const DUEL_TRIGGER_DISTANCE = 55;
const DUEL_SEQUENCE_LENGTH = 5;      // сколько нажатий нужно сделать
const DUEL_TIME_LIMIT_MS = 4000;     // сколько времени даётся

type DuelState = {
  active: boolean;
  enemy: Phaser.GameObjects.Arc;
  sequence: ('A' | 'D')[];
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

  private timerText!: Phaser.GameObjects.Text;
  private timeLeft = GAME_DURATION_SEC;
  private gameOver = false;

  private enemies: Phaser.GameObjects.Arc[] = [];

  private duel: DuelState | null = null;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('GameScene');
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, 28, 'GAME DEV STARTER', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0);

    this.add
      .text(width / 2, 68, 'Стрелки / WASD — движение. Побеждай врагов в дуэлях!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5, 0);

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

    // A и D в дуэли не должны двигать игрока
    this.keyA.on('down', () => this.handleDuelInput('A'));
    this.keyD.on('down', () => this.handleDuelInput('D'));

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
        if (this.gameOver || this.duel?.active) return;
        this.timeLeft -= 1;
        this.timerText.setText(`Time: ${this.timeLeft}`);
        if (this.timeLeft <= 0) {
          this.endGame('Время вышло!');
        }
      },
    });
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;

    // Во время дуэли мир "замирает"
    if (this.duel?.active) {
      this.updateDuelTimer();
      return;
    }

    const seconds = delta / 1000;
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      this.player.x += (dx / length) * PLAYER_SPEED * seconds;
      this.player.y += (dy / length) * PLAYER_SPEED * seconds;
    }

    this.keepPlayerOnScreen();
    this.updateEnemies(seconds);
    this.checkDuelTrigger();
  }

  // ---------- Враги ----------

  private spawnEnemy(): void {
    if (this.gameOver || this.duel?.active) return;

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

    const enemy = this.add.circle(x, y, 16, 0xef4444);
    this.enemies.push(enemy);
  }

  private updateEnemies(seconds: number): void {
    this.enemies.forEach((enemy) => {
      const angle = Phaser.Math.Angle.Between(
        enemy.x,
        enemy.y,
        this.player.x,
        this.player.y,
      );
      enemy.x += Math.cos(angle) * ENEMY_SPEED * seconds;
      enemy.y += Math.sin(angle) * ENEMY_SPEED * seconds;
    });
  }

  // ---------- Триггер дуэли ----------

  private checkDuelTrigger(): void {
    if (this.duel?.active) return;
    if (this.time.now < this.invulnerableUntil) return;

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

  private startDuel(enemy: Phaser.GameObjects.Arc): void {
    // Генерируем случайную комбинацию A/D
    const sequence: ('A' | 'D')[] = [];
    for (let i = 0; i < DUEL_SEQUENCE_LENGTH; i++) {
      sequence.push(Phaser.Math.Between(0, 1) === 0 ? 'A' : 'D');
    }

    const ui = this.buildDuelUI(sequence);

    this.duel = {
      active: true,
      enemy,
      sequence,
      index: 0,
      startedAt: this.time.now,
      ui,
      timeBar: ui.getByName('timeBar') as Phaser.GameObjects.Rectangle,
    };
  }

  private buildDuelUI(sequence: ('A' | 'D')[]): Phaser.GameObjects.Container {
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
      .text(cx, cy - 50, 'Нажимай A и D в правильном порядке!', {
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

  private handleDuelInput(key: 'A' | 'D'): void {
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
  }
}