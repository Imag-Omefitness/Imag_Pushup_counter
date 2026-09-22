// screens/ChallengeResultScreen.tsx
// Fim do Desafio Diário — vitória ou derrota.
//
// Vitória: soma de calorias, repetições por exercício, tempo total e as
// recompensas do desafio (moedas, XP e troféus).
//
// Derrota (saiu da posição em qualquer exercício, ou desistiu): o desafio
// acaba ali. O usuário leva apenas o XP das repetições que realmente fez —
// nada de moedas nem troféus. É por isso que o bloco de recompensas muda
// de forma entre os dois casos, e não só de cor.
//
// A entrega em si acontece no botão de voltar (finishChallenge), não na
// montagem desta tela: assim sair pelo botão do Android sem confirmar não
// credita nada duas vezes, e o crédito fica num ponto único — o mesmo que
// vai virar a chamada do Supabase mais pra frente.

import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useChallenge } from '../context/ChallengeContext';
import { RADIUS, SPACING } from '../constants/theme';
import CoinIcon from '../assets/icons/Omecoin.svg';

type Props = NativeStackScreenProps<RootStackParamList, 'ChallengeResult'>;

function formatTime(totalSeconds: number) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export default function ChallengeResultScreen({ navigation }: Props) {
  const challenge = useChallenge();
  const won = challenge.status === 'completed';
  const { totals, rewards } = challenge;

  const accent = won ? '#00ff88' : '#ff3b30';

  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(80),
      Animated.spring(pop, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [pop]);

  // Creditar e voltar é sempre o mesmo caminho, venha do botão ou do
  // "voltar" do Android — senão dava pra sair da tela sem receber nada.
  const handleReturnHome = useCallback(() => {
    challenge.finishChallenge();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }, [challenge, navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleReturnHome();
      return true;
    });
    return () => sub.remove();
  }, [handleReturnHome]);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.headline, { transform: [{ scale }] }]}>
          <MaterialCommunityIcons
            name={won ? 'trophy-award' : 'close-octagon'}
            size={64}
            color={accent}
          />
          <Text style={[styles.headlineText, { color: accent }]}>
            {won ? 'DESAFIO DIÁRIO CONCLUÍDO!' : 'VOCÊ PERDEU O DESAFIO'}
          </Text>
          {!won && (
            <Text style={styles.headlineSub}>
              Você saiu da posição — o desafio foi encerrado.
            </Text>
          )}
        </Animated.View>

        <View style={[styles.card, { borderColor: `${accent}55` }]}>
          <View style={[styles.corner, styles.topLeft, { borderColor: accent }]} />
          <View style={[styles.corner, styles.topRight, { borderColor: accent }]} />
          <View style={[styles.corner, styles.bottomLeft, { borderColor: accent }]} />
          <View style={[styles.corner, styles.bottomRight, { borderColor: accent }]} />

          <Text style={styles.cardTitle}>FIM DE TREINO</Text>

          <Text style={styles.bigTime}>{formatTime(totals.seconds)}</Text>
          <Text style={styles.bigTimeLabel}>TEMPO TOTAL</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <MaterialCommunityIcons name="fire" size={22} color="#ff8c1a" />
              <Text style={styles.statValue}>{totals.calories.toFixed(1)}</Text>
              <Text style={styles.statLabel}>KCAL</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <MaterialCommunityIcons name="repeat" size={22} color="#00e5ff" />
              <Text style={styles.statValue}>{totals.reps}</Text>
              <Text style={styles.statLabel}>REPETIÇÕES</Text>
            </View>
          </View>

          <View style={styles.repList}>
            {totals.perExercise.map((item) => {
              const done = item.reps >= item.goal;
              return (
                <View key={item.id} style={styles.repRow}>
                  <MaterialCommunityIcons
                    name={done ? 'check-circle' : 'circle-outline'}
                    size={18}
                    color={done ? '#00ff88' : '#4a4a55'}
                  />
                  <Text style={styles.repLabel}>{item.label}</Text>
                  <Text style={[styles.repValue, done && { color: '#00ff88' }]}>
                    {item.reps} / {item.goal}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Recompensas */}
        <View style={[styles.card, { borderColor: `${accent}55`, marginTop: SPACING.lg }]}>
          <Text style={styles.cardTitle}>
            {won ? 'RECOMPENSAS' : 'O QUE VOCÊ LEVA'}
          </Text>

          {won ? (
            <View style={styles.rewardRow}>
              <View style={styles.rewardItem}>
                <CoinIcon width={34} height={34} />
                <Text style={styles.rewardValue}>+{rewards.coins}</Text>
                <Text style={styles.rewardLabel}>MOEDAS</Text>
              </View>
              <View style={styles.rewardItem}>
                <MaterialCommunityIcons name="lightning-bolt" size={32} color="#ff8c1a" />
                <Text style={styles.rewardValue}>+{rewards.xp}</Text>
                <Text style={styles.rewardLabel}>XP</Text>
              </View>
              <View style={styles.rewardItem}>
                <MaterialCommunityIcons name="trophy" size={30} color="#ffd60a" />
                <Text style={styles.rewardValue}>+{rewards.trophies}</Text>
                <Text style={styles.rewardLabel}>TROFÉUS</Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.rewardRow}>
                <View style={styles.rewardItem}>
                  <MaterialCommunityIcons name="lightning-bolt" size={32} color="#ff8c1a" />
                  <Text style={styles.rewardValue}>+{totals.xp.toFixed(1)}</Text>
                  <Text style={styles.rewardLabel}>XP</Text>
                </View>
              </View>
              <Text style={styles.lostNote}>
                Sem moedas e sem troféus: eles só saem com o desafio completo.
              </Text>
            </>
          )}

          {won && (
            <Text style={styles.bonusNote}>
              + {totals.xp.toFixed(1)} XP pelas repetições do treino
            </Text>
          )}
        </View>

        <Pressable
          style={[styles.returnButton, { backgroundColor: accent }]}
          onPress={handleReturnHome}
        >
          <Text style={styles.returnButtonText}>
            {won ? 'RECEBER E VOLTAR' : 'VOLTAR'}
          </Text>
          <MaterialCommunityIcons name="home" size={20} color="#0a0a0f" />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 36,
  },
  headline: {
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  headlineText: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  headlineSub: {
    color: '#8e9ab0',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#0a0d14',
    borderWidth: 1,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
    alignItems: 'center',
    position: 'relative',
  },
  cardTitle: {
    color: '#8e9ab0',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 3,
  },
  bigTime: {
    color: '#ffffff',
    fontSize: 40,
    fontWeight: '900',
    marginTop: SPACING.md,
  },
  bigTimeLabel: {
    color: '#6b6b73',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: -2,
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: SPACING.xl,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 44, backgroundColor: '#1e1e28' },
  statValue: { color: '#ffffff', fontSize: 22, fontWeight: '900' },
  statLabel: { color: '#6b6b73', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  repList: {
    width: '100%',
    marginTop: SPACING.xl,
    gap: SPACING.sm,
  },
  repRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#12121b',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  repLabel: {
    flex: 1,
    color: '#d6d6dc',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  repValue: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  rewardRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: SPACING.lg,
  },
  rewardItem: { alignItems: 'center', gap: 2, minWidth: 80 },
  rewardValue: { color: '#ffffff', fontSize: 19, fontWeight: '900' },
  rewardLabel: { color: '#6b6b73', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  lostNote: {
    color: '#8e9ab0',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: SPACING.lg,
    lineHeight: 18,
  },
  bonusNote: {
    color: '#8e9ab0',
    fontSize: 12,
    fontWeight: '600',
    marginTop: SPACING.lg,
  },
  returnButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
  },
  returnButtonText: {
    color: '#0a0a0f',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2,
  },

  corner: { position: 'absolute', width: 12, height: 12 },
  topLeft: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 },
});
