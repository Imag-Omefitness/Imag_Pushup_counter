// poseUtils.ts
// Funções puras (sem dependência de câmera/TF) — por isso são fáceis de testar
// isoladamente, inclusive num REPL do Replit, antes de plugar na câmera de verdade.

export type Keypoint = { x: number; y: number; score?: number; name?: string };

/**
 * Calcula o ângulo (em graus, 0–180) formado no ponto B pelos segmentos A-B e C-B.
 * Aqui usamos: ombro (A) - cotovelo (B) - pulso (C) para medir a flexão do braço.
 */
export function calculateAngle(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

export type Stage = 'up' | 'down' | 'unknown';

/**
 * Máquina de estados simples para contar flexões a partir do ângulo do cotovelo.
 *
 *  - ângulo > UP_THRESHOLD   -> braço estendido  ("up")
 *  - ângulo < DOWN_THRESHOLD -> braço flexionado ("down")
 *  - entre os dois limiares  -> mantém o estado anterior (zona morta, evita
 *    contar repetições falsas por causa de ruído/tremor na detecção)
 *
 * Uma repetição só é contada quando o ciclo completa down -> up.
 */
export class PushupCounter {
  private count = 0;
  private stage: Stage = 'unknown';

  private readonly UP_THRESHOLD = 160; // graus — braço quase esticado
  private readonly DOWN_THRESHOLD = 90; // graus — cotovelo dobrado ~90° ou mais

  update(angle: number): { newCount: number; newStage: Stage } {
    if (angle > this.UP_THRESHOLD) {
      if (this.stage === 'down') {
        this.count += 1;
      }
      this.stage = 'up';
    } else if (angle < this.DOWN_THRESHOLD) {
      this.stage = 'down';
    }

    return { newCount: this.count, newStage: this.stage };
  }

  reset() {
    this.count = 0;
    this.stage = 'unknown';
  }

  getState() {
    return { count: this.count, stage: this.stage };
  }
}
