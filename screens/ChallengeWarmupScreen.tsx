// screens/ChallengeWarmupScreen.tsx
// Aviso de aquecimento — a primeira tela depois do "INICIAR" do Desafio
// Diário. Diferente do tutorial de posicionamento, este aviso NÃO tem
// "não mostrar novamente": é um lembrete de segurança e aparece sempre.
//
// Tocar em qualquer lugar entra na primeira etapa do desafio.

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useChallenge } from '../context/ChallengeContext';
import { RADIUS, SPACING } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChallengeWarmup'>;

export default function ChallengeWarmupScreen({ navigation }: Props) {
  const challenge = useChallenge();
  const step = challenge.currentStep;

  // Pulsar de leve na dica de toque, só pra deixar claro que a tela espera
  // uma ação e não travou.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const hintOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  // Voltar aqui é desistir antes de começar: a sessão é descartada inteira,
  // sem resultado e sem prêmio. Se ficasse pendurada, a próxima entrada no
  // desafio acharia uma etapa "em andamento" que não existe mais.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      challenge.abandonChallenge();
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      return true;
    });
    return () => sub.remove();
  }, [challenge, navigation]);

  const handleContinue = () => {
    // Sem sessão não há o que continuar (ex: recarga de código com a tela
    // aberta) — volta pra Home em vez de entrar num treino sem meta.
    if (!step) {
      navigation.replace('Home');
      return;
    }
    navigation.replace(step.route, { challenge: true });
  };

  return (
    <Pressable style={styles.container} onPress={handleContinue}>
      <View style={styles.card}>
        <View style={[styles.corner, styles.topLeft]} />
        <View style={[styles.corner, styles.topRight]} />
        <View style={[styles.corner, styles.bottomLeft]} />
        <View style={[styles.corner, styles.bottomRight]} />

        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="alert-outline" size={38} color="#ffd60a" />
        </View>

        <Text style={styles.noteLabel}>NOTA</Text>

        <Text style={styles.message}>
          Recomendamos que você faça um aquecimento antes de começar um treino
          intenso.
        </Text>

        <View style={styles.divider} />

        <Text style={styles.challengeLabel}>DESAFIO DIÁRIO</Text>
        <Text style={[styles.difficultyLabel, { color: challenge.tier.color }]}>
          {challenge.tier.label}
        </Text>

        <View style={styles.goalList}>
          {challenge.tier.steps.map((item, index) => (
            <View key={item.id} style={styles.goalRow}>
              <Text style={styles.goalIndex}>{index + 1}</Text>
              <Text style={styles.goalText}>{item.label}</Text>
              <Text style={styles.goalReps}>x {item.reps}</Text>
            </View>
          ))}
        </View>
      </View>

      <Animated.Text style={[styles.hint, { opacity: hintOpacity }]}>
        Toque para continuar para o desafio
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#0a0d14',
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 10, 0.3)',
    paddingHorizontal: SPACING.xl,
    paddingVertical: 28,
    alignItems: 'center',
    position: 'relative',
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255, 214, 10, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 214, 10, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  noteLabel: {
    color: '#ffd60a',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: SPACING.sm,
  },
  message: {
    color: '#e6e6ec',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '600',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#1e1e28',
    marginVertical: SPACING.xl,
  },
  challengeLabel: {
    color: '#6b6b73',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
  },
  difficultyLabel: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 2,
    marginBottom: SPACING.lg,
  },
  goalList: {
    width: '100%',
    gap: SPACING.sm,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: '#12121b',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  goalIndex: {
    color: '#6b6b73',
    fontSize: 12,
    fontWeight: '900',
    width: 14,
  },
  goalText: {
    flex: 1,
    color: '#d6d6dc',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  goalReps: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  hint: {
    color: '#b5b5bd',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: SPACING.xxl,
  },

  /* Quinas neon, no mesmo desenho dos outros cards do treino */
  corner: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderColor: '#ffd60a',
  },
  topLeft: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 },
});
