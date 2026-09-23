// context/ChallengeContext.tsx
//
// Estado do Desafio Diário. Fica fora das telas (montado uma vez em
// App.tsx, acima do NavigationContainer) pelo mesmo motivo do
// ProfileContext: o desafio atravessa VÁRIAS telas — flexão, descanso,
// abdominal, descanso, agachamento, resultado — e cada troca de rota
// monta/desmonta componentes. Um estado guardado dentro de qualquer uma
// dessas telas seria perdido no caminho.
//
// O desafio é uma máquina de estados bem pequena:
//
//   startChallenge()  →  status 'running', stepIndex 0
//   completeStep()    →  guarda o resultado e avança; no último vira 'completed'
//   failStep()        →  guarda o resultado parcial e vira 'failed' (acabou)
//   finishChallenge() →  entrega as recompensas no perfil e fecha a sessão
//
// Regra do desafio (é o que diferencia de um treino normal): sair da
// posição em QUALQUER exercício encerra tudo. Nesse caso o usuário leva
// só o XP das repetições que realmente fez — sem moedas e sem troféus.

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';

export type ChallengeExerciseId = 'pushup' | 'situp' | 'squat';
export type ChallengeDifficulty = 'easy' | 'normal' | 'hard' | 'expert';

/** Ordem de progressão das dificuldades — é a ordem dos bíceps no card. */
export const DIFFICULTY_ORDER: ChallengeDifficulty[] = [
  'easy',
  'normal',
  'hard',
  'expert',
];

export type ChallengeStep = {
  id: ChallengeExerciseId;
  /** Rota da tela de treino correspondente. */
  route: 'Pushup' | 'Situp' | 'Squat';
  /** Quantas repetições válidas fecham esta etapa. */
  reps: number;
  /** Nome do exercício no plural, pro HUD e pro resumo. */
  label: string;
};

export type ChallengeRewards = {
  coins: number;
  xp: number;
  trophies: number;
};

export type ChallengeTier = {
  id: ChallengeDifficulty;
  label: string;
  /**
   * Cor de destaque da dificuldade. Pinta o bíceps correspondente no card
   * e TUDO que era verde durante o desafio (contador, esqueleto, descanso,
   * tela de parabéns...), pra cada nível ter a sua identidade.
   */
  color: string;
  steps: ChallengeStep[];
  rewards: ChallengeRewards;
};

// ---------------------------------------------------------------------------
// Tabela de dificuldades
// ---------------------------------------------------------------------------
// Tudo que muda entre um desafio "fácil" e um "expert" está aqui: as metas
// de repetição e o prêmio. A ordem das etapas é sempre flexão → abdominal →
// agachamento. Para reequilibrar o desafio depois, é este bloco que se mexe
// — nada no resto do código precisa saber quais são os números.
export const CHALLENGE_TIERS: Record<ChallengeDifficulty, ChallengeTier> = {
  easy: {
    id: 'easy',
    label: 'FÁCIL',
    color: '#00ff88',
    steps: [
      { id: 'pushup', route: 'Pushup', reps: 10, label: 'FLEXÕES' },
      { id: 'situp', route: 'Situp', reps: 15, label: 'ABDOMINAIS' },
      { id: 'squat', route: 'Squat', reps: 20, label: 'AGACHAMENTOS' },
    ],
    rewards: { coins: 45, xp: 30, trophies: 10 },
  },
  normal: {
    id: 'normal',
    label: 'NORMAL',
    color: '#2f6bff',
    steps: [
      { id: 'pushup', route: 'Pushup', reps: 15, label: 'FLEXÕES' },
      { id: 'situp', route: 'Situp', reps: 25, label: 'ABDOMINAIS' },
      { id: 'squat', route: 'Squat', reps: 30, label: 'AGACHAMENTOS' },
    ],
    rewards: { coins: 70, xp: 50, trophies: 15 },
  },
  hard: {
    id: 'hard',
    label: 'DIFÍCIL',
    color: '#ff8c1a',
    steps: [
      { id: 'pushup', route: 'Pushup', reps: 25, label: 'FLEXÕES' },
      { id: 'situp', route: 'Situp', reps: 40, label: 'ABDOMINAIS' },
      { id: 'squat', route: 'Squat', reps: 50, label: 'AGACHAMENTOS' },
    ],
    rewards: { coins: 110, xp: 80, trophies: 25 },
  },
  expert: {
    id: 'expert',
    label: 'EXPERT',
    color: '#ff4fa3',
    steps: [
      { id: 'pushup', route: 'Pushup', reps: 40, label: 'FLEXÕES' },
      { id: 'situp', route: 'Situp', reps: 60, label: 'ABDOMINAIS' },
      { id: 'squat', route: 'Squat', reps: 80, label: 'AGACHAMENTOS' },
    ],
    rewards: { coins: 180, xp: 130, trophies: 40 },
  },
};

/** Verde padrão do app — o que as telas de treino usam fora do desafio. */
export const DEFAULT_ACCENT = '#00ff88';

/** '#rrggbb' + alpha (0–1) → 'rgba(...)', pra halos/bordas translúcidas na cor do nível. */
export function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Segundos de descanso entre um exercício e o próximo. */
export const CHALLENGE_REST_SECONDS = 10;

export type ChallengeStepResult = {
  id: ChallengeExerciseId;
  /** Repetições válidas feitas nesta etapa. */
  reps: number;
  /** XP ganho pelas repetições (já na escala do próprio exercício). */
  xp: number;
  calories: number;
  seconds: number;
};

export type ChallengeStatus = 'idle' | 'running' | 'failed' | 'completed';

type ChallengeSession = {
  difficulty: ChallengeDifficulty;
  /** Índice da etapa atual dentro de tier.steps. */
  stepIndex: number;
  results: ChallengeStepResult[];
  status: Exclude<ChallengeStatus, 'idle'>;
  /** Em qual exercício o usuário perdeu o desafio (null se não perdeu). */
  failedAt: ChallengeExerciseId | null;
};

export type ChallengeTotals = {
  reps: number;
  /** XP só das repetições — sem o bônus do desafio. */
  xp: number;
  calories: number;
  seconds: number;
  /** Repetições por exercício, na ordem das etapas do tier. */
  perExercise: {
    id: ChallengeExerciseId;
    label: string;
    reps: number;
    goal: number;
  }[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

type ChallengeContextValue = {
  /** Dificuldade do desafio de hoje (fora de qualquer sessão). */
  difficulty: ChallengeDifficulty;
  tier: ChallengeTier;
  status: ChallengeStatus;
  /** Etapa que está valendo agora, ou null se o desafio acabou/não começou. */
  currentStep: ChallengeStep | null;
  /** Posição da etapa atual, 1-based — pro HUD ("1/3"). */
  stepNumber: number;
  totalSteps: number;
  failedAt: ChallengeExerciseId | null;
  totals: ChallengeTotals;
  rewards: ChallengeRewards;
  /** Troca a dificuldade do próximo desafio (tocando nos bíceps do card). */
  selectDifficulty: (difficulty: ChallengeDifficulty) => void;
  startChallenge: () => ChallengeStep;
  /** Fecha a etapa atual. Devolve true se ainda existe uma próxima. */
  completeStep: (result: ChallengeStepResult) => boolean;
  /** Encerra o desafio por saída de posição/desistência. */
  failStep: (result: ChallengeStepResult) => void;
  /** Aplica as recompensas no perfil e limpa a sessão. */
  finishChallenge: () => void;
  /** Descarta a sessão sem entregar nada. */
  abandonChallenge: () => void;
};

const ChallengeContext = createContext<ChallengeContextValue | null>(null);

export function ChallengeProvider({
  children,
  onGrantRewards,
}: {
  children: ReactNode;
  /**
   * Como as recompensas chegam no perfil. Injetado de fora (App.tsx) em
   * vez de o Provider chamar useProfile() direto — assim este arquivo não
   * depende da forma do perfil, e trocar o ProfileContext por Supabase
   * depois não mexe em nada aqui.
   */
  onGrantRewards: (rewards: { xp: number; coins: number; trophies: number }) => void;
}) {
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty>('easy');

  // A sessão vive em ref E em estado: o ref é a fonte da verdade para
  // leituras síncronas (completeStep precisa responder "tem próxima?" na
  // mesma chamada, antes de qualquer re-render), e o estado é o que faz a
  // UI redesenhar.
  const sessionRef = useRef<ChallengeSession | null>(null);
  const [session, setSession] = useState<ChallengeSession | null>(null);

  const applySession = useCallback((next: ChallengeSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  // Durante uma sessão manda a dificuldade em que ela começou: se o desafio
  // subir de degrau no fim, a tela de resultado ainda precisa mostrar as
  // metas do desafio que acabou de ser jogado.
  const activeDifficulty = session?.difficulty ?? difficulty;
  const tier = CHALLENGE_TIERS[activeDifficulty];

  const startChallenge = useCallback(() => {
    applySession({
      difficulty,
      stepIndex: 0,
      results: [],
      status: 'running',
      failedAt: null,
    });
    return CHALLENGE_TIERS[difficulty].steps[0];
  }, [applySession, difficulty]);

  const completeStep = useCallback(
    (result: ChallengeStepResult) => {
      const current = sessionRef.current;
      if (!current || current.status !== 'running') return false;

      const steps = CHALLENGE_TIERS[current.difficulty].steps;
      const nextIndex = current.stepIndex + 1;
      const hasNext = nextIndex < steps.length;

      applySession({
        ...current,
        stepIndex: nextIndex,
        results: [...current.results, result],
        status: hasNext ? 'running' : 'completed',
      });

      return hasNext;
    },
    [applySession]
  );

  const failStep = useCallback(
    (result: ChallengeStepResult) => {
      const current = sessionRef.current;
      if (!current || current.status !== 'running') return;

      applySession({
        ...current,
        results: [...current.results, result],
        status: 'failed',
        failedAt: result.id,
      });
    },
    [applySession]
  );

  const finishChallenge = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;

    const repsXp = round1(current.results.reduce((sum, r) => sum + r.xp, 0));

    if (current.status === 'completed') {
      const bonus = CHALLENGE_TIERS[current.difficulty].rewards;
      onGrantRewards({
        xp: round1(repsXp + bonus.xp),
        coins: bonus.coins,
        trophies: bonus.trophies,
      });

      // Concluiu: o próximo desafio sobe um degrau. É o que dá sentido às
      // quatro dificuldades enquanto não existe um desafio sorteado por
      // dia vindo do servidor. Para travar sempre no fácil, apague este
      // bloco — nada mais depende dele.
      setDifficulty((prev) => {
        const index = DIFFICULTY_ORDER.indexOf(prev);
        return DIFFICULTY_ORDER[Math.min(index + 1, DIFFICULTY_ORDER.length - 1)];
      });
    } else {
      // Perdeu: leva só o XP do que realmente fez. Sem moedas, sem troféus.
      onGrantRewards({ xp: repsXp, coins: 0, trophies: 0 });
    }

    applySession(null);
  }, [applySession, onGrantRewards]);

  // Só vale fora de uma sessão: no meio do desafio a dificuldade é a que
  // ele começou, e trocar ali embaralharia metas e prêmio.
  const selectDifficulty = useCallback((next: ChallengeDifficulty) => {
    if (sessionRef.current) return;
    setDifficulty(next);
  }, []);

  const abandonChallenge = useCallback(() => {
    applySession(null);
  }, [applySession]);

  const totals = useMemo<ChallengeTotals>(() => {
    const results = session?.results ?? [];
    const byId = new Map(results.map((r) => [r.id, r]));

    return {
      reps: results.reduce((sum, r) => sum + r.reps, 0),
      xp: round1(results.reduce((sum, r) => sum + r.xp, 0)),
      calories: round1(results.reduce((sum, r) => sum + r.calories, 0)),
      seconds: results.reduce((sum, r) => sum + r.seconds, 0),
      perExercise: tier.steps.map((step) => ({
        id: step.id,
        label: step.label,
        reps: byId.get(step.id)?.reps ?? 0,
        goal: step.reps,
      })),
    };
  }, [session, tier]);

  const value = useMemo<ChallengeContextValue>(() => {
    const status: ChallengeStatus = session?.status ?? 'idle';
    const stepIndex = session?.stepIndex ?? 0;

    return {
      difficulty,
      tier,
      status,
      currentStep: status === 'running' ? tier.steps[stepIndex] ?? null : null,
      stepNumber: Math.min(stepIndex + 1, tier.steps.length),
      totalSteps: tier.steps.length,
      failedAt: session?.failedAt ?? null,
      totals,
      rewards: tier.rewards,
      selectDifficulty,
      startChallenge,
      completeStep,
      failStep,
      finishChallenge,
      abandonChallenge,
    };
  }, [
    difficulty,
    tier,
    session,
    totals,
    selectDifficulty,
    startChallenge,
    completeStep,
    failStep,
    finishChallenge,
    abandonChallenge,
  ]);

  return (
    <ChallengeContext.Provider value={value}>{children}</ChallengeContext.Provider>
  );
}

export function useChallenge() {
  const ctx = useContext(ChallengeContext);
  if (!ctx) {
    throw new Error('useChallenge() precisa ser usado dentro de <ChallengeProvider>.');
  }
  return ctx;
}
