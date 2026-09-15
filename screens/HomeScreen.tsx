// screens/HomeScreen.tsx

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
  Animated,
  Easing,
  PanResponder,
  Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Svg, {
  Circle,
  Defs,
  RadialGradient,
  LinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useProfile } from '../context/ProfileContext';
import { RADIUS, SPACING } from '../constants/theme';
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
    available: false,
  },
];

// ---------------------------------------------------------------------------
// Desafio Diário
// ---------------------------------------------------------------------------
// Só o conteúdo visual por enquanto — a lógica de progresso/validação do
// desafio ainda não existe, então as metas e recompensas são fixas aqui.
const DAILY_CHALLENGE = {
  // Bíceps preenchidos = dificuldade do desafio do dia.
  difficulty: 4,
  difficultyMax: 4,
  goals: [
    { id: 'pushup', icon: 'arm-flex', reps: 10 },
    { id: 'situp', icon: 'human', reps: 15 },
    { id: 'squat', icon: 'weight-lifter', reps: 20 },
  ],
  rewards: [
    { id: 'coins', value: 45 },
    { id: 'gems', value: 50 },
    { id: 'trophies', value: 10 },
  ],
} as const;

const CHALLENGE_BORDER_RADIUS = 18;
const CHALLENGE_TRAIL_WIDTH = 2.5;
const CHALLENGE_GLOW_WIDTH = 7;
const CHALLENGE_TRAIL_DURATION = 3800;
// Fração do contorno ocupada pelo rastro (0.2 = 20% da volta).
const CHALLENGE_TRAIL_FRACTION = 0.2;

const AnimatedRect = Animated.createAnimatedComponent(Rect);

// Rastro de luz correndo em volta do card (em vez de uma borda inteira
// colorida). O traço é um retângulo arredondado com `strokeDasharray`
// montado como [rastro, resto-da-volta]: só um pedaço do contorno fica
// pintado, e animar `strokeDashoffset` faz esse pedaço deslizar pelo
// caminho, dando a volta completa e recomeçando.
//
// Diferente do resto das animações do app, essa NÃO roda na native driver:
// `strokeDashoffset` não é transform/opacity, então cada frame passa pela
// thread de JS. É uma prop só, num elemento só, então na prática segura os
// 60fps — mas é o primeiro lugar a simplificar se aparecer engasgo em
// aparelho fraco.
function ChallengeTrail({
  width,
  height,
  progress,
}: {
  width: number;
  height: number;
  progress: Animated.Value;
}) {
  if (!width || !height) return null;

  // O traço é centrado na linha do retângulo, então metade dele vaza pra
  // fora. Recuar pela metade do traço mais grosso (o brilho) mantém os dois
  // inteiros dentro do card.
  const inset = CHALLENGE_GLOW_WIDTH / 2;
  const rectWidth = width - CHALLENGE_GLOW_WIDTH;
  const rectHeight = height - CHALLENGE_GLOW_WIDTH;
  const radius = Math.max(0, CHALLENGE_BORDER_RADIUS - inset);

  // Perímetro do retângulo arredondado: os quatro lados retos (já descontando
  // os cantos) + os quatro quartos de círculo, que juntos formam um círculo
  // completo. É o comprimento do caminho que o rastro percorre.
  const perimeter =
    2 * (rectWidth - 2 * radius) + 2 * (rectHeight - 2 * radius) + 2 * Math.PI * radius;
  const trailLength = perimeter * CHALLENGE_TRAIL_FRACTION;

  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -perimeter],
  });

  const pathProps = {
    x: inset,
    y: inset,
    width: rectWidth,
    height: rectHeight,
    rx: radius,
    ry: radius,
    fill: 'none',
  };

  const dashProps = {
    stroke: 'url(#challengeTrail)',
    strokeDasharray: [trailLength, perimeter - trailLength],
    strokeDashoffset: dashOffset,
    strokeLinecap: 'round' as const,
  };

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="challengeTrail" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#ff2d20" />
          <Stop offset="50%" stopColor="#ffa726" />
          <Stop offset="100%" stopColor="#ffd60a" />
        </LinearGradient>
      </Defs>

      {/* Contorno de base: discreto, só pra definir a borda do card onde o
          rastro não está passando no momento. */}
      <Rect {...pathProps} stroke="#24242f" strokeWidth={CHALLENGE_TRAIL_WIDTH} />

      {/* Halo: mesmo rastro, mais grosso e translúcido, criando o brilho. */}
      <AnimatedRect
        {...pathProps}
        {...dashProps}
        strokeWidth={CHALLENGE_GLOW_WIDTH}
        opacity={0.3}
      />

      {/* Rastro principal. */}
      <AnimatedRect {...pathProps} {...dashProps} strokeWidth={CHALLENGE_TRAIL_WIDTH} />
    </Svg>
  );
}

function DailyChallengeCard({ onStart }: { onStart: () => void }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const trail = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(trail, {
        toValue: 1,
        duration: CHALLENGE_TRAIL_DURATION,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [trail]);

  return (
    <View
      style={styles.challengeCard}
      onLayout={(e) =>
        setSize({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
    >
      <ChallengeTrail width={size.width} height={size.height} progress={trail} />

      <Text style={styles.challengeTitle}>DAILY CHALLENGE</Text>

      <View style={styles.challengeBody}>
        {/* Coluna esquerda: arte do desafio + metas de repetição */}
        <View style={styles.challengeLeft}>
          <View style={styles.challengeArt}>
            <MaterialCommunityIcons name="human-male" size={96} color="#ff3b30" />
          </View>

          <View style={styles.goalList}>
            {DAILY_CHALLENGE.goals.map((goal) => (
              <View key={goal.id} style={styles.goalRow}>
                <MaterialCommunityIcons
                  name={goal.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={28}
                  color="#d6d6dc"
                />
                <Text style={styles.goalText}>X {goal.reps}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Coluna direita: dificuldade, recompensas e botão de início */}
        <View style={styles.challengeRight}>
          <View style={styles.difficultyRow}>
            {Array.from({ length: DAILY_CHALLENGE.difficultyMax }).map((_, index) => (
              <MaterialCommunityIcons
                key={index}
                name="arm-flex"
                size={26}
                color={index < DAILY_CHALLENGE.difficulty ? '#8a8a92' : '#2a2a35'}
              />
            ))}
          </View>

          <Text style={styles.rewardLabel}>RECOMPENSA:</Text>

          <View style={styles.rewardList}>
            <View style={styles.rewardRow}>
              <CoinIcon width={32} height={32} />
              <Text style={styles.rewardText}>X {DAILY_CHALLENGE.rewards[0].value}</Text>
            </View>
            <View style={styles.rewardRow}>
              <MaterialCommunityIcons name="diamond-stone" size={28} color="#2f80ff" />
              <Text style={styles.rewardText}>X {DAILY_CHALLENGE.rewards[1].value}</Text>
            </View>
            <View style={styles.rewardRow}>
              <MaterialCommunityIcons name="trophy" size={28} color="#ffd60a" />
              <Text style={styles.rewardText}>X {DAILY_CHALLENGE.rewards[2].value}</Text>
            </View>
          </View>

          <Pressable style={styles.startButton} onPress={onStart}>
            <Text style={styles.startButtonText}>INICIAR</Text>
            <MaterialCommunityIcons name="shield-half-full" size={26} color="#ffffff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

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

const AVATAR_SIZE = 52;
const AVATAR_GLOW_SIZE = AVATAR_SIZE + 12;

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
  const locked = !exercise.available;
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
              locked && styles.cardLocked,
            ]}
          >
            {!locked && (
              <View
                style={[
                  styles.cardDot,
                  { backgroundColor: exercise.muscleColor },
                ]}
              />
            )}

            <View style={styles.iconCircle}>
              <MaterialCommunityIcons
                name={locked ? 'lock' : exercise.icon}
                size={locked ? 22 : 30}
                color={locked ? '#6b6b73' : isActive ? '#ff3b30' : '#d6d6dc'}
              />
            </View>

            <Text
              style={[
                styles.cardTitle,
                isActive && styles.cardTitleActive,
                locked && styles.cardTitleLocked,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {exercise.title}
            </Text>

            {locked && <Text style={styles.cardLockedLabel}>EM BREVE</Text>}
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

  // Desafio diário: `showDailyChallenge` controla a montagem do <Modal>, e os
  // dois Animated.Value abaixo controlam a aparição. O <Modal> entra com
  // animationType="none" porque a animação nativa dele escureceria e
  // deslizaria tudo junto — aqui o fundo faz fade enquanto o card dá um
  // "pop" com mola, cada um no seu tempo. Ambos usam só opacity/transform,
  // então rodam na native driver.
  const [showDailyChallenge, setShowDailyChallenge] = useState(false);
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const popAnim = useRef(new Animated.Value(0)).current;

  const openDailyChallenge = () => {
    backdropAnim.setValue(0);
    popAnim.setValue(0);
    setShowDailyChallenge(true);

    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(popAnim, {
        toValue: 1,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Desmonta o Modal só depois da animação de saída — se o estado virasse
  // false na hora, o card sumiria de um frame pro outro.
  const closeDailyChallenge = (onClosed?: () => void) => {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(popAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setShowDailyChallenge(false);
      onClosed?.();
    });
  };

  // A mola passa um pouco de 1 antes de assentar, então a escala estoura
  // levemente além do tamanho final — é isso que dá a sensação de "pop".
  // A opacidade é travada em 1 pra esse overshoot não virar valor inválido.
  const popScale = popAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });
  const popTranslateY = popAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });
  const popOpacity = popAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

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

        <View style={styles.avatarWrap}>
          {/* Brilho neon vermelho contornando o avatar: mais forte no
              canto inferior esquerdo e sumindo gradualmente ao redor do
              círculo, como uma sombra sutil que se dissolve — em vez do
              acento de canto reto que havia antes. */}
          <Svg
            width={AVATAR_GLOW_SIZE}
            height={AVATAR_GLOW_SIZE}
            style={styles.avatarGlow}
          >
            <Defs>
              <RadialGradient id="avatarGlow" cx="20%" cy="82%" r="75%">
                <Stop offset="0%" stopColor="#ff3b30" stopOpacity={0.95} />
                <Stop offset="45%" stopColor="#ff3b30" stopOpacity={0.35} />
                <Stop offset="100%" stopColor="#ff3b30" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle
              cx={AVATAR_GLOW_SIZE / 2}
              cy={AVATAR_GLOW_SIZE / 2}
              r={AVATAR_SIZE / 2 + 1}
              stroke="url(#avatarGlow)"
              strokeWidth={3}
              fill="none"
            />
          </Svg>

          <View style={styles.avatarCircle}>
            <MaterialCommunityIcons name="account" size={34} color="#8a8a92" />
          </View>
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

        <Pressable
          style={styles.navItemCenter}
          onPress={openDailyChallenge}
        >
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

      {/* Desafio Diário — abre pelo botão vermelho central (INÍCIO).
          O fundo escuro e o "pega-toque" que fecha ao clicar fora são duas
          camadas absolutas separadas, e o card vem por último (logo, por
          cima), então tocar no card não fecha o modal. */}
      <Modal
        visible={showDailyChallenge}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => closeDailyChallenge()}
      >
        <View style={styles.challengeRoot}>
          <Animated.View
            pointerEvents="none"
            style={[styles.challengeBackdrop, { opacity: backdropAnim }]}
          />

          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => closeDailyChallenge()}
          />

          <Animated.View
            style={{
              opacity: popOpacity,
              transform: [{ scale: popScale }, { translateY: popTranslateY }],
            }}
          >
            <DailyChallengeCard
              onStart={() =>
                closeDailyChallenge(() =>
                  Alert.alert('Em breve', 'O desafio diário ainda está em desenvolvimento.')
                )
              }
            />
          </Animated.View>
        </View>
      </Modal>
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
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginTop: SPACING.md,
    gap: SPACING.md,
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
    borderRadius: RADIUS.sm,
    gap: 3,
  },
  trophyText: {
    color: '#ffd60a',
    fontSize: 10,
    fontWeight: '800',
  },
  avatarWrap: {
    width: AVATAR_GLOW_SIZE,
    height: AVATAR_GLOW_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarGlow: {
    position: 'absolute',
  },
  avatarCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#1e1e26',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
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
    borderRadius: RADIUS.md,
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
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    borderWidth: 1.5,
    borderColor: '#171722',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  cardActive: {
    borderColor: '#ff3b30',
    backgroundColor: '#18151c',
  },
  cardLocked: {
    opacity: 0.55,
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
  cardTitleLocked: {
    color: '#6b6b73',
  },
  cardLockedLabel: {
    color: '#6b6b73',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
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

  /* Desafio Diário */
  challengeRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    // Distância até a base da tela. Quanto maior, mais alto o card fica —
    // aqui ele sobe bem acima da navegação inferior, sem chegar ao centro.
    paddingBottom: 190,
  },
  challengeBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  challengeCard: {
    backgroundColor: '#15151f',
    borderRadius: CHALLENGE_BORDER_RADIUS,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
    overflow: 'hidden',
  },
  challengeTitle: {
    color: '#ffffff',
    fontFamily: 'Yearbook Solid',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  challengeBody: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  challengeLeft: {
    gap: SPACING.lg,
  },
  challengeArt: {
    width: 124,
    height: 124,
    borderRadius: RADIUS.md,
    backgroundColor: '#20202d',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  goalList: {
    gap: SPACING.md,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  goalText: {
    color: '#f4f4f6',
    fontFamily: 'Yearbook Solid',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.5,
  },
  challengeRight: {
    flex: 1,
    gap: SPACING.md,
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  rewardLabel: {
    color: '#ff3b30',
    fontFamily: 'Yearbook Solid',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 1,
  },
  rewardList: {
    gap: SPACING.sm,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  rewardText: {
    color: '#f4f4f6',
    fontFamily: 'Yearbook Solid',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.5,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: '#ff3b30',
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginTop: 'auto',
  },
  startButtonText: {
    color: '#ffffff',
    fontFamily: 'Yearbook Solid',
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 1.5,
  },
});
