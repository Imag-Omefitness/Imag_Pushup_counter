// navigation/types.ts
// Lista central de todas as rotas do app + os parâmetros que cada uma
// recebe. Usado pra dar autocomplete/checagem de tipo em toda navegação.
//
// "Home" não recebe mais "gainedXp" pela rota — o ganho de XP agora passa
// pelo ProfileContext (context/ProfileContext.tsx), chamado direto de
// dentro de cada tela de treino via addXp(). Isso evita depender de params
// de navegação para algo que precisa ser confiável entre telas.

export type RootStackParamList = {
  Home: undefined;
  Pushup: undefined;
  Situp: undefined;
  Squat: undefined;
  Ranking: undefined;
};
