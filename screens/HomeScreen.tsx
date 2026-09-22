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
  Image,
} from 'react-native';
import type { ImageSourcePropType } from 'react-native';
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
import {
  useProfile,
  levelFromTotalXp,
  xpAtLevelStart,
  xpNeededForLevel,
} from '../context/ProfileContext';
import {
  useChallenge,
  DIFFICULTY_ORDER,
  ChallengeExerciseId,
} from '../context/ChallengeContext';
import { RADIUS, SPACING } from '../constants/theme';
import CoinIcon from '../assets/icons/Omecoin.svg';

const STREAK_FLAME = require('../assets/gifs animation/tiny_fire_streak.gif');

export type ExerciseId = 'pushup' | 'situp' | 'squat' | 'pullup';

// Artes dos exercícios, compostas a partir dos SVGs de assets/icons. Os PNGs
// vêm sem fundo e cortados rente ao desenho: sem fundo dá pra pintar com
// tintColor igual aos ícones do MaterialCommunityIcons, e sem a sobra
// transparente em volta o resizeMode="contain" encosta o desenho nas bordas
// do botão (antes cada arte tinha uma margem diferente e por isso aparecia
// num tamanho diferente dentro do mesmo espaço).
const EXERCISE_ART: Partial<Record<ExerciseId, ImageSourcePropType>> = {
  pushup: require('../assets/icons/pushup-icon.png'),
  situp: require('../assets/icons/situp-icon.png'),
  squat: require('../assets/icons/squat-icon.png'),
};

// Tamanhos das artes dentro de cada botão. São maiores que os ícones de
// fonte que substituíram porque a arte é um traço fino: no mesmo corpo ela
// lê como um desenho menor. Os limites são o círculo de 50 do card da grade
// e o tile de 104 do seletor.
const CARD_GLYPH_SIZE = 52;
const VARIANT_GLYPH_SIZE = 60;
const GOAL_GLYPH_SIZE = 32; //Do not change this value - Thiago 2026

function ExerciseGlyph({
  id,
  size,
  color,
}: {
  id: ExerciseId;
  size: number;
  color: string;
}) {
  return (
    <Image
      source={EXERCISE_ART[id]}
      resizeMode="contain"
      style={{ width: size, height: size, tintColor: color }}
    />
  );
}

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
// Contagem animada de XP
// ---------------------------------------------------------------------------
// Ao voltar de um treino, a barra não pula direto para o valor final: ela
// conta em passos de 0,1 XP (ver XP_PER_SECOND para o ritmo). O número sobe
// nesses passos e a barra acompanha com um `Animated.timing` da duração de
// um passo — como os passos são contínuos, o preenchimento sai suave em vez
// de picotado.

/** Altura da trilha de XP — o SVG do gradiente precisa dela. */
const XP_TRACK_HEIGHT = 10;

/** Ritmo da contagem, em XP por segundo. */
const XP_PER_SECOND = 5;
/** Quanto cada passo soma — fixo em 0,1 XP, o que mantém o "tique" decimal. */
const XP_TICK_STEP = 0.1;
/** Intervalo entre passos, em ms (20 ms a 5 XP/s). */
const XP_TICK_MS = (XP_TICK_STEP / XP_PER_SECOND) * 1000;

const round1 = (n: number) => Math.round(n * 10) / 10;

// Vermelho no começo, laranja pela metade e amarelo perto do fim — as
// paradas ficam em 50% e 90% como pedido, com um respiro até 100%.
const XP_GRADIENT_STOPS = [
  { offset: '0%', color: '#ff2d20' },
  { offset: '50%', color: '#ff8c1a' },
  { offset: '90%', color: '#ffd60a' },
  { offset: '100%', color: '#ffe873' },
] as const;

// ---------------------------------------------------------------------------
// Desafio Diário
// ---------------------------------------------------------------------------
// As metas e as recompensas NÃO moram mais aqui: elas dependem da
// dificuldade do dia e vêm do ChallengeContext
// (context/ChallengeContext.tsx, tabela CHALLENGE_TIERS). Este arquivo só
// desenha o que o contexto diz.
//
// Ícone de reserva por exercício, caso algum dia entre no desafio um
// exercício que ainda não tem arte em EXERCISE_ART.
const CHALLENGE_FALLBACK_ICON: Record<
  ChallengeExerciseId,
  keyof typeof MaterialCommunityIcons.glyphMap
> = {
  pushup: 'arm-flex',
  situp: 'human',
  squat: 'weight-lifter',
};

const CHALLENGE_BORDER_RADIUS = 18;
const CHALLENGE_TRAIL_WIDTH = 2.5;
const CHALLENGE_GLOW_WIDTH = 7;
const CHALLENGE_TRAIL_DURATION = 4200;
// Fração do contorno ocupada pelo rastro (0.3 = 30% da volta).
const CHALLENGE_TRAIL_FRACTION = 0.3;

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
//
// Reaproveitado por qualquer card que precise do mesmo efeito de borda
// giratória (Desafio Diário, seleção de variação de exercício etc).
function GradientTrail({
  width,
  height,
  progress,
  gradientId = 'gradientTrail',
  colors = ['#ff2d20', '#ffa726', '#ffd60a'],
}: {
  width: number;
  height: number;
  progress: Animated.Value;
  gradientId?: string;
  // Início/meio/fim do degradê — por padrão o vermelho-laranja-amarelo do
  // Desafio Diário. O seletor de exercício passa a cor do grupo muscular.
  colors?: readonly [string, string, string];
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
    stroke: `url(#${gradientId})`,
    strokeDasharray: [trailLength, perimeter - trailLength],
    strokeDashoffset: dashOffset,
    strokeLinecap: 'round' as const,
  };

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={colors[0]} />
          <Stop offset="50%" stopColor={colors[1]} />
          <Stop offset="100%" stopColor={colors[2]} />
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

// ---------------------------------------------------------------------------
// Modal com "pop": fundo escurece com fade e o card entra com uma mola,
// saindo do mesmo jeito ao fechar. Compartilhado pelo Desafio Diário e pelo
// seletor de variação/modo de exercício — os dois abrem/fecham do mesmo
// jeito, só o conteúdo interno muda.
// ---------------------------------------------------------------------------
function usePopModal() {
  const [visible, setVisible] = useState(false);
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const popAnim = useRef(new Animated.Value(0)).current;

  const open = useCallback(() => {
    backdropAnim.setValue(0);
    popAnim.setValue(0);
    setVisible(true);

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
  }, [backdropAnim, popAnim]);

  // Só desmonta o conteúdo depois da animação de saída — se o estado virasse
  // false na hora, o card sumiria de um frame pro outro.
  const close = useCallback(
    (onClosed?: () => void) => {
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
        setVisible(false);
        onClosed?.();
      });
    },
    [backdropAnim, popAnim]
  );

  // A mola passa um pouco de 1 antes de assentar, então a escala estoura
  // levemente além do tamanho final — é isso que dá a sensação de "pop".
  // A opacidade é travada em 1 pra esse overshoot não virar valor inválido.
  const scale = popAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const translateY = popAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const opacity = popAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return { visible, backdropAnim, open, close, scale, translateY, opacity };
}

function DailyChallengeCard({ onStart }: { onStart: () => void }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const trail = useRef(new Animated.Value(0)).current;

  const { difficulty, tier } = useChallenge();
  // Bíceps preenchidos = dificuldade do desafio de hoje. Começa no fácil
  // (só o primeiro aceso) e sobe um degrau a cada desafio concluído.
  const difficultyLevel = DIFFICULTY_ORDER.indexOf(difficulty) + 1;

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
      <GradientTrail
        width={size.width}
        height={size.height}
        progress={trail}
        gradientId="dailyChallengeTrail"
      />

      <Text style={styles.challengeTitle}>DAILY CHALLENGE</Text>

      <View style={styles.challengeBody}>
        {/* Coluna esquerda: arte do desafio + metas de repetição */}
        <View style={styles.challengeLeft}>
          <View style={styles.challengeArt}>
            <MaterialCommunityIcons name="human-male" size={96} color="#ff3b30" />
          </View>

          <View style={styles.goalList}>
            {tier.steps.map((goal) => (
              <View key={goal.id} style={styles.goalRow}>
                {EXERCISE_ART[goal.id] ? (
                  <ExerciseGlyph id={goal.id} size={GOAL_GLYPH_SIZE} color="#d6d6dc" />
                ) : (
                  <MaterialCommunityIcons
                    name={CHALLENGE_FALLBACK_ICON[goal.id]}
                    size={28}
                    color="#d6d6dc"
                  />
                )}
                <Text style={styles.goalText}>X {goal.reps}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Coluna direita: dificuldade, recompensas e botão de início */}
        <View style={styles.challengeRight}>
          <View style={styles.difficultyRow}>
            {DIFFICULTY_ORDER.map((_, index) => (
              <MaterialCommunityIcons
                key={index}
                name="arm-flex"
                size={26}
                color={index < difficultyLevel ? '#00ff88' : '#2a2a35'}
              />
            ))}
          </View>

          <Text style={styles.rewardLabel}>RECOMPENSA:</Text>

          <View style={styles.rewardList}>
            <View style={styles.rewardRow}>
              <CoinIcon width={32} height={32} />
              <Text style={styles.rewardText}>X {tier.rewards.coins}</Text>
            </View>
            <View style={styles.rewardRow}>
              <MaterialCommunityIcons name="lightning-bolt" size={28} color="#ff8c1a" />
              <Text style={styles.rewardText}>X {tier.rewards.xp}</Text>
            </View>
            <View style={styles.rewardRow}>
              <MaterialCommunityIcons name="trophy" size={28} color="#ffd60a" />
              <Text style={styles.rewardText}>X {tier.rewards.trophies}</Text>
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
// Seletor de variação + modo de exercício
// ---------------------------------------------------------------------------
// Aberto ao tocar num card de exercício. O card é o mesmo pros três
// exercícios — mudam só o título, a cor do rastro e a lista de variações, que
// saem todos desta tabela. Pra ligar um exercício novo ao seletor basta
// adicionar a entrada aqui: a Home decide se abre o seletor ou o "em breve"
// pela presença da chave.
//
// Só a variação "default" tem treino implementado — as outras existem como
// interface, esperando os próximos.
type ExerciseVariant = {
  id: string;
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  available: boolean;
};

type PickerConfig = {
  title: string;
  route: 'Pushup' | 'Situp' | 'Squat';
  // Início/meio/fim do degradê do rastro — a cor do grupo muscular do
  // exercício, a mesma do pontinho no card e da legenda.
  trailColors: readonly [string, string, string];
  variants: ExerciseVariant[];
};

const EXERCISE_PICKERS: Partial<Record<ExerciseId, PickerConfig>> = {
  pushup: {
    title: 'PUSH-UPS',
    route: 'Pushup',
    trailColors: ['#1b4fd8', '#2f80ff', '#7ecbff'],
    variants: [
      { id: 'default', title: 'DEFAULT', icon: 'arm-flex', available: true },
      { id: 'pike', title: 'PIKE', icon: 'triangle-outline', available: false },
      { id: 'handstand', title: 'HANDSTAND', icon: 'yoga', available: false },
    ],
  },
  situp: {
    title: 'SIT-UPS',
    route: 'Situp',
    trailColors: ['#0d7a3d', '#20b95a', '#7ff0ae'],
    variants: [
      { id: 'default', title: 'DEFAULT', icon: 'human', available: true },
      { id: 'crunch', title: 'CRUNCH', icon: 'arrow-collapse-vertical', available: false },
      { id: 'twist', title: 'RUSSIAN TWIST', icon: 'rotate-3d-variant', available: false },
    ],
  },
  squat: {
    title: 'SQUATS',
    route: 'Squat',
    trailColors: ['#b8890f', '#f4c430', '#ffe9a3'],
    variants: [
      { id: 'default', title: 'DEFAULT', icon: 'weight-lifter', available: true },
      { id: 'jump', title: 'JUMP', icon: 'arrow-up-bold-outline', available: false },
      { id: 'pistol', title: 'PISTOL', icon: 'human-handsdown', available: false },
    ],
  },
};

type WorkoutModeId = 'practice' | 'time';

// A arte de cada modo já vem com o próprio rótulo ("PRACTICE" / "60s")
// desenhado na imagem, então o botão é só a arte ocupando o card inteiro —
// não há Text por cima pra não duplicar o nome.
type WorkoutMode = {
  id: WorkoutModeId;
  title: string;
  art: ImageSourcePropType;
};

const WORKOUT_MODES: WorkoutMode[] = [
  { id: 'practice', title: 'PRACTICE', art: require('../assets/icons/Practice-Icon.jpg') },
  { id: 'time', title: '60s', art: require('../assets/icons/60seconds-Mode-Icon.jpg') },
];

function VariantButton({
  exerciseId,
  variant,
  isActive,
  onPress,
}: {
  exerciseId: ExerciseId;
  variant: ExerciseVariant;
  isActive: boolean;
  onPress: (variant: ExerciseVariant) => void;
}) {
  const locked = !variant.available;
  // A variação "default" é o próprio exercício, então usa a arte dele; as
  // outras são poses distintas e seguem com ícone do MaterialCommunityIcons.
  const useArt = !locked && variant.id === 'default' && !!EXERCISE_ART[exerciseId];
  return (
    <Pressable
      style={[
        styles.variantCard,
        isActive && styles.variantCardActive,
        locked && styles.variantCardLocked,
      ]}
      onPress={() => onPress(variant)}
      accessibilityLabel={variant.title}
    >
      {useArt ? (
        <ExerciseGlyph
          id={exerciseId}
          size={
            exerciseId === 'pushup'
              ? VARIANT_GLYPH_SIZE * 1.07
              : exerciseId === 'squat'
                ? VARIANT_GLYPH_SIZE * 1.13
                : VARIANT_GLYPH_SIZE
          }
          color={isActive ? '#ff3b30' : '#d6d6dc'}
        />
      ) : (
        <MaterialCommunityIcons
          name={locked ? 'lock' : variant.icon}
          size={locked ? 30 : 44}
          color={locked ? '#6b6b73' : isActive ? '#ff3b30' : '#d6d6dc'}
        />
      )}
    </Pressable>
  );
}

function ModeButton({
  mode,
  isActive,
  onPress,
}: {
  mode: WorkoutMode;
  isActive: boolean;
  onPress: (mode: WorkoutMode) => void;
}) {
  return (
    <Pressable
      style={[styles.modeCard, isActive && styles.modeCardActive]}
      onPress={() => onPress(mode)}
      accessibilityLabel={mode.title}
    >
      <Image
        source={mode.art}
        style={[
          styles.modeArt,
          mode.id === 'practice' && styles.modeArtPractice,
          !isActive && styles.modeArtInactive,
        ]}
        resizeMode="cover"
      />
    </Pressable>
  );
}

function ExercisePickerCard({
  exerciseId,
  config,
  selectedVariant,
  selectedMode,
  onSelectVariant,
  onSelectMode,
  onStart,
}: {
  exerciseId: ExerciseId;
  config: PickerConfig;
  selectedVariant: string | null;
  selectedMode: WorkoutModeId | null;
  onSelectVariant: (variant: ExerciseVariant) => void;
  onSelectMode: (mode: WorkoutMode) => void;
  onStart: () => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollVisible, setScrollVisible] = useState(0);
  const [scrollContent, setScrollContent] = useState(0);
  const trail = useRef(new Animated.Value(0)).current;
  const scrollX = useRef(new Animated.Value(0)).current;
  const canStart = !!selectedVariant && !!selectedMode;

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

  // Barra de rolagem desenhada à mão: a nativa aparece e some sozinha, e
  // aqui ela faz parte do desenho — é o que avisa que existem mais
  // variações fora da tela. O polegar ocupa a mesma fração da trilha que a
  // área visível ocupa do conteúdo, então ele encolhe conforme entram
  // novos exercícios.
  const visibleRatio = scrollContent > 0 ? Math.min(1, scrollVisible / scrollContent) : 1;
  const thumbWidth = Math.max(24, scrollVisible * visibleRatio);
  const thumbX = scrollX.interpolate({
    inputRange: [0, Math.max(1, scrollContent - scrollVisible)],
    outputRange: [0, Math.max(0, scrollVisible - thumbWidth)],
    extrapolate: 'clamp',
  });

  const notAvailableYet = () =>
    Alert.alert('Em breve', 'Esse modo ainda está em desenvolvimento.');

  return (
    <View
      style={styles.pickerCard}
      onLayout={(e) =>
        setSize({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
    >
      <GradientTrail
        width={size.width}
        height={size.height}
        progress={trail}
        // O id do degradê é global dentro do SVG, então cada exercício precisa
        // do seu — senão o primeiro a montar tingiria os outros.
        gradientId={`pickerTrail-${exerciseId}`}
        colors={config.trailColors}
      />

      <Text style={styles.pickerTitle}>{config.title}</Text>

      {/* Rolagem lateral: só 3 variações hoje, mas o espaço já é pensado
          pras próximas que forem entrando. */}
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.variantScroll}
        contentContainerStyle={styles.variantScrollContent}
        // A medida é lida direto do evento, fora de um updater de estado:
        // o React recicla o evento sintético antes de rodar o updater, e lá
        // dentro `nativeEvent` já chega nulo.
        onLayout={(e) => setScrollVisible(e.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setScrollContent(width)}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
      >
        {config.variants.map((variant) => (
          <VariantButton
            key={variant.id}
            exerciseId={exerciseId}
            variant={variant}
            isActive={selectedVariant === variant.id}
            onPress={onSelectVariant}
          />
        ))}
      </Animated.ScrollView>

      <View style={styles.scrollTrack}>
        <Animated.View
          style={[
            styles.scrollThumb,
            { width: thumbWidth, transform: [{ translateX: thumbX }] },
          ]}
        />
      </View>

      <View style={styles.actionRow}>
        {WORKOUT_MODES.map((mode) => (
          <ModeButton
            key={mode.id}
            mode={mode}
            isActive={selectedMode === mode.id}
            onPress={onSelectMode}
          />
        ))}

        <View style={styles.pillColumn}>
          <Pressable style={styles.pill} onPress={notAvailableYet}>
            <Text style={styles.pillText}>1 V 1</Text>
          </Pressable>
          <Pressable style={styles.pill} onPress={notAvailableYet}>
            <Text style={styles.pillText}>2 V 2</Text>
          </Pressable>
          <Pressable
            style={[styles.pill, !canStart && styles.pillDisabled]}
            onPress={onStart}
            disabled={!canStart}
          >
            <Text style={styles.pillText}>INICIAR</Text>
            <MaterialCommunityIcons name="shield-half-full" size={16} color="#ffffff" />
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
              {!locked && EXERCISE_ART[exercise.id] ? (
                <ExerciseGlyph
                  id={exercise.id}
                  size={
                    exercise.id === 'situp' ? CARD_GLYPH_SIZE * 0.95 : CARD_GLYPH_SIZE
                  }
                  color={isActive ? '#ff3b30' : '#d6d6dc'}
                />
              ) : (
                <MaterialCommunityIcons
                  name={locked ? 'lock' : exercise.icon}
                  size={locked ? 22 : 30}
                  color={locked ? '#6b6b73' : isActive ? '#ff3b30' : '#d6d6dc'}
                />
              )}
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
  const { profile, consumePendingXp } = useProfile();

  const [selectedId, setSelectedId] = useState<ExerciseId | null>(null);
  const navigateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dailyChallenge = usePopModal();
  const exercisePicker = usePopModal();
  const challenge = useChallenge();
  // Qual exercício o seletor está mostrando. Não é limpo no fechamento: o
  // card continua montado durante a animação de saída, e zerar aqui faria
  // ele piscar em branco antes de sumir.
  const [pickerExercise, setPickerExercise] = useState<ExerciseId | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [workoutMode, setWorkoutMode] = useState<WorkoutModeId | null>(null);
  const pickerConfig = pickerExercise ? EXERCISE_PICKERS[pickerExercise] : undefined;

  const openExercisePicker = (id: ExerciseId) => {
    setPickerExercise(id);
    setVariantId(null);
    setWorkoutMode(null);
    exercisePicker.open();
  };

  const handleStartWorkout = () => {
    if (!pickerConfig || !variantId || !workoutMode) return;
    const { route } = pickerConfig;

    exercisePicker.close(() => {
      // Só a variação "default" no modo "practice" tem treino implementado
      // até aqui — o resto ainda é só interface.
      if (variantId === 'default' && workoutMode === 'practice') {
        navigation.navigate(route);
      } else {
        Alert.alert('Em breve', 'Esse modo ainda está em desenvolvimento.');
      }
    });
  };

  // -------------------------------------------------------------------------
  // Barra de XP animada
  // -------------------------------------------------------------------------
  // `displayXpTotal` é o XP total *exibido* — ele persegue o total real em
  // passos de 0,1. Tudo que a barra mostra (nível, preenchimento, texto) é
  // derivado dele, então o nível sobe sozinho no meio da contagem e a barra
  // recomeça do zero sem que o total acumulado seja tocado.
  const [displayXpTotal, setDisplayXpTotal] = useState(profile.xpTotal);
  const displayXpRef = useRef(profile.xpTotal);
  const xpTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref com o total real: o efeito de foco não pode depender dele como
  // dependência, senão remontaria e cortaria a contagem no meio.
  const xpTotalRef = useRef(profile.xpTotal);
  xpTotalRef.current = profile.xpTotal;

  const setDisplayXp = useCallback((value: number) => {
    displayXpRef.current = value;
    setDisplayXpTotal(value);
  }, []);

  const stopXpCountUp = useCallback(() => {
    if (xpTickRef.current) {
      clearInterval(xpTickRef.current);
      xpTickRef.current = null;
    }
  }, []);

  const startXpCountUp = useCallback(
    (target: number) => {
      stopXpCountUp();
      xpTickRef.current = setInterval(() => {
        const next = round1(displayXpRef.current + XP_TICK_STEP);
        if (next >= target) {
          setDisplayXp(target);
          stopXpCountUp();
          return;
        }
        setDisplayXp(next);
      }, XP_TICK_MS);
    },
    [setDisplayXp, stopXpCountUp]
  );

  useFocusEffect(
    useCallback(() => {
      setSelectedId(null);

      // O XP ganho no treino que acabou de terminar. Se houver, a barra
      // volta para onde estava antes dele e sobe até o valor novo.
      const gained = consumePendingXp();
      if (gained > 0) {
        setDisplayXp(round1(xpTotalRef.current - gained));
        startXpCountUp(xpTotalRef.current);
      } else {
        setDisplayXp(xpTotalRef.current);
      }

      return () => {
        stopXpCountUp();
        if (navigateTimeout.current) clearTimeout(navigateTimeout.current);
      };
    }, [consumePendingXp, setDisplayXp, startXpCountUp, stopXpCountUp])
  );

  // Estado da barra derivado do total exibido.
  const displayLevel = levelFromTotalXp(displayXpTotal);
  const displayLevelXp = round1(displayXpTotal - xpAtLevelStart(displayLevel));
  const displayLevelGoal = xpNeededForLevel(displayLevel);
  const xpRatio = Math.max(0, Math.min(1, displayLevelXp / displayLevelGoal));

  // Largura útil da trilha, medida no layout — a barra é uma View animada
  // que revela um SVG com o gradiente pintado na largura inteira.
  const [xpTrackWidth, setXpTrackWidth] = useState(0);

  const xpFillAnim = useRef(new Animated.Value(0)).current;
  const levelPopAnim = useRef(new Animated.Value(0)).current;
  const prevLevelRef = useRef(displayLevel);

  useEffect(() => {
    const leveledUp = displayLevel > prevLevelRef.current;
    const levelChanged = displayLevel !== prevLevelRef.current;
    prevLevelRef.current = displayLevel;

    if (levelChanged) {
      // A barra acabou de encher: zera na hora e volta a crescer no nível
      // novo. Sem `setValue`, o Animated interpolaria de ~100% até ~0% e a
      // barra pareceria esvaziar em vez de reiniciar.
      xpFillAnim.setValue(0);
      if (leveledUp) {
        levelPopAnim.setValue(0);
        Animated.sequence([
          Animated.timing(levelPopAnim, {
            toValue: 1,
            duration: 160,
            easing: Easing.out(Easing.back(2.5)),
            useNativeDriver: true,
          }),
          Animated.timing(levelPopAnim, {
            toValue: 0,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      }
    }

    Animated.timing(xpFillAnim, {
      toValue: xpRatio,
      duration: XP_TICK_MS,
      easing: Easing.linear,
      // Largura não é suportada pela native driver.
      useNativeDriver: false,
    }).start();
  }, [xpRatio, displayLevel, xpFillAnim, levelPopAnim]);

  const xpFillWidth = xpFillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, xpTrackWidth],
  });

  const levelPopScale = levelPopAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.25],
  });

  const handlePress = (exercise: Exercise) => {
    setSelectedId(exercise.id);

    navigateTimeout.current = setTimeout(() => {
      // Quem tem entrada em EXERCISE_PICKERS abre o seletor; o resto ainda
      // não tem treino nenhum ligado.
      if (EXERCISE_PICKERS[exercise.id]) {
        openExercisePicker(exercise.id);
      } else {
        Alert.alert(
          'Em breve',
          `O modo ${exercise.title.toLowerCase()} ainda está em desenvolvimento.`
        );
      }
    }, 220);
  };

  // Abre uma sessão nova do desafio e entra pelo aviso de aquecimento. A
  // navegação só acontece depois da animação de fechamento do card, pelo
  // callback do close() — é o mesmo padrão do seletor de exercício.
  const handleStartChallenge = () => {
    challenge.startChallenge();
    dailyChallenge.close(() => navigation.navigate('ChallengeWarmup'));
  };

  const handleSettingsPress = () => {
    Alert.alert('Em breve', 'A tela de configurações ainda está em desenvolvimento.');
  };

  const goToRanking = () => {
    // Trava final: nenhum caminho leva ao ranking com um modal por cima.
    if (modalOpenRef.current) return;
    navigation.navigate('Ranking');
  };

  // Enquanto um modal está aberto o deslize da Home não vale: arrastar pro
  // lado dentro do seletor de exercício (na rolagem de variações, por exemplo)
  // abria o ranking por baixo do card. O PanResponder é criado uma vez só,
  // então a visibilidade vai por ref — ler o estado direto congelaria o valor
  // da primeira renderização dentro do closure.
  const modalOpenRef = useRef(false);
  modalOpenRef.current = dailyChallenge.visible || exercisePicker.visible;

  // Detector do gesto de Swipe (deslize) para a direita — usa o
  // PanResponder nativo do React Native, sem depender de
  // react-native-gesture-handler (que não está instalado no projeto e
  // causava o erro "Unable to resolve module react-native-gesture-handler").
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        !modalOpenRef.current &&
        Math.abs(gestureState.dx) > 20 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5,
      onPanResponderRelease: (_evt, gestureState) => {
        if (modalOpenRef.current) return;
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
        <View style={styles.topBarLeft}>
          <View style={styles.coinBadge}>
            <CoinIcon width={30} height={30} />
            <Text style={styles.coinText}>{profile.coins}</Text>
          </View>
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
            <Animated.View
              style={[styles.lvBadge, { transform: [{ scale: levelPopScale }] }]}
            >
              <Text style={styles.lvBadgeText}>LV {displayLevel}</Text>
            </Animated.View>
            <View
              style={styles.xpTrack}
              onLayout={(e) => setXpTrackWidth(e.nativeEvent.layout.width)}
            >
              {/* O gradiente é pintado na largura inteira da trilha e vai
                  sendo revelado pela View animada — assim a cor em cada
                  ponto depende de quanto a barra está cheia, e não de
                  esticar um degradê curto. */}
              <Animated.View style={[styles.xpFill, { width: xpFillWidth }]}>
                {xpTrackWidth > 0 && (
                  <Svg width={xpTrackWidth} height={XP_TRACK_HEIGHT}>
                    <Defs>
                      <LinearGradient id="xpFill" x1="0" y1="0" x2="1" y2="0">
                        {XP_GRADIENT_STOPS.map((stop) => (
                          <Stop
                            key={stop.offset}
                            offset={stop.offset}
                            stopColor={stop.color}
                          />
                        ))}
                      </LinearGradient>
                    </Defs>
                    <Rect
                      width={xpTrackWidth}
                      height={XP_TRACK_HEIGHT}
                      fill="url(#xpFill)"
                    />
                  </Svg>
                )}
              </Animated.View>
            </View>
          </View>
          <Text style={styles.xpValueText}>
            {displayLevelXp.toFixed(1)} / {displayLevelGoal} XP
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

      {/* Ofensiva (streak), no canto direito logo abaixo da foto do perfil.
          O número ainda é fixo — a contagem real de dias seguidos entra depois. */}
      <View style={styles.streakBadge}>
        <Image
          source={STREAK_FLAME}
          style={styles.streakFlame}
          resizeMode="contain"
        />
        <Text style={styles.streakText}>{profile.streakDays}</Text>
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
          onPress={dailyChallenge.open}
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
        visible={dailyChallenge.visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => dailyChallenge.close()}
      >
        <View style={styles.challengeRoot}>
          <Animated.View
            pointerEvents="none"
            style={[styles.challengeBackdrop, { opacity: dailyChallenge.backdropAnim }]}
          />

          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => dailyChallenge.close()}
          />

          <Animated.View
            style={{
              opacity: dailyChallenge.opacity,
              transform: [
                { scale: dailyChallenge.scale },
                { translateY: dailyChallenge.translateY },
              ],
            }}
          >
            <DailyChallengeCard onStart={handleStartChallenge} />
          </Animated.View>
        </View>
      </Modal>

      {/* Seletor de variação/modo — abre ao tocar num card da grade de
          exercícios, mostrando o exercício tocado. Mesmo padrão do Desafio
          Diário: fundo com fade + card com "pop". */}
      <Modal
        visible={exercisePicker.visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => exercisePicker.close()}
      >
        <View style={styles.pickerRoot}>
          <Animated.View
            pointerEvents="none"
            style={[styles.challengeBackdrop, { opacity: exercisePicker.backdropAnim }]}
          />

          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => exercisePicker.close()}
          />

          <Animated.View
            style={{
              opacity: exercisePicker.opacity,
              transform: [
                { scale: exercisePicker.scale },
                { translateY: exercisePicker.translateY },
              ],
            }}
          >
            {pickerExercise && pickerConfig && (
              <ExercisePickerCard
                exerciseId={pickerExercise}
                config={pickerConfig}
                selectedVariant={variantId}
                selectedMode={workoutMode}
                onSelectVariant={(variant) =>
                  variant.available
                    ? setVariantId(variant.id)
                    : Alert.alert('Em breve', 'Essa variação ainda está em desenvolvimento.')
                }
                onSelectMode={(mode) => setWorkoutMode(mode.id)}
                onStart={handleStartWorkout}
              />
            )}
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
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  coinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 4,
  },
  streakBadge: {
    flexDirection: 'row',
    // Número alinhado pela base da chama (o gif começa de baixo).
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    paddingHorizontal: 4,
    gap: 2,
  },
  streakFlame: {
    width: 60,
    height: 60,
  },
  streakText: {
    color: '#ff7a1a',
    fontFamily: 'Yearbook Solid',
    fontSize: 26,
    lineHeight: 26,
    includeFontPadding: false,
    textAlignVertical: 'center',
    paddingBottom: 9,
    fontWeight: '400',
    letterSpacing: 0.8,
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
    height: XP_TRACK_HEIGHT,
    backgroundColor: '#1c1c22',
    borderRadius: XP_TRACK_HEIGHT / 2,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: XP_TRACK_HEIGHT / 2,
    overflow: 'hidden',
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
    top: 10,
    left: '50%',
    marginLeft: -31,
    width: 62,
    height: 62,
    borderRadius: 31,
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

  /* Seletor de variação/modo de exercício */
  pickerRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 140,
  },
  pickerCard: {
    backgroundColor: '#15151f',
    borderRadius: CHALLENGE_BORDER_RADIUS,
    padding: SPACING.lg,
    overflow: 'hidden',
  },
  pickerTitle: {
    color: '#ffffff',
    fontFamily: 'Yearbook Solid',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  variantScroll: {
    flexGrow: 0,
  },
  variantScrollContent: {
    gap: SPACING.sm,
  },
  variantCard: {
    width: 104,
    height: 104,
    borderRadius: RADIUS.lg,
    backgroundColor: '#20202d',
    borderWidth: 1.5,
    borderColor: '#171722',
    justifyContent: 'center',
    alignItems: 'center',
  },
  variantCardActive: {
    borderColor: '#ff3b30',
    backgroundColor: '#25181a',
  },
  variantCardLocked: {
    opacity: 0.55,
  },
  scrollTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#20202d',
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  scrollThumb: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#8a8a92',
  },
  // A linha de ação ganha altura própria: antes ela media o mesmo que os
  // cards de modo (84), e as três pills tinham que dividir isso em fatias de
  // ~24. Com a altura solta os botões crescem sem empurrar os cards de modo
  // pros lados — a largura ali é disputada com a coluna de pills.
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 132,
    gap: SPACING.sm,
  },
  modeCard: {
    width: 92,
    height: 92,
    backgroundColor: '#20202d',
    borderWidth: 1.5,
    borderColor: '#171722',
    borderRadius: RADIUS.lg,
    // A arte vai até a borda, então o card precisa recortar o que passa do
    // raio — sem isso os cantos da imagem aparecem quadrados por cima.
    overflow: 'hidden',
  },
  // As duas artes trazem cantos brancos (o "quadrado" do PNG original em
  // volta do ícone arredondado, sem canal alfa no JPG) — um leve zoom empurra
  // essa borda branca pra fora da área visível, que o card já recorta com
  // overflow: hidden.
  modeArt: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.01 }],
  },
  // Zoom central só na arte do Practice — mude o valor de scale pra ajustar.
  modeArtPractice: {
    transform: [{ scale: 1.05 }],
  },
  // Modo não escolhido fica apagado: a diferença de brilho é o que separa os
  // dois, já que as duas artes têm cor forte própria.
  modeArtInactive: {
    opacity: 0.5,
  },
  modeCardActive: {
    borderColor: '#ff3b30',
    backgroundColor: '#25181a',
  },
  pillColumn: {
    flex: 1,
    alignSelf: 'stretch',
    gap: SPACING.sm,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ff3b30',
    borderRadius: RADIUS.xl,
  },
  pillDisabled: {
    backgroundColor: '#2a2a35',
  },
  pillText: {
    color: '#ffffff',
    fontFamily: 'Yearbook Solid',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 1,
  },
});
