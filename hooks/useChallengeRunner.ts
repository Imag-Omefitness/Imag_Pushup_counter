// hooks/useChallengeRunner.ts
//
// A ponte entre uma tela de treino e o Desafio Diário. As três telas
// (flexão, abdominal, agachamento) são as MESMAS no desafio e fora dele —
// o que muda é só o fim: em vez de abrir o modal de resumo, a etapa fecha
// e a navegação segue pro descanso / próxima etapa / resultado.
//
// Toda essa diferença mora aqui, num lugar só, pra não triplicar a regra
// nas três telas. Cada tela precisa apenas:
//
//   const runner = useChallengeRunner('pushup');
//   ... if (runner.isActive && count >= runner.targetReps) runner.settle('done', {...})
//   ... if (saiu da posição) runner.settle('failed', {...})
//
// e usar runner.isActive pra decidir se mostra o modal de resumo normal.

import { useCallback, useRef } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useChallenge, ChallengeExerciseId } from '../context/ChallengeContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export type ChallengeStepStats = {
  reps: number;
  xp: number;
  calories: number;
  seconds: number;
};

export function useChallengeRunner(exercise: ChallengeExerciseId) {
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const challenge = useChallenge();

  // "Esta tela faz parte do desafio" é decidido UMA vez, na montagem, e
  // congelado num ref. Sem isso o valor mudaria no meio do caminho: assim
  // que completeStep() avança a sessão, currentStep já aponta pro próximo
  // exercício, e a tela que ainda está montada (a navegação leva um frame)
  // piscaria de volta pro modo treino livre, com a meta trocada.
  const activeRef = useRef<boolean | null>(null);
  const targetRef = useRef(0);
  const stepNumberRef = useRef(1);
  const totalStepsRef = useRef(1);

  if (activeRef.current === null) {
    const flaggedByRoute =
      (route.params as { challenge?: boolean } | undefined)?.challenge === true;
    const step = challenge.currentStep;
    const matches =
      flaggedByRoute && !!step && step.id === exercise && challenge.status === 'running';

    activeRef.current = matches;
    if (matches && step) {
      targetRef.current = step.reps;
      stepNumberRef.current = challenge.stepNumber;
      totalStepsRef.current = challenge.totalSteps;
    }
  }

  // Uma etapa só se fecha uma vez. A meta pode ser batida e o "saiu da
  // posição" disparar no mesmo instante (o usuário desaba logo depois da
  // última repetição) — quem chegar primeiro decide.
  const settledRef = useRef(false);

  const settle = useCallback(
    (outcome: 'done' | 'failed', stats: ChallengeStepStats) => {
      if (!activeRef.current || settledRef.current) return false;
      settledRef.current = true;

      const result = { id: exercise, ...stats };

      if (outcome === 'failed') {
        challenge.failStep(result);
        navigation.replace('ChallengeResult');
        return true;
      }

      const hasNext = challenge.completeStep(result);
      // replace, não navigate: a tela de treino que acabou não deve ficar
      // na pilha. O botão "voltar" do Android no meio do desafio não pode
      // reabrir uma etapa já fechada (e uma câmera já desligada).
      navigation.replace(hasNext ? 'ChallengeRest' : 'ChallengeResult');
      return true;
    },
    [challenge, exercise, navigation]
  );

  return {
    /** Esta tela está rodando como etapa do desafio? */
    isActive: !!activeRef.current,
    /** Repetições que fecham a etapa (0 fora do desafio). */
    targetReps: targetRef.current,
    /** Posição da etapa no desafio, 1-based — pro HUD. */
    stepNumber: stepNumberRef.current,
    totalSteps: totalStepsRef.current,
    /** A etapa já foi fechada (evita reabrir modais durante a saída). */
    isSettled: () => settledRef.current,
    settle,
  };
}
