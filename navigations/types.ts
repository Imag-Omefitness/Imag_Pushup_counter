// navigation/types.ts
// Lista central de todas as rotas do app + os parâmetros que cada uma
// recebe. Usado pra dar autocomplete/checagem de tipo em toda navegação.

// navigation/types.ts

export type RootStackParamList = {
  Home: { gainedXp?: number } | undefined;
  Pushup: undefined;
  Situp: undefined;
};
