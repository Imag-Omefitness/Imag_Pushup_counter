// components/ExitWorkoutModal.tsx
// Confirmação de saída do treino. Substitui o Alert.alert branco do sistema
// por um card no mesmo visual neon do resumo de fim de treino, mostrando o
// que o usuário perde/leva ao encerrar agora.

import React from 'react';
import { StyleSheet, Text, View, Pressable, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../constants/theme';

export default function ExitWorkoutModal({
  visible,
  reps,
  repsLabel,
  elapsedLabel,
  onCancel,
  onConfirm,
  isChallenge = false,
}: {
  visible: boolean;
  reps: number;
  repsLabel: string;
  elapsedLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  /**
   * Durante o Desafio Diário sair não é só encerrar o treino: perde o
   * desafio inteiro, com as moedas e os troféus junto. O aviso precisa
   * dizer isso — senão o usuário toca achando que está pausando.
   */
  isChallenge?: boolean;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />

          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="door-open" size={30} color="#ff3b30" />
          </View>

          <Text style={styles.title}>
            {isChallenge ? 'DESISTIR DO DESAFIO?' : 'SAIR DO TREINO?'}
          </Text>
          <Text style={styles.message}>
            {isChallenge
              ? 'Você perde o Desafio Diário: fica só com o XP das repetições já feitas, sem moedas e sem troféus.'
              : 'Seu treino será encerrado agora. O progresso feito até aqui é salvo.'}
          </Text>

          {/* O que o usuário leva se encerrar neste momento. */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{reps}</Text>
              <Text style={styles.statLabel}>{repsLabel}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{elapsedLabel}</Text>
              <Text style={styles.statLabel}>TEMPO</Text>
            </View>
          </View>

          <Pressable style={styles.continueButton} onPress={onCancel}>
            <MaterialCommunityIcons name="arm-flex" size={18} color="#00ff88" />
            <Text style={styles.continueButtonText}>
              {isChallenge ? 'CONTINUAR O DESAFIO' : 'CONTINUAR TREINANDO'}
            </Text>
          </Pressable>

          <Pressable style={styles.exitButton} onPress={onConfirm}>
            <Text style={styles.exitButtonText}>
              {isChallenge ? 'DESISTIR' : 'ENCERRAR TREINO'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#0a0d14',
    paddingHorizontal: SPACING.xl,
    paddingVertical: 28,
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 59, 48, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ff3b30',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  message: {
    color: '#8e9ab0',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: SPACING.xl,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  statValue: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: '#6b7688',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    width: '100%',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: '#00ff88',
    backgroundColor: 'rgba(0, 255, 136, 0.08)',
    marginBottom: SPACING.sm,
  },
  continueButtonText: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  exitButton: {
    width: '100%',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
  },
  exitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },

  corner: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderColor: '#ff3b30',
  },
  topLeft: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 },
});
