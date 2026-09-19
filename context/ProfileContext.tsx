// context/ProfileContext.tsx
//
// O estado de perfil/XP mora AQUI, fora de qualquer tela — este Provider é
// montado uma única vez em App.tsx, acima do NavigationContainer. Isso é
// o que garante que o XP não reseta: antes ele vivia dentro de um
// useState() da HomeScreen, e qualquer remontagem dessa tela específica
// (algo que pode acontecer por diversos motivos ao navegar) zerava o
// progresso de volta para o valor inicial. Um Context acima da navegação
// não é afetado por isso — só é destruído se o app inteiro reiniciar.
//
// Observação: isso resolve o reset "entre telas". Se quiser que o XP
// sobreviva também a um fechamento completo do app, o próximo passo seria
// persistir com AsyncStorage — posso montar isso depois se for útil.

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Curva de níveis
// ---------------------------------------------------------------------------
// A fonte da verdade é o XP TOTAL acumulado — o nível é sempre derivado dele.
// É isso que faz a barra "resetar" a cada nível sem nunca zerar o total.
//
// Cada nível exige 10 XP a mais que o anterior:
//   LV 1:  100 → 200  (precisa de 100)
//   LV 2:  200 → 310  (precisa de 110)
//   LV 3:  310 → 430  (precisa de 120)
//   LV 4:  430 → 560  (precisa de 130)

/** XP total com que o nível 1 começa. */
export const STARTING_XP = 100;
/** XP exigido para fechar o nível 1. */
export const BASE_LEVEL_XP = 100;
/** Quanto a exigência cresce a cada nível. */
export const LEVEL_XP_STEP = 10;

/** Quanto XP o nível `level` exige para ser fechado. */
export function xpNeededForLevel(level: number): number {
  return BASE_LEVEL_XP + (level - 1) * LEVEL_XP_STEP;
}

/**
 * XP total no instante em que `level` começa. É a soma fechada de
 * `xpNeededForLevel` de 1 até level-1, sem laço.
 */
export function xpAtLevelStart(level: number): number {
  const n = level - 1;
  return STARTING_XP + BASE_LEVEL_XP * n + (LEVEL_XP_STEP * n * (n - 1)) / 2;
}

/** Nível correspondente a um XP total acumulado. */
export function levelFromTotalXp(xpTotal: number): number {
  let level = 1;
  // O laço é limitado: a exigência cresce, então isso converge rápido.
  while (xpTotal >= xpAtLevelStart(level) + xpNeededForLevel(level)) {
    level += 1;
  }
  return level;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------

export type ProfileState = {
  username: string;
  coins: number;
  /** XP total acumulado — nunca diminui, nem quando sobe de nível. */
  xpTotal: number;
  trophies: number;
  rankName: string;
  /** Dias seguidos de treino. Ainda fixo: a contagem real vem depois. */
  streakDays: number;
};

/** Perfil + campos derivados da curva de níveis, prontos para a UI. */
export type ProfileView = ProfileState & {
  level: number;
  /** XP já conquistado dentro do nível atual. */
  xpCurrent: number;
  /** XP que o nível atual exige por inteiro. */
  xpToNextLevel: number;
};

type ProfileContextValue = {
  profile: ProfileView;
  /** Adiciona XP ao total (o nível se resolve sozinho, por derivação). */
  addXp: (amount: number) => void;
  /**
   * Devolve — e zera — o XP ganho desde a última leitura. A HomeScreen usa
   * isso para saber de onde a barra deve começar a contar: ela anima de
   * (total - ganho) até total. Fica no Provider, e não na tela, porque a
   * HomeScreen pode remontar entre o fim do treino e a volta para ela.
   */
  consumePendingXp: () => number;
};

const INITIAL_PROFILE: ProfileState = {
  username: 'Atleta',
  coins: 100,
  xpTotal: 120,
  trophies: 0,
  rankName: 'MADEIRA',
  streakDays: 1,
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileState>(INITIAL_PROFILE);
  const pendingXp = useRef(0);

  const addXp = useCallback((amount: number) => {
    if (!amount) return;
    pendingXp.current = round1(pendingXp.current + amount);
    setProfile((prev) => ({ ...prev, xpTotal: round1(prev.xpTotal + amount) }));
  }, []);

  const consumePendingXp = useCallback(() => {
    const gained = pendingXp.current;
    pendingXp.current = 0;
    return gained;
  }, []);

  const view = useMemo<ProfileView>(() => {
    const level = levelFromTotalXp(profile.xpTotal);
    return {
      ...profile,
      level,
      xpCurrent: round1(profile.xpTotal - xpAtLevelStart(level)),
      xpToNextLevel: xpNeededForLevel(level),
    };
  }, [profile]);

  const value = useMemo<ProfileContextValue>(
    () => ({ profile: view, addXp, consumePendingXp }),
    [view, addXp, consumePendingXp]
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile() precisa ser usado dentro de <ProfileProvider>.');
  }
  return ctx;
}
