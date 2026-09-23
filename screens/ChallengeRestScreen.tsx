// screens/ChallengeRestScreen.tsx
// Descanso entre duas etapas do Desafio Diário: tela preta com contagem
// regressiva. Além de ser o respiro do usuário, esse intervalo tem um
// papel técnico: é nele que a WebView da etapa anterior desmonta e o
// Android solta o hardware da câmera antes da próxima tela pedir de novo
// (o mesmo problema de "câmera preta" já documentado nas telas de treino).

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import {
  useChallenge,
  CHALLENGE_REST_SECONDS,
  withAlpha,
} from '../context/ChallengeContext';
import { SPACING } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChallengeRest'>;

export default function ChallengeRestScreen({ navigation }: Props) {
  const challenge = useChallenge();
  const [seconds, setSeconds] = useState(CHALLENGE_REST_SECONDS);

  // A etapa que vem a seguir é congelada na montagem: o contexto continua
  // vivo durante a contagem e não queremos que um re-render troque o
  // destino no meio do caminho.
  const nextStepRef = useRef(challenge.currentStep);
  const stepNumberRef = useRef(challenge.stepNumber);
  const totalStepsRef = useRef(challenge.totalSteps);
  const nextStep = nextStepRef.current;
  const accent = challenge.tier.color;

  // Anel de progresso simples feito com escala/opacidade — sem SVG, já que
  // é só um pulso por segundo acompanhando o número.
  const tick = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!nextStep) {
      navigation.replace('Home');
      return;
    }

    // A contagem anda num contador local, não no estado: navegar de dentro
    // de um updater do setState é um efeito colateral no meio da renderização
    // (e o React pode reexecutar o updater), então o estado aqui serve só
    // para desenhar o número.
    let remaining = CHALLENGE_REST_SECONDS;

    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        navigation.replace(nextStep.route, { challenge: true });
        return;
      }
      setSeconds(remaining);
    }, 1000);

    return () => clearInterval(timer);
  }, [navigation, nextStep]);

  useEffect(() => {
    tick.setValue(0);
    Animated.timing(tick, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [seconds, tick]);

  const scale = tick.interpolate({ inputRange: [0, 1], outputRange: [1.25, 1] });

  if (!nextStep) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <Text style={styles.stepLabel}>
        ETAPA {stepNumberRef.current} DE {totalStepsRef.current}
      </Text>

      <Text style={styles.title}>DESCANSE</Text>

      <Animated.Text
        style={[
          styles.countdown,
          { color: accent, textShadowColor: withAlpha(accent, 0.35) },
          { transform: [{ scale }] },
        ]}
      >
        {seconds}
      </Animated.Text>

      <View style={styles.nextBox}>
        <Text style={styles.nextLabel}>A SEGUIR</Text>
        <View style={styles.nextRow}>
          <MaterialCommunityIcons name="arrow-right-bold" size={20} color={accent} />
          <Text style={styles.nextText}>
            {nextStep.label} x {nextStep.reps}
          </Text>
        </View>
      </View>

      <Text style={styles.hint}>Prepare o celular para a próxima posição</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  stepLabel: {
    color: '#6b6b73',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 6,
    marginTop: SPACING.sm,
  },
  countdown: {
    fontSize: 150,
    fontWeight: '900',
    textShadowRadius: 24,
    marginVertical: SPACING.md,
  },
  nextBox: {
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  nextLabel: {
    color: '#6b6b73',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  nextText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  hint: {
    color: '#4a4a55',
    fontSize: 12,
    fontWeight: '600',
    marginTop: SPACING.xxl,
    textAlign: 'center',
  },
});
