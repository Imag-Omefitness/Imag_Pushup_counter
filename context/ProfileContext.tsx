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

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type ProfileState = {
  username: string;
  coins: number;
  level: number;
  xpCurrent: number;
  xpToNextLevel: number;
  trophies: number;
  rankName: string;
};

type ProfileContextValue = {
  profile: ProfileState;
  /** Adiciona XP e resolve level-up automaticamente (pode subir mais de 1 nível de uma vez). */
  addXp: (amount: number) => void;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

const INITIAL_PROFILE: ProfileState = {
  username: 'Atleta',
  coins: 100,
  level: 1,
  xpCurrent: 120,
  xpToNextLevel: 500,
  trophies: 0,
  rankName: 'MADEIRA',
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileState>(INITIAL_PROFILE);

  const addXp = (amount: number) => {
    if (!amount) return;

    setProfile((prev) => {
      let newXp = round1(prev.xpCurrent + amount);
      let newLevel = prev.level;
      let nextLevelXp = prev.xpToNextLevel;

      while (newXp >= nextLevelXp) {
        newLevel += 1;
        newXp = round1(newXp - nextLevelXp);
        nextLevelXp = Math.floor(nextLevelXp * 1.5);
      }

      return {
        ...prev,
        xpCurrent: newXp,
        level: newLevel,
        xpToNextLevel: nextLevelXp,
      };
    });
  };

  return (
    <ProfileContext.Provider value={{ profile, addXp }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile() precisa ser usado dentro de <ProfileProvider>.');
  }
  return ctx;
}
