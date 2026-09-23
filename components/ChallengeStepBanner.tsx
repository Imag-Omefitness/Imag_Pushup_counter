// components/ChallengeStepBanner.tsx
// Faixa que aparece no topo das telas de treino QUANDO elas estão rodando
// como etapa do Desafio Diário. Fora do desafio o componente nem é
// montado, então o HUD do treino livre continua exatamente como era.
//
// Mostra em que etapa o usuário está (1/3) e quantas repetições faltam —
// no desafio a meta é o que importa, não o total acumulado.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../constants/theme';

export default function ChallengeStepBanner({
  stepNumber,
  totalSteps,
  remaining,
  accent,
}: {
  stepNumber: number;
  totalSteps: number;
  /** Repetições que ainda faltam para fechar a etapa. */
  remaining: number;
  /** Cor do nível do desafio. */
  accent: string;
}) {
  return (
    <View style={styles.banner} pointerEvents="none">
      <MaterialCommunityIcons name="sword-cross" size={14} color="#ffd60a" />
      <Text style={styles.title}>DESAFIO DIÁRIO</Text>
      <View style={styles.dot} />
      <Text style={styles.step}>
        {stepNumber}/{totalSteps}
      </Text>
      <View style={styles.dot} />
      <Text style={[styles.remaining, { color: accent }]}>
        {remaining > 0 ? `FALTAM ${remaining}` : 'ETAPA OK'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: 'rgba(10, 10, 15, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 10, 0.5)',
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    marginBottom: SPACING.sm,
  },
  title: {
    color: '#ffd60a',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#4a4a55',
    marginHorizontal: 2,
  },
  step: {
    color: '#d6d6dc',
    fontSize: 11,
    fontWeight: '800',
  },
  remaining: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
