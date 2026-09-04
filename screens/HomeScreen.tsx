// screens/HomeScreen.tsx

import React, { useState, useRef, useCallback } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
  Animated,
  PanResponder,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useProfile } from '../context/ProfileContext';
import CoinIcon from '../assets/icons/Omecoin.svg';
export type ExerciseId = 'pushup' | 'situp' | 'squat' | 'pullup';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

type Exercise = {
  id: ExerciseId;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  muscle: 'Chest' | 'Legs' | 'Backs' | 'Abs';
  muscleColor: string;
  available: boolean;
};

const EXERCISES: Exercise[] = [
  {
    id: 'pushup',
    title: 'PUSH-UPS',
    subtitle: 'Peito',
    icon: 'arm-flex',
    muscle: 'Chest',
    muscleColor: '#2f80ff',
    available: true,
  },
  {
    id: 'situp',
    title: 'SIT-UPS',
    subtitle: 'Abdômen',
    icon: 'human',
    muscle: 'Abs',
    muscleColor: '#20b95a',
    available: true,
  },
  {
    id: 'squat',
    title: 'SQUATS',
    subtitle: 'Pernas',
    icon: 'weight-lifter',
    muscle: 'Legs',
    muscleColor: '#f4c430',
    available: true,
  },
  {
    id: 'pullup',
    title: 'PULL-UPS',
    subtitle: 'Costas',
    icon: 'human-handsup',
    muscle: 'Backs',
    muscleColor: '#f05a3c',
    available: true,
  },
];

// ---------------------------------------------------------------------------
// Ranks (elos) — plaqueta ornamentada por ícone
// ---------------------------------------------------------------------------
const RANK_TIERS = {
  MADEIRA: { icon: 'axe', fill: '#a9784f', fillDark: '#7d5837', border: '#4a2e19', accent: '#e9c99a' },
  PRATA: { icon: 'sword-cross', fill: '#c7cad1', fillDark: '#9498a2', border: '#585c66', accent: '#f2f4f7' },
  OURO: { icon: 'hammer', fill: '#f4c430', fillDark: '#c99a1e', border: '#7a5c0e', accent: '#fff1b8' },
  PLATINA: { icon: 'shield', fill: '#dfe5ea', fillDark: '#aab3bc', border: '#5c636b', accent: '#ffffff' },
  DIAMANTE: { icon: 'diamond-stone', fill: '#8ecbff', fillDark: '#4a95d6', border: '#1c4d73', accent: '#e3f3ff' },
  CAMPEAO: { icon: 'crown', fill: '#caa6f2', fillDark: '#8f5cc9', border: '#4a2570', accent: '#f2e3ff' },
  RUBI: { icon: 'shield-star', fill: '#ff6b81', fillDark: '#d13350', border: '#6e0f22', accent: '#ffd9e0' },
  CRIPTONITA: { icon: 'shape-polygon-plus', fill: '#7dffb0', fillDark: '#22c56b', border: '#0a5c30', accent: '#e0ffef' },
} as const;

type RankTierKey = keyof typeof RANK_TIERS;

function RankBadge({ tier }: { tier: RankTierKey }) {
  const t = RANK_TIERS[tier];
  return (
    <View style={styles.rankOuter}>
      <View style={[styles.rankRivet, styles.rankRivetLeft, { backgroundColor: t.accent, borderColor: t.border }]} />
      <View style={[styles.rankRivet, styles.rankRivetRight, { backgroundColor: t.accent, borderColor: t.border }]} />

      <View style={[styles.rankPlate, { backgroundColor: t.fill, borderColor: t.border }]}>
        <View style={styles.rankShine} />
        <View style={[styles.rankGrooveLine, { backgroundColor: t.fillDark, top: '38%' }]} />
        <View style={[styles.rankGrooveLine, { backgroundColor: t.fillDark, top: '58%' }]} />
        <View style={styles.rankIconWrap}>
          <MaterialCommunityIcons
            name={t.icon as keyof typeof MaterialCommunityIcons.glyphMap}
            size={15}
            color={t.border}
          />
        </View>
        <View style={[styles.rankInnerShadow, { backgroundColor: t.fillDark }]} />
      </View>

      <View style={[styles.rankPointOuter, { borderTopColor: t.border }]} />
      <View style={[styles.rankPointInner, { borderTopColor: t.fillDark }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Card de exercício
// ---------------------------------------------------------------------------
function ExerciseCard({
  exercise,
  isActive,
  onPress,
}: {
  exercise: Exercise;
  isActive: boolean;
  onPress: (exercise: Exercise) => void;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const pressDepth = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 40,
      bounciness: 2,
    }).start();

    Animated.timing(pressDepth, {
      toValue: 1,
      duration: 80,
      useNativeDriver: false,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 4,
      tension: 90,
    }).start();

    Animated.timing(pressDepth, {
      toValue: 0,
      duration: 140,
      useNativeDriver: false,
    }).start();
  };

  const translateY = pressDepth.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 2],
  });

  return (
    <Pressable
      style={styles.cardSlot}
      onPress={() => onPress(exercise)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Animated.View style={{ transform: [{ scale: pressScale }] }}>
          <View
            style={[
              styles.card,
              isActive && styles.cardActive,
            ]}
          >
            <View
              style={[
                styles.cardDot,
                { backgroundColor: exercise.muscleColor },
              ]}
            />

            <View style={styles.iconCircle}>
              <MaterialCommunityIcons
                name={exercise.icon}
                size={30}
                color={isActive ? '#ff3b30' : '#d6d6dc'}
              />
            </View>

            <Text
              style={[
                styles.cardTitle,
                isActive && styles.cardTitleActive,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {exercise.title}
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export default function HomeScreen({ navigation }: Props) {
  const { profile } = useProfile();

  const [selectedId, setSelectedId] = useState<ExerciseId | null>(null);
  const navigateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      setSelectedId(null);
      return () => {
        if (navigateTimeout.current) clearTimeout(navigateTimeout.current);
      };
    }, [])
  );

  const xpPercent = Math.min(
    100,
    (profile.xpCurrent / profile.xpToNextLevel) * 100
  );

  const handlePress = (exercise: Exercise) => {
    setSelectedId(exercise.id);

    navigateTimeout.current = setTimeout(() => {
      if (exercise.id === 'pushup') {
        navigation.navigate('Pushup');
      } else if (exercise.id === 'situp') {
        navigation.navigate('Situp');
      } else if (exercise.id === 'squat') {
        navigation.navigate('Squat');
      } else if (exercise.id === 'pullup') {
        Alert.alert(
          'Em breve',
          'O modo pull-ups ainda está em desenvolvimento.'
        );
      }
    }, 220);
  };

  const handleSettingsPress = () => {
    Alert.alert('Em breve', 'A tela de configurações ainda está em desenvolvimento.');
  };

  const goToRanking = () => {
    navigation.navigate('Ranking');
  };

  // Detector do gesto de Swipe (deslize) para a direita — usa o
  // PanResponder nativo do React Native, sem depender de
  // react-native-gesture-handler (que não está instalado no projeto e
  // causava o erro "Unable to resolve module react-native-gesture-handler").
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5,
      onPanResponderRelease: (_evt, gestureState) => {
        if (gestureState.dx > 50) {
          goToRanking();
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.container} {...panResponder.panHandlers}>
      {/* Barra superior */}
      <View style={styles.topBar}>
        <View style={styles.coinBadge}>
          <CoinIcon width={30} height={30} />
          <Text style={styles.coinText}>{profile.coins}</Text>
        </View>

        <Pressable onPress={handleSettingsPress} style={styles.settingsButton}>
          <MaterialCommunityIcons name="cog" size={30} color="#b5b5bd" />
        </Pressable>
      </View>

      {/* Card do perfil */}
      <View style={styles.profileCard}>
        <View style={styles.profileInfo}>
          <View style={styles.userRow}>
            <Text style={styles.usernameText}>{profile.username}</Text>

            <RankBadge tier={profile.rankName as RankTierKey} />

            <View style={styles.trophyBadge}>
              <MaterialCommunityIcons name="trophy" size={14} color="#ffd60a" />
              <Text style={styles.trophyText}>{profile.trophies}</Text>
            </View>
          </View>

          <View style={styles.xpRow}>
            <View style={styles.lvBadge}>
              <Text style={styles.lvBadgeText}>LV {profile.level}</Text>
            </View>
            <View style={styles.xpTrack}>
              <View style={[styles.xpFill, { width: `${xpPercent}%` }]} />
            </View>
          </View>
          <Text style={styles.xpValueText}>
            {profile.xpCurrent.toFixed(1)} / {profile.xpToNextLevel} XP
          </Text>
        </View>

        <View style={styles.avatarCircle}>
          <MaterialCommunityIcons name="account" size={34} color="#8a8a92" />
          <View style={styles.avatarRedCorner} />
        </View>
      </View>

      {/* Cabeçalho */}
      <View style={styles.header}>
        <MaterialCommunityIcons name="sword-cross" size={26} color="#ff3b30" />
        <Text style={styles.headerTitle}>CALISTENIA</Text>
      </View>
      <Text style={styles.headerSubtitle}>Escolha seu exercício</Text>

      {/* Progresso de Exercícios */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>— EXERCÍCIOS —</Text>
        <Text style={styles.sectionCount}>4/4</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: '100%' }]} />
      </View>

      {/* Filtros visuais por grupo muscular */}
      <View style={styles.filterRow}>
        <View style={styles.muscleLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#2f80ff' }]} />
            <Text style={styles.legendText}>Chest</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#f4c430' }]} />
            <Text style={styles.legendText}>Legs</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#f05a3c' }]} />
            <Text style={styles.legendText}>Backs</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#20b95a' }]} />
            <Text style={styles.legendText}>Abs</Text>
          </View>
        </View>

        <Pressable style={styles.sortButton} onPress={() => { }}>
          <View style={styles.sortLineLong} />
          <View style={styles.sortLineMedium} />
          <View style={styles.sortLineShort} />
        </Pressable>
      </View>

      {/* Grid de Exercícios */}
      <View style={styles.grid}>
        {EXERCISES.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            isActive={selectedId === exercise.id}
            onPress={handlePress}
          />
        ))}
      </View>

      <View style={{ flex: 1 }} />

      {/* Navegação Inferior */}
      <View style={styles.bottomNav}>
        {/* BOTÃO RANKS (INFERIOR ESQUERDO) */}
        <Pressable style={styles.navItem} onPress={goToRanking}>
          <MaterialCommunityIcons name="podium" size={24} color="#6b6b73" />
          <Text style={styles.navLabel}>RANKS</Text>
        </Pressable>

        <Pressable style={styles.navItemCenter}>
          <View style={styles.navCenterCircle}>
            <MaterialCommunityIcons
              name="sword-cross"
              size={26}
              color="#0a0a0f"
            />
          </View>
          <Text style={[styles.navLabel, styles.navLabelActive]}>
            INÍCIO
          </Text>
        </Pressable>

        <Pressable style={styles.navItem}>
          <MaterialCommunityIcons
            name="account"
            size={24}
            color="#6b6b73"
          />
          <Text style={styles.navLabel}>PERFIL</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  coinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 4,
  },
  coinStack: {
    width: 32,
    height: 23,
    position: 'relative',
  },
  coin: {
    position: 'absolute',
    width: 21,
    height: 8,
    borderRadius: 7,
    backgroundColor: '#ffd60a',
    borderWidth: 1,
    borderColor: '#b99800',
  },
  coinBack: {
    left: 0,
    top: 9,
    transform: [{ rotate: '-10deg' }],
    opacity: 0.8,
  },
  coinMiddle: {
    left: 5,
    top: 6,
    transform: [{ rotate: '4deg' }],
    opacity: 0.9,
  },
  coinFront: {
    left: 10,
    top: 3,
    transform: [{ rotate: '10deg' }],
  },
  coinText: {
    color: '#ffd60a',
    fontFamily: 'Yearbook Solid',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: 0.8,
  },
  settingsButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131318',
    borderWidth: 1.5,
    borderColor: '#1e1e26',
    borderRadius: 20,
    padding: 14,
    marginTop: 14,
    gap: 12,
  },
  profileInfo: {
    flex: 1,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  usernameText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },

  // Rank badge (elo) — placa ornamentada
  rankOuter: {
    width: 26,
    height: 32,
    alignItems: 'center',
  },
  rankRivet: {
    position: 'absolute',
    top: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    borderWidth: 0.5,
    zIndex: 3,
  },
  rankRivetLeft: { left: 2 },
  rankRivetRight: { right: 2 },
  rankPlate: {
    width: 26,
    height: 22,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 2.5,
    elevation: 4,
  },
  rankShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  rankGrooveLine: {
    position: 'absolute',
    left: 3,
    right: 3,
    height: 1,
    opacity: 0.5,
  },
  rankInnerShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '20%',
    opacity: 0.35,
  },
  rankIconWrap: {
    zIndex: 2,
  },
  rankPointOuter: {
    width: 0,
    height: 0,
    borderLeftWidth: 13,
    borderRightWidth: 13,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  rankPointInner: {
    position: 'absolute',
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  trophyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262213',
    borderWidth: 1,
    borderColor: '#ffd60a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  trophyText: {
    color: '#ffd60a',
    fontSize: 10,
    fontWeight: '800',
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1e1e26',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarRedCorner: {
    position: 'absolute',
    left: -1,
    bottom: -1,
    width: 29,
    height: 29,
    borderWidth: 3,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderLeftColor: '#ff3b30',
    borderBottomColor: '#ff3b30',
    borderRadius: 16,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lvBadge: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderWidth: 1,
    borderColor: '#ff3b30',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  lvBadgeText: {
    color: '#ff3b30',
    fontSize: 10,
    fontWeight: '800',
  },
  xpTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#1c1c22',
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    backgroundColor: '#ff3b30',
    borderRadius: 4,
  },
  xpValueText: {
    color: '#6b6b73',
    fontSize: 10,
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headerSubtitle: {
    color: '#8a8a92',
    fontSize: 13,
    marginTop: 4,
    marginLeft: 36,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
  },
  sectionLabel: {
    color: '#ff3b30',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sectionCount: {
    color: '#8a8a92',
    fontSize: 12,
    fontWeight: '600',
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#1c1c22',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ff3b30',
    borderRadius: 2,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    minHeight: 28,
  },
  muscleLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 11,
    flex: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#8a8a92',
    fontSize: 12,
    fontWeight: '600',
  },
  sortButton: {
    width: 42,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  sortLineLong: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#b9b9c0',
    marginBottom: 3,
  },
  sortLineMedium: {
    width: 20,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#b9b9c0',
    marginBottom: 3,
  },
  sortLineShort: {
    width: 12,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#b9b9c0',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
    rowGap: 12,
  },
  cardSlot: {
    width: '31.5%',
  },
  card: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#15151f',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#171722',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  cardActive: {
    borderColor: '#ff3b30',
    backgroundColor: '#18151c',
  },
  cardDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  iconCircle: {
    position: 'absolute',
    top: 13,
    left: '50%',
    marginLeft: -25,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#20202d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    color: '#f4f4f6',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
    marginBottom: 3,
  },
  cardTitleActive: {
    color: '#ff6b61',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#1e1e26',
    marginBottom: 8,
  },
  navItem: {
    alignItems: 'center',
    gap: 4,
  },
  navItemCenter: {
    alignItems: 'center',
    gap: 4,
    marginTop: -28,
  },
  navCenterCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#0a0a0f',
  },
  navLabel: {
    color: '#6b6b73',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  navLabelActive: {
    color: '#ff3b30',
  },
});
