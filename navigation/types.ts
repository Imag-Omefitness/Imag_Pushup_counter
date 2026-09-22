// navigation/types.ts
// Lista central de todas as rotas do app + os parâmetros que cada uma
// recebe. Usado pra dar autocomplete/checagem de tipo em toda navegação.
//
// "Home" não recebe mais "gainedXp" pela rota — o ganho de XP agora passa
// pelo ProfileContext (context/ProfileContext.tsx), chamado direto de
// dentro de cada tela de treino via addXp(). Isso evita depender de params
// de navegação para algo que precisa ser confiável entre telas.
//
// As três telas de treino recebem um único parâmetro opcional,
// `challenge`. Ele é só uma marca de "você entrou por dentro do Desafio
// Diário"; a meta de repetições, a etapa atual e o placar vêm do
// ChallengeContext, não da rota — params de navegação não sobreviveriam
// bem a um desafio que atravessa seis telas.

export type WorkoutRouteParams = { challenge?: boolean } | undefined;

export type RootStackParamList = {
  Home: undefined;
  Pushup: WorkoutRouteParams;
  Situp: WorkoutRouteParams;
  Squat: WorkoutRouteParams;
  Ranking: undefined;
  /** Aviso de aquecimento, entre o "INICIAR" e a primeira etapa. */
  ChallengeWarmup: undefined;
  /** Descanso de 10s entre uma etapa e a próxima. */
  ChallengeRest: undefined;
  /** Vitória ou derrota no fim do desafio. */
  ChallengeResult: undefined;
};
