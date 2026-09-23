// screens/SquatWorkoutScreen.tsx
// Tela de treino de agachamento — MediaPipe Pose rodando via WebView.
// Mesma arquitetura das telas de flexão/abdominal (câmera + canvas
// sobrepostos, ambos com a mesma CSS de escala, então a coordenada x/y de
// cada landmark permanece correta e alinhada ao vídeo, em pé, na vertical).

import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, SafeAreaView, Pressable, Modal } from 'react-native';
import { WebView } from 'react-native-webview';
import { Camera } from 'expo-camera';
import { Accelerometer } from 'expo-sensors';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useProfile } from '../context/ProfileContext';
import { RADIUS, SPACING } from '../constants/theme';
import WorkoutTutorialModal, { useWorkoutTutorial } from '../components/WorkoutTutorialModal';
import ExitWorkoutModal from '../components/ExitWorkoutModal';
import ChallengeStepBanner from '../components/ChallengeStepBanner';
import { useChallengeRunner } from '../hooks/useChallengeRunner';

export type Stage = 'up' | 'down' | 'unknown';

type Props = NativeStackScreenProps<RootStackParamList, 'Squat'>;

// XP e calorias por repetição. Diferente da flexão (1 XP / 0.5 kcal por
// repetição): o agachamento rende menos XP por rep (0.1) mas o gasto
// calórico médio usado aqui é outro valor (também uma estimativa).
const XP_PER_REP = 0.1;
const CALORIES_PER_REP = 0.32;

// Arredonda pra 1 casa decimal sem deixar sobras de ponto flutuante (ex:
// 1000 * 0.1 vira 100.00000000000001 em JS). Importante pra treinos longos
// com muitas repetições.
const round1 = (n: number) => Math.round(n * 10) / 10;

const SQUAT_TUTORIAL_STORAGE_KEY = '@pushup_counter/squat_tutorial_hidden';

export default function SquatWorkoutScreen({ navigation }: Props) {
  const { addXp } = useProfile();

  // Esta tela é a MESMA dentro e fora do Desafio Diário — ver
  // hooks/useChallengeRunner.ts e a nota equivalente na tela de flexão.
  const challenge = useChallengeRunner('squat');
  // Cor de destaque: verde no treino livre, a cor do nível no desafio.
  const accent = challenge.accent;
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);
  const [stage, setStage] = useState<Stage>('unknown');
  const [feedback, setFeedback] = useState('Solicitando permissão...');
  const [countdown, setCountdown] = useState<number | string | null>(null);
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);

  const webViewRef = useRef<WebView>(null);

  // Controle de tempo decorrido (em segundos)
  const [durationSeconds, setDurationSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Espelhos síncronos de count/duração: quando o desafio termina por saída
  // de posição, o placar é lido na hora, de dentro do handler da WebView.
  const countRef = useRef(0);
  const durationRef = useRef(0);

  useEffect(() => {
    countRef.current = count;
  }, [count]);

  useEffect(() => {
    durationRef.current = durationSeconds;
  }, [durationSeconds]);

  const [exitCountdown, setExitCountdown] = useState<number | null>(null);
  const [isPositionLost, setIsPositionLost] = useState(false);

  // Modal de fim de treino (resumo)
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  const tutorial = useWorkoutTutorial(SQUAT_TUTORIAL_STORAGE_KEY);
  const [showExitModal, setShowExitModal] = useState(false);

  // O agachamento só conta com o celular apoiado na VERTICAL (retrato,
  // em pé), filmando a pessoa de corpo inteiro de frente/lado — o oposto da
  // flexão/abdominal, que exigem o aparelho deitado de lado. Mesma detecção
  // via acelerômetro das outras telas (eixo y dominante sobre o eixo x
  // quando o celular está em pé), porque a UI do app fica travada em
  // portrait mesmo que o aparelho físico esteja deitado.
  const [isPortrait, setIsPortrait] = useState(false);
  const isPortraitRef = useRef(false);

  useEffect(() => {
    isPortraitRef.current = isPortrait;
  }, [isPortrait]);

  useEffect(() => {
    let smoothedX = 0;
    let smoothedY = 0;

    Accelerometer.requestPermissionsAsync().catch(() => { });
    Accelerometer.setUpdateInterval(200);

    const subscription = Accelerometer.addListener(({ x, y }) => {
      smoothedX = smoothedX * 0.7 + x * 0.3;
      smoothedY = smoothedY * 0.7 + y * 0.3;

      const portrait = Math.abs(smoothedY) > Math.abs(smoothedX) && Math.abs(smoothedY) > 0.4;
      setIsPortrait((prev) => (prev !== portrait ? portrait : prev));
    });

    return () => subscription.remove();
  }, []);

  // Propaga o estado de orientação pra dentro da WebView sempre que ele
  // mudar — a lógica de pose (MediaPipe) roda lá dentro, então é lá que a
  // contagem precisa ser pausada/retomada.
  useEffect(() => {
    webViewRef.current?.injectJavaScript(`
      (function() {
        if (window.__setOrientationOk) { window.__setOrientationOk(${isPortrait}); }
      })();
      true;
    `);
  }, [isPortrait]);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status === 'granted') {
        setFeedback('Iniciando câmera...');
      } else {
        setFeedback('Permissão de câmera negada.');
      }
    })();
  }, []);

  // Timer da duração do treino ativo
  useEffect(() => {
    if (isWorkoutActive && !isPositionLost) {
      timerRef.current = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isWorkoutActive, isPositionLost]);

  // Para o stream de câmera de dentro da WebView explicitamente assim que o
  // treino termina — evita a câmera preta ao abrir o próximo treino (mesmo
  // bug/mesma correção da PushupWorkoutScreen).
  const stopCamera = () => {
    webViewRef.current?.injectJavaScript(`
      (function() {
        try {
          if (window.__stopCamera) { window.__stopCamera(); }
        } catch (e) {}
      })();
      true;
    `);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Fecha a etapa atual do desafio com o placar desta tela. Devolve true
  // quando o desafio assumiu o controle (a navegação já saiu daqui), pra que
  // o modal de resumo do treino livre não abra por cima da tela seguinte.
  const settleChallenge = (outcome: 'done' | 'failed', reps: number) =>
    challenge.settle(outcome, {
      reps,
      xp: round1(reps * XP_PER_REP),
      calories: round1(reps * CALORIES_PER_REP),
      seconds: durationRef.current,
    });

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'COUNTDOWN') {
        setCountdown(data.value);
        setIsWorkoutActive(false);
      } else if (data.type === 'READY') {
        setIsWorkoutActive(true);
        setCountdown('GO!');
        setTimeout(() => setCountdown(null), 1000);
      } else if (data.type === 'UPDATE') {
        countRef.current = data.count;
        setCount(data.count);
        setStage(data.stage);
        setFeedback(
          data.stage === 'down'
            ? 'Ótimo! Agora suba'
            : data.stage === 'up'
              ? 'Repetição contabilizada!'
              : 'Mantenha o ritmo'
        );

        // Meta da etapa batida. Sendo o agachamento a última etapa, é daqui
        // que sai a tela de "Desafio Diário concluído".
        if (challenge.isActive && data.count >= challenge.targetReps) {
          stopCamera();
          setIsWorkoutActive(false);
          settleChallenge('done', challenge.targetReps);
        }
      } else if (data.type === 'STATUS') {
        setFeedback(data.message);
      } else if (data.type === 'POSITION_LOST_TICK') {
        setIsPositionLost(true);
        setExitCountdown(data.value);
      } else if (data.type === 'POSITION_RESTORED') {
        setIsPositionLost(false);
        setExitCountdown(null);
      } else if (data.type === 'WORKOUT_FINISHED') {
        stopCamera();
        setIsPositionLost(false);
        setIsWorkoutActive(false);
        // No desafio, sair da posição encerra o desafio inteiro — o usuário
        // fica só com o XP das repetições que já fez.
        if (settleChallenge('failed', countRef.current)) return;
        setShowSummaryModal(true);
      }
    } catch (err) {
      console.warn('Erro ao processar dados:', err);
    }
  };

  const handleConfirmExit = () => {
    setShowExitModal(false);
    stopCamera();
    setIsWorkoutActive(false);
    // Desistir no meio do desafio conta como perder o desafio.
    if (settleChallenge('failed', countRef.current)) return;
    setShowSummaryModal(true);
  };

  const handleFinishAndNavigate = () => {
    setShowSummaryModal(false);
    addXp(xpEarned);
    navigation.navigate('Home');
  };

  const xpEarned = round1(count * XP_PER_REP);
  const calories = round1(count * CALORIES_PER_REP);

  // No desafio o contador para na meta e o que interessa é quanto falta.
  const displayCount = challenge.isActive
    ? Math.min(count, challenge.targetReps)
    : count;
  const remainingReps = Math.max(0, challenge.targetReps - count);

  // Formata os segundos em 00:00 ou 00:00:00
  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const pad = (num: number) => String(num).padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  // HUD do treino (contador de repetições no topo + badge de estado embaixo).
  //
  // Os overlays de contagem regressiva ("3 2 1 GO") e de saída ("3 2 1 STOP")
  // são <Modal>, ou seja, janelas NATIVAS separadas que ficam por cima de
  // tudo desta tela — inclusive do HUD, que some enquanto elas estão
  // visíveis. Por isso o HUD é uma função reaproveitada: ele é renderizado
  // de novo DENTRO de cada modal, no mesmo lugar (topo/rodapé), enquanto o
  // número da contagem regressiva fica centralizado no meio da tela. Assim o
  // contador de repetições continua legível e nada se sobrepõe.
  const renderHud = () => (
    <>
      <View style={styles.overlay} pointerEvents="none">
        {challenge.isActive && (
          <ChallengeStepBanner
            stepNumber={challenge.stepNumber}
            totalSteps={challenge.totalSteps}
            remaining={remainingReps}
                accent={accent}
          />
        )}

        <Text style={[styles.count, { color: accent }]}>
          {displayCount}
          {challenge.isActive && (
            <Text style={styles.countGoal}> / {challenge.targetReps}</Text>
          )}
        </Text>
        <Text style={styles.label}>AGACHAMENTOS VÁLIDOS</Text>
        <Text style={[styles.feedback, { borderColor: accent }]}>{feedback}</Text>
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.badge,
          {
            backgroundColor: isPositionLost
              ? '#ff0055'
              : stage === 'down'
                ? '#ff0055'
                : stage === 'up'
                  ? accent
                  : '#6c757d',
          },
        ]}
      >
        <Text style={styles.badgeText}>
          {isPositionLost
            ? 'FORA DA POSIÇÃO'
            : stage === 'down'
              ? 'AGACHADO (SUBA)'
              : stage === 'up'
                ? 'EM PÉ (DESÇA)'
                : 'FIQUE EM PÉ'}
        </Text>
      </View>
    </>
  );

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>
      <script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js" crossorigin="anonymous"></script>
      <style>
        body { margin: 0; padding: 0; background-color: #000; overflow: hidden; }
        .container { position: relative; width: 100vw; height: 100vh; }
        #webcam, #output_canvas {
          position: absolute;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          object-fit: cover;
          transform: scaleX(-1);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <video id="webcam" autoplay playsinline muted></video>
        <canvas id="output_canvas"></canvas>
      </div>
      <script>
        const videoElement = document.getElementById('webcam');
        const canvasElement = document.getElementById('output_canvas');
        const canvasCtx = canvasElement.getContext('2d');

        let count = 0;
        let stage = 'up';

        let countdownTimer = null;
        let countdownValue = 3;
        let isCountingDown = false;
        let isWorkoutActive = false;

        let exitTimer = null;
        let exitValue = 3;
        let isExiting = false;

        // Marca da posição EM PÉ (ver calibrateStanding): onde estavam a
        // cabeça, o quadril e os tornozelos no frame, e o ângulo dos
        // joelhos esticados. Definida antes do treino começar.
        let standing = null;

        // Só conta agachamento com o celular apoiado na VERTICAL (retrato,
        // em pé) — o React Native detecta isso via acelerômetro e injeta o
        // valor aqui.
        let orientationOk = false;

        window.__setOrientationOk = function(ok) {
          const wasOk = orientationOk;
          orientationOk = !!ok;
          if (!orientationOk && wasOk !== orientationOk) {
            resetCountdown();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            sendToRN('STATUS', { message: 'Segure o celular na vertical, em pé, para começar' });
          }
        };

        function sendToRN(type, payload) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
          }
        }

        // Os avisos de forma (ver estado 'up' abaixo) são avaliados a cada
        // frame; sem esse filtro seriam dezenas de postMessage por segundo
        // repetindo o mesmo texto.
        let lastStatusMessage = null;

        function sendStatus(message) {
          if (message === lastStatusMessage) return;
          lastStatusMessage = message;
          sendToRN('STATUS', { message });
        }

        // Qualquer outra mensagem (UPDATE, COUNTDOWN...) reescreve o texto de
        // feedback no lado React Native, então o filtro acima precisa
        // esquecer o último status pra ele poder reaparecer.
        function invalidateStatus() {
          lastStatusMessage = null;
        }

        function calculateAngle(A, B, C) {
          const radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
          let angle = Math.abs((radians * 180.0) / Math.PI);
          if (angle > 180.0) angle = 360 - angle;
          return angle;
        }

        function midpoint(A, B) {
          return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
        }

        // Ângulo do segmento A-B em relação à VERTICAL REAL (0° = em pé
        // reto, 90° = dobrado na horizontal). Com o celular travado na
        // vertical (ver orientationOk acima), o eixo Y do frame já
        // corresponde à vertical do mundo real, sem precisar da troca de
        // eixo usada na flexão/abdominal (que dependem do celular deitado).
        // Usado pra medir o quanto o tronco se inclina pra frente — sem
        // essa checagem, dava pra "roubar" o agachamento só dobrando o
        // joelho e inclinando o tronco pra frente, sem abaixar o quadril.
        function angleFromVertical(A, B) {
          const dx = B.x - A.x;
          const dy = B.y - A.y;
          const radians = Math.atan2(dx, dy);
          let angle = Math.abs((radians * 180.0) / Math.PI);
          if (angle > 90) angle = 180 - angle;
          return angle;
        }

        // Landmark "na tela" = visível E dentro dos limites normalizados do
        // frame (0 a 1). Evita contar repetições quando o MediaPipe está
        // "chutando" a posição de um ponto que saiu do enquadramento.
        function isOnScreen(p, minVis) {
          return (
            !!p &&
            p.visibility > minVis &&
            p.x >= 0 && p.x <= 1 &&
            p.y >= 0 && p.y <= 1
          );
        }

        // --- Limiares da repetição -------------------------------------
        // Mesmo formato da flexão: ângulo da articulação (os dois joelhos)
        // + deslocamento real do corpo. Uma repetição só conta passando
        // pelas fases completas: em pé -> fundo -> em pé de novo.
        //
        // O deslocamento é medido pela CABEÇA, na posição ABSOLUTA dela no
        // frame (a câmera está parada no apoio), comparada com onde ela
        // estava em pé antes do treino começar. Antes a altura era medida
        // em relação aos tornozelos — e aí dava pra roubar sentado no sofá:
        // esticando as pernas, os tornozelos subiam junto e o corpo
        // "parecia" ter voltado pra cima sem a pessoa levantar. A cabeça só
        // volta pro lugar marcado se a pessoa realmente ficar em pé.
        //
        // Todas as distâncias são frações da ALTURA DO CORPO em pé (cabeça
        // até tornozelos na imagem), então não dependem da distância até a
        // câmera.

        // Posição inicial / calibração: os dois joelhos acima disso.
        const KNEE_STRAIGHT = 158;

        // FUNDO: cabeça desceu, quadril desceu e os dois joelhos dobraram.
        // - A cabeça descendo é o sinal principal do movimento;
        // - o quadril descendo junto impede validar só se curvando pra
        //   frente (a cabeça desce, mas o quadril fica no alto);
        // - o joelho dobrando impede validar só abaixando a cabeça/tronco.
        // O joelho só precisa dobrar um pouco (medido em relação ao ângulo
        // em pé, então funciona também de frente pra câmera).
        const HEAD_DROP_DOWN = 0.14;   // cabeça 14%+ da altura do corpo abaixo da marca
        const HIP_DROP_DOWN = 0.10;    // quadril 10%+ abaixo da posição em pé
        const KNEE_BENT_MAX = 170;
        const KNEE_DELTA_DOWN = 10;

        // SUBIDA: pernas quase totalmente retas E cabeça de volta perto da
        // marca inicial E pés no chão.
        // - Cabeça: até HEAD_DROP_UP abaixo da marca, ou recuperou
        //   HEAD_RECOVERY_UP do caminho desde o fundo dessa repetição.
        // - Pés: os tornozelos não podem ter subido mais que FEET_LIFT_MAX
        //   (bloqueia esticar as pernas sentado / deitado).
        const KNEE_UP = 162;
        const KNEE_DELTA_UP = 8;
        const HEAD_DROP_UP = 0.05;
        const HEAD_RECOVERY_UP = 0.8;
        const FEET_LIFT_MAX = 0.06;

        const MAX_TORSO_ANGLE = 55;

        // Quantos frames ruins seguidos toleramos antes de acusar saída de
        // posição — sem essa folga, um joelho/tornozelo piscando por um
        // frame disparava o STOP e travava a contagem.
        const BAD_FRAME_TOLERANCE = 6;
        let badFrames = 0;

        // Queda máxima da cabeça na repetição atual (fase 'down').
        let bottomHeadDrop = 0;
        // Começou a descer sem chegar no fundo — só pro aviso de
        // repetição incompleta.
        let repStarted = false;

        // Pontos da cabeça: nariz, olhos e orelhas.
        const HEAD_POINTS = [0, 2, 5, 7, 8];

        // Altura (y) da cabeça = média dos pontos da cabeça visíveis. Se
        // nenhum estiver visível (cabeça virou / saiu do quadro), estima a
        // partir dos ombros, usando a distância cabeça-ombro medida em pé.
        function headY(kp, shoulderMidY) {
          const pts = HEAD_POINTS.map((i) => kp[i]).filter((p) => isOnScreen(p, 0.5));
          if (pts.length > 0) {
            return pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
          }
          if (standing) return shoulderMidY - standing.headToShoulder;
          return null;
        }

        // Lê do frame tudo que a contagem usa (ângulos, alturas, tronco).
        function readSquat(kp) {
          const hipMid = midpoint(kp[23], kp[24]);
          const shoulderMid = midpoint(kp[11], kp[12]);
          const ankleMid = midpoint(kp[27], kp[28]);

          const leftKnee = calculateAngle(kp[23], kp[25], kp[27]);
          const rightKnee = calculateAngle(kp[24], kp[26], kp[28]);

          return {
            leftKnee,
            rightKnee,
            kneeAvg: (leftKnee + rightKnee) / 2,
            torsoUpright: angleFromVertical(shoulderMid, hipMid) <= MAX_TORSO_ANGLE,
            headY: headY(kp, shoulderMid.y),
            shoulderY: shoulderMid.y,
            hipY: hipMid.y,
            ankleY: ankleMid.y,
          };
        }

        // Em pé, ereto, com as duas pernas retas e a cabeça visível:
        // posição inicial válida.
        function isStanding(m) {
          return (
            m.leftKnee > KNEE_STRAIGHT &&
            m.rightKnee > KNEE_STRAIGHT &&
            m.torsoUpright &&
            m.headY !== null &&
            m.ankleY - m.headY > 0.2
          );
        }

        // Marca a posição em pé: onde estão a cabeça, o quadril e os
        // tornozelos, e o ângulo dos joelhos esticados.
        function calibrateStanding(m) {
          standing = {
            headY: m.headY,
            hipY: m.hipY,
            ankleY: m.ankleY,
            kneeAngle: m.kneeAvg,
            bodyHeight: m.ankleY - m.headY,
            headToShoulder: m.shoulderY - m.headY,
          };
        }

        // Em pé entre as repetições, reajusta a marca devagar (5% por
        // frame) — cobre pequenos passos da pessoa no meio do treino sem
        // nunca acompanhar a descida.
        function refineStanding(m) {
          const k = 0.05;
          standing.headY += (m.headY - standing.headY) * k;
          standing.hipY += (m.hipY - standing.hipY) * k;
          standing.ankleY += (m.ankleY - standing.ankleY) * k;
          standing.kneeAngle += (m.kneeAvg - standing.kneeAngle) * k;
          standing.bodyHeight = standing.ankleY - standing.headY;
        }

        // Deslocamento em relação à marca em pé, em frações da altura do
        // corpo (positivo = desceu).
        function movementFrom(m) {
          return {
            headDrop: (m.headY - standing.headY) / standing.bodyHeight,
            hipDrop: (m.hipY - standing.hipY) / standing.bodyHeight,
            feetLift: (standing.ankleY - m.ankleY) / standing.bodyHeight,
            kneeDrop: standing.kneeAngle - m.kneeAvg,
          };
        }

        function isAtBottom(m, mv) {
          const kneesBent =
            m.leftKnee < KNEE_BENT_MAX &&
            m.rightKnee < KNEE_BENT_MAX &&
            mv.kneeDrop >= KNEE_DELTA_DOWN;
          const bodyDown = mv.headDrop >= HEAD_DROP_DOWN && mv.hipDrop >= HIP_DROP_DOWN;
          return kneesBent && bodyDown;
        }

        function isBackUp(m, mv) {
          const legsStraight =
            mv.kneeDrop <= KNEE_DELTA_UP ||
            (m.leftKnee > KNEE_UP && m.rightKnee > KNEE_UP);
          const recovery =
            bottomHeadDrop > 0 ? (bottomHeadDrop - mv.headDrop) / bottomHeadDrop : 0;
          const headBack = mv.headDrop <= HEAD_DROP_UP || recovery >= HEAD_RECOVERY_UP;
          const feetOnFloor = mv.feetLift <= FEET_LIFT_MAX;
          return legsStraight && headBack && feetOnFloor;
        }

        // Esqueleto completo: as duas pernas, os dois braços e o tronco.
        const SKELETON_CONNECTIONS = [
          [11, 12], // ombro-ombro
          [11, 13], [13, 15], // braço esquerdo (ombro-cotovelo-pulso)
          [12, 14], [14, 16], // braço direito
          [11, 23], [12, 24], // ombro-quadril (tronco)
          [23, 24], // quadril-quadril
          [23, 25], [25, 27], // perna esquerda (quadril-joelho-tornozelo)
          [24, 26], [26, 28], // perna direita
        ];

        // Reatribuir canvas.width/height realoca o buffer inteiro e zera todo
        // o estado do contexto — e faz isso mesmo quando o valor nao mudou.
        // Como isso rodava dentro do drawSkeleton, eram ~1,2MB realocados a
        // cada frame (~30x/s) so pra desenhar o esqueleto. Agora o tamanho so
        // e escrito quando o video realmente muda de resolucao; a limpeza por
        // frame continua sendo feita pelo clearRect, como antes.
        let canvasW = 0;
        let canvasH = 0;

        function syncCanvasSize() {
          const w = videoElement.videoWidth || 640;
          const h = videoElement.videoHeight || 480;
          if (w !== canvasW || h !== canvasH) {
            canvasElement.width = w;
            canvasElement.height = h;
            canvasW = w;
            canvasH = h;
          }
        }

        function drawSkeleton(kp, color = '#00e5ff') {
          syncCanvasSize();
          canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

          const w = canvasElement.width;
          const h = canvasElement.height;
          const minDrawVis = 0.3;

          canvasCtx.lineWidth = 6;
          canvasCtx.strokeStyle = color;
          canvasCtx.lineCap = 'round';

          SKELETON_CONNECTIONS.forEach(([i1, i2]) => {
            const p1 = kp[i1];
            const p2 = kp[i2];
            if (p1 && p2 && p1.visibility > minDrawVis && p2.visibility > minDrawVis) {
              canvasCtx.beginPath();
              canvasCtx.moveTo(p1.x * w, p1.y * h);
              canvasCtx.lineTo(p2.x * w, p2.y * h);
              canvasCtx.stroke();
            }
          });

          const pointIndexes = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
          pointIndexes.forEach((i) => {
            const p = kp[i];
            if (p && p.visibility > minDrawVis) {
              canvasCtx.beginPath();
              canvasCtx.arc(p.x * w, p.y * h, 8, 0, 2 * Math.PI);
              canvasCtx.fillStyle = '#ffffff';
              canvasCtx.fill();
              canvasCtx.lineWidth = 3;
              canvasCtx.strokeStyle = color;
              canvasCtx.stroke();
            }
          });
        }

        function resetCountdown() {
          if (isWorkoutActive) return;
          clearInterval(countdownTimer);
          countdownTimer = null;
          countdownValue = 3;
          isCountingDown = false;
        }

        // Um frame ruim sozinho não significa que a pessoa saiu da posição;
        // o STOP só dispara depois de BAD_FRAME_TOLERANCE frames seguidos.
        function registerBadFrame() {
          badFrames++;
          if (badFrames >= BAD_FRAME_TOLERANCE) startExitCountdown();
        }

        function startExitCountdown() {
          if (isExiting) return;
          isExiting = true;
          exitValue = 3;
          sendToRN('POSITION_LOST_TICK', { value: exitValue });

          exitTimer = setInterval(() => {
            exitValue--;
            if (exitValue > 0) {
              sendToRN('POSITION_LOST_TICK', { value: exitValue });
            } else {
              clearInterval(exitTimer);
              sendToRN('WORKOUT_FINISHED', {});
            }
          }, 1000);
        }

        function cancelExitCountdown() {
          if (!isExiting) return;
          clearInterval(exitTimer);
          exitTimer = null;
          isExiting = false;
          badFrames = 0;
          sendToRN('POSITION_RESTORED', {});
        }

        // Exposto para o lado React Native chamar via injectJavaScript assim
        // que o treino terminar — para o loop do MediaPipe Camera e solta
        // explicitamente as tracks do getUserMedia. Sem isso, o Android pode
        // continuar segurando o hardware da câmera depois que esta WebView é
        // desmontada, deixando a câmera preta na próxima tela.
        window.__stopCamera = function() {
          try {
            if (typeof camera !== 'undefined' && camera && typeof camera.stop === 'function') {
              camera.stop();
            }
          } catch (e) {}
          try {
            const stream = videoElement.srcObject;
            if (stream && typeof stream.getTracks === 'function') {
              stream.getTracks().forEach(function (track) {
                track.stop();
              });
            }
            videoElement.srcObject = null;
          } catch (e) {}
        };

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const pose = new Pose({
            locateFile: (file) => \`https://cdn.jsdelivr.net/npm/@mediapipe/pose/\${file}\`
          });

          pose.setOptions({
            // Modelo "lite": o agachamento é um movimento grande e fácil de
            // enxergar, e o modelo completo (1) processa bem menos frames
            // por segundo no celular — era isso que deixava o esqueleto
            // arrastado atrás do corpo.
            modelComplexity: 0,
            smoothLandmarks: true,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
          });

          pose.onResults((results) => {
            if (!orientationOk) {
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              if (!isWorkoutActive) resetCountdown();
              return;
            }

            if (!results.poseLandmarks) {
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              if (isWorkoutActive) registerBadFrame();
              else resetCountdown();
              return;
            }

            const kp = results.poseLandmarks;

            // 1) Visibilidade: as duas pernas inteiras (ombro até tornozelo,
            // dos dois lados) visíveis e dentro do enquadramento.
            const minVis = 0.4;
            const hasAllPoints = [11, 12, 23, 24, 25, 26, 27, 28].every((i) =>
              isOnScreen(kp[i], minVis)
            );

            if (!hasAllPoints) {
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              if (isWorkoutActive) {
                registerBadFrame();
              } else {
                resetCountdown();
                sendStatus('Fique de corpo inteiro visível na câmera');
              }
              return;
            }

            if (isWorkoutActive) {
              badFrames = 0;
              cancelExitCountdown();
            }

            const m = readSquat(kp);

            // 2) Pré-treino: a contagem regressiva só começa com a pessoa em
            // pé, ereta e com as pernas retas — e é aqui que a posição da
            // cabeça em pé é marcada.
            if (!isWorkoutActive) {
              if (!isStanding(m)) {
                drawSkeleton(kp, '#ff0055');
                resetCountdown();
                sendStatus('Fique em pé, ereto, com as duas pernas visíveis, para começar');
                return;
              }
              calibrateStanding(m);
            }

            const skeletonColor = isExiting ? '#ff0055' : (isWorkoutActive ? '${accent}' : '#00e5ff');
            drawSkeleton(kp, skeletonColor);

            // 3) Contagem regressiva.
            if (!isCountingDown && !isWorkoutActive) {
              isCountingDown = true;
              countdownValue = 3;
              sendToRN('COUNTDOWN', { value: countdownValue });

              countdownTimer = setInterval(() => {
                countdownValue--;
                if (countdownValue > 0) {
                  sendToRN('COUNTDOWN', { value: countdownValue });
                } else {
                  clearInterval(countdownTimer);
                  isCountingDown = false;
                  isWorkoutActive = true;
                  stage = 'up';
                  badFrames = 0;
                  bottomHeadDrop = 0;
                  repStarted = false;

                  sendToRN('READY', {});
                }
              }, 1000);
              return;
            }

            if (isCountingDown) return;

            // 4) Contagem da repetição.
            if (isWorkoutActive && !isExiting && m.headY !== null) {
              const mv = movementFrom(m);
              let stateChanged = false;

              if (stage === 'up') {
                // Desceu: cabeça e quadril abaixo da marca E joelhos dobrados.
                if (isAtBottom(m, mv)) {
                  stage = 'down';
                  bottomHeadDrop = mv.headDrop;
                  repStarted = false;
                  stateChanged = true;
                } else if (mv.headDrop >= HEAD_DROP_DOWN * 0.5) {
                  repStarted = true;
                } else if (repStarted && isBackUp(m, mv)) {
                  // Voltou pra cima sem ter chegado no fundo: não conta.
                  repStarted = false;
                  sendStatus('Agachamento incompleto — desça mais');
                }
              } else {
                if (mv.headDrop > bottomHeadDrop) bottomHeadDrop = mv.headDrop;

                // Subiu: pernas retas, cabeça de volta perto da marca e pés
                // no chão (ver isBackUp) — com o tronco ereto.
                if (isBackUp(m, mv)) {
                  if (m.torsoUpright) {
                    stage = 'up';
                    count++;
                    bottomHeadDrop = 0;
                    stateChanged = true;
                  } else {
                    sendStatus('Termine a subida com o tronco ereto');
                  }
                } else if (mv.feetLift > FEET_LIFT_MAX) {
                  sendStatus('Mantenha os pés no chão');
                }
              }

              if (stage === 'up' && !repStarted && Math.abs(mv.headDrop) < 0.03 && m.kneeAvg > KNEE_STRAIGHT) {
                refineStanding(m);
              }

              if (stateChanged) {
                invalidateStatus();
                sendToRN('UPDATE', { count, stage });
              }
            }
          });

          const camera = new Camera(videoElement, {
            onFrame: async () => {
              await pose.send({ image: videoElement });
            },
            width: 640,
            height: 480
          });

          camera.start().then(() => {
            sendToRN('STATUS', { message: 'Fique de corpo inteiro visível, em pé' });
          });
        }
      </script>
    </body>
    </html>
  `;

  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#fff' }}>Sem acesso à câmera.</Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButtonInline}>
          <Text style={{ color: '#ff3b30' }}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {hasPermission && tutorial.checked && !tutorial.visible && (
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{
            html: htmlContent,
            baseUrl: 'https://localhost',
          }}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          onMessage={handleMessage}
          onLoadEnd={() => {
            webViewRef.current?.injectJavaScript(`
              (function() {
                if (window.__setOrientationOk) { window.__setOrientationOk(${isPortraitRef.current}); }
              })();
              true;
            `);
          }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {!isWorkoutActive && !isPositionLost && !showSummaryModal && (
        <View style={styles.grayOverlay} pointerEvents="none" />
      )}

      {/* A WebView roda numa camada nativa própria e pode ignorar o
          empilhamento normal (zIndex) das Views do React Native — por isso
          esses dois overlays usam <Modal> (janela nativa separada) em vez de
          serem Views irmãs da WebView, que ficavam escondidas atrás da
          câmera (mesma correção já usada na tela de flexão). */}
      <Modal
        visible={isPositionLost && !showSummaryModal}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.redOverlay} pointerEvents="none">
          <View style={styles.centerStack}>
            <Text style={styles.exitTitle}>SAÍU DA POSIÇÃO!</Text>
            <Text style={styles.exitSubtitle}>
              {challenge.isActive ? 'Perdendo o desafio em' : 'Finalizando treino em'}
            </Text>
            <Text style={styles.exitCountdownText}>{exitCountdown}</Text>
            <Text style={styles.stopText}>STOP</Text>
          </View>
          {/* Mesmo SafeAreaView da tela de fora, pra que o HUD caia
              exatamente na mesma posição dentro da janela do modal. */}
          <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="none">
            {renderHud()}
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={countdown !== null && !isPositionLost && !showSummaryModal}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.countdownContainer} pointerEvents="none">
          <View style={styles.centerStack}>
            <Text style={[styles.countdownText, { color: accent }]}>{countdown}</Text>
          </View>
          {/* Mesmo SafeAreaView da tela de fora, pra que o HUD caia
              exatamente na mesma posição dentro da janela do modal. */}
          <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="none">
            {renderHud()}
          </SafeAreaView>
        </View>
      </Modal>

      {!showSummaryModal && (
        <Pressable style={styles.doorBackButton} onPress={() => setShowExitModal(true)}>
          <MaterialCommunityIcons name="door-open" size={26} color="#ff3b30" />
        </Pressable>
      )}

      {!showSummaryModal && renderHud()}

      {/* Modal de Fim de Treino (mesmo estilo neon usado na flexão) */}
      <Modal visible={showSummaryModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.summaryCard}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />

            <Text style={styles.summaryTitle}>FIM</Text>

            <Text style={styles.finalTimeText}>
              {formatTime(durationSeconds)}
            </Text>

            <View style={styles.summaryStatsContainer}>
              <Text style={styles.statLine}>
                <Text style={styles.statLabel}>XP Adquirido: </Text>
                <Text style={styles.statValue}>{xpEarned.toFixed(1)} XP</Text>
              </Text>

              <Text style={styles.statLine}>
                <Text style={styles.statLabel}>Total de Agachamentos: </Text>
                <Text style={styles.statValue}>{count}</Text>
              </Text>

              <Text style={styles.statLine}>
                <Text style={styles.statLabel}>Calorias Queimadas: </Text>
                <Text style={styles.statValue}>{calories.toFixed(1)} kcal</Text>
              </Text>
            </View>

            <Pressable style={styles.exitModalButton} onPress={handleFinishAndNavigate}>
              <Text style={styles.exitModalButtonText}>SAIR</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Tutorial de posicionamento (primeira vez / até o usuário marcar
          "não mostrar novamente"). Tocar em qualquer lugar avança pro
          próximo passo ou fecha no último — exceto na caixinha de
          checkbox, que é um Pressable aninhado e por isso captura o toque
          antes dele "vazar" pro Pressable de fora. */}
      <WorkoutTutorialModal
        visible={tutorial.visible}
        orientation="vertical"
        onDismiss={tutorial.dismiss}
      />

      <ExitWorkoutModal
        visible={showExitModal}
        reps={count}
        repsLabel="AGACHAMENTOS"
        elapsedLabel={formatTime(durationSeconds)}
        onCancel={() => setShowExitModal(false)}
        onConfirm={handleConfirmExit}
        isChallenge={challenge.isActive}
        accent={accent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', gap: 12 },
  backButtonInline: { marginTop: 8 },
  grayOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.50)',
  },
  redOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 0, 85, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  exitTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  exitSubtitle: {
    color: '#ffccd5',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  exitCountdownText: {
    fontSize: 110,
    fontWeight: '900',
    color: '#ffffff',
    marginVertical: -10,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowRadius: 10,
  },
  stopText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    backgroundColor: '#ff0055',
    paddingHorizontal: 24,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 10,
  },
  doorBackButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    borderWidth: 1.5,
    borderColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 40,
  },
  countdownContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
  },
  // Bloco centralizado no meio da tela (número da contagem regressiva /
  // aviso de saída da posição), separado do HUD que fica no topo e no rodapé.
  centerStack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 140,
    fontWeight: '900',
    color: '#00ff88',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowRadius: 16,
  },
  overlay: {
    position: 'absolute',
    top: 40,
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 35,
  },
  count: { fontSize: 80, fontWeight: '900', color: '#00ff88', textShadowColor: '#000', textShadowRadius: 8 },
  countGoal: { fontSize: 36, fontWeight: '900', color: '#6b6b73' },
  label: { fontSize: 13, fontWeight: '700', color: '#aaa', letterSpacing: 2, marginTop: -10 },
  feedback: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginTop: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.xl,
    borderColor: '#00ff88',
    borderWidth: 1,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.xl,
    zIndex: 35,
  },
  badgeText: { color: '#000', fontWeight: '800', fontSize: 14, letterSpacing: 1 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryCard: {
    width: 290,
    backgroundColor: '#0a0d14',
    paddingHorizontal: SPACING.xxl,
    paddingVertical: 28,
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  summaryTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#00e5ff',
    letterSpacing: 4,
    marginBottom: 4,
    textAlign: 'center',
  },
  finalTimeText: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 20,
  },
  summaryStatsContainer: {
    width: '100%',
    marginBottom: 24,
    gap: 8,
  },
  statLine: {
    fontSize: 15,
    marginBottom: 4,
  },
  statLabel: {
    color: '#8e9ab0',
    fontWeight: '600',
  },
  statValue: {
    color: '#ffffff',
    fontWeight: '800',
  },
  exitModalButton: {
    backgroundColor: '#ff3b30',
    width: '100%',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  exitModalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },

  corner: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderColor: '#00e5ff',
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },

});
