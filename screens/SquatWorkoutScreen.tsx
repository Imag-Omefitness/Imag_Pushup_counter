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
        setCount(data.count);
        setStage(data.stage);
        setFeedback(
          data.stage === 'down'
            ? 'Ótimo! Agora suba'
            : data.stage === 'up'
              ? 'Repetição contabilizada!'
              : 'Mantenha o ritmo'
        );
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
        addXp(round1(count * XP_PER_REP));
        setIsPositionLost(false);
        setIsWorkoutActive(false);
        setShowSummaryModal(true);
      }
    } catch (err) {
      console.warn('Erro ao processar dados:', err);
    }
  };

  const handleConfirmExit = () => {
    setShowExitModal(false);
    stopCamera();
    addXp(round1(count * XP_PER_REP));
    setIsWorkoutActive(false);
    setShowSummaryModal(true);
  };

  const handleFinishAndNavigate = () => {
    setShowSummaryModal(false);
    navigation.navigate('Home');
  };

  const xpEarned = round1(count * XP_PER_REP);
  const calories = round1(count * CALORIES_PER_REP);

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
        <Text style={styles.count}>{count}</Text>
        <Text style={styles.label}>AGACHAMENTOS VÁLIDOS</Text>
        <Text style={styles.feedback}>{feedback}</Text>
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
                  ? '#00ff88'
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

        // Referências da pessoa EM PÉ (calibradas enquanto o treino não
        // começou, e reajustadas devagar no topo de cada repetição):
        // - altura do quadril e do ombro acima dos tornozelos, medidas em
        //   "comprimentos de tronco" (pra saber o quanto o corpo desceu);
        // - ângulo médio dos joelhos esticados (pra medir o quanto eles
        //   dobraram a partir da posição real da pessoa, e não de um valor
        //   fixo que varia com o ângulo da câmera).
        let standingHipHeight = null;
        let standingShoulderHeight = null;
        let standingKneeAngle = null;

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

        function distance(A, B) {
          return Math.hypot(B.x - A.x, B.y - A.y);
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

        // Altura do quadril acima dos tornozelos, medida em "comprimentos de
        // tronco". Normalizar pelo tronco (segmento rígido, e que continua
        // do mesmo tamanho na imagem esteja a pessoa de frente ou de lado)
        // deixa o valor independente da distância até a câmera: a pessoa
        // pode se afastar ou se aproximar que o número não muda.
        function heightInTorsos(point, shoulderMid, hipMid, ankleMid) {
          const torsoLength = distance(shoulderMid, hipMid);
          if (torsoLength < 0.01) return null;
          return (ankleMid.y - point.y) / torsoLength;
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

        // SUAVIZAÇÃO TEMPORAL (EMA — média móvel exponencial).
        //
        // Por quê: a versão anterior escolhia UM lado só (o mais visível
        // naquele frame específico) pra calcular o ângulo do joelho. Isso
        // funcionava, mas cada frame podia "trocar de lado" dependendo de
        // qual perna o MediaPipe enxergava melhor naquele instante — dando
        // uma leitura instável. A correção pra exigir as DUAS pernas ao
        // mesmo tempo tornou esse problema mais visível: agora qualquer
        // tremor/ruído momentâneo em UM ponto (de qualquer uma das duas
        // pernas) já é suficiente pra bagunçar a leitura do frame inteiro.
        //
        // Em vez de usar a posição crua de cada landmark (que pode saltar
        // de um frame pro outro por ruído do modelo), mantemos uma versão
        // "suavizada" que se move gradualmente em direção à posição nova a
        // cada frame, na proporção de SMOOTHING_ALPHA. Isso funciona como
        // um filtro passa-baixa: ruído de alta frequência (tremor de 1
        // frame) é atenuado, mas o movimento real da pessoa (que acontece
        // ao longo de vários frames) continua sendo seguido de perto.
        let smoothedLandmarks = null;
        const SMOOTHING_ALPHA = 0.55; // 0 = travado (ignora tudo de novo), 1 = sem suavização (cru)

        function smoothLandmarks(rawLandmarks) {
          if (!smoothedLandmarks) {
            // Primeiro frame válido depois de perder a pose: inicializa
            // igual ao cru, sem suavizar — senão o esqueleto "voaria" da
            // última posição válida até a nova ao reaparecer.
            smoothedLandmarks = rawLandmarks.map((p) => ({
              x: p.x, y: p.y, z: p.z, visibility: p.visibility,
            }));
            return smoothedLandmarks;
          }

          for (let i = 0; i < rawLandmarks.length; i++) {
            const raw = rawLandmarks[i];
            const prev = smoothedLandmarks[i];
            smoothedLandmarks[i] = {
              x: prev.x + SMOOTHING_ALPHA * (raw.x - prev.x),
              y: prev.y + SMOOTHING_ALPHA * (raw.y - prev.y),
              z: prev.z + SMOOTHING_ALPHA * (raw.z - prev.z),
              // Visibilidade NÃO é suavizada — precisa refletir o frame
              // atual pra detectar corretamente quando um ponto sai do
              // enquadramento sem atraso.
              visibility: raw.visibility,
            };
          }

          return smoothedLandmarks;
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

        function drawSkeleton(kp, color = '#00e5ff') {
          canvasElement.width = videoElement.videoWidth || 640;
          canvasElement.height = videoElement.videoHeight || 480;
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
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
          });

          pose.onResults((results) => {
            if (!orientationOk) {
              smoothedLandmarks = null;
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              if (!isWorkoutActive) resetCountdown();
              return;
            }

            if (!results.poseLandmarks) {
              // Reseta a suavização: sem isso, ao reaparecer na câmera o
              // esqueleto ficaria "grudado" na última posição válida antes
              // de sumir, e demoraria vários frames pra alcançar a posição
              // real (efeito de arrasto indesejado após uma oclusão).
              smoothedLandmarks = null;
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              if (!isWorkoutActive) resetCountdown();
              if (isWorkoutActive) startExitCountdown();
              return;
            }

            const kp = smoothLandmarks(results.poseLandmarks);

            const leftHip = kp[23];
            const rightHip = kp[24];
            const leftKnee = kp[25];
            const rightKnee = kp[26];
            const leftAnkle = kp[27];
            const rightAnkle = kp[28];
            const leftShoulder = kp[11];
            const rightShoulder = kp[12];

            // Exige as duas pernas inteiras (ombro até tornozelo, dos dois
            // lados) visíveis e dentro do enquadramento - filtro "todos os
            // pontos na tela".
            const minVis = 0.5;
            const hasAllPoints =
              isOnScreen(leftShoulder, minVis) &&
              isOnScreen(rightShoulder, minVis) &&
              isOnScreen(leftHip, minVis) &&
              isOnScreen(rightHip, minVis) &&
              isOnScreen(leftKnee, minVis) &&
              isOnScreen(rightKnee, minVis) &&
              isOnScreen(leftAnkle, minVis) &&
              isOnScreen(rightAnkle, minVis);

            if (isWorkoutActive && !hasAllPoints) {
              startExitCountdown();
            } else if (isWorkoutActive && hasAllPoints) {
              cancelExitCountdown();
            }

            if (!isWorkoutActive && !hasAllPoints) {
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              resetCountdown();
              sendStatus('Fique de corpo inteiro visível na câmera');
              return;
            }

            // Ângulo de CADA joelho (quadril-joelho-tornozelo), calculado
            // separadamente pro lado esquerdo e direito. Só conta o
            // movimento quando os DOIS joelhos dobram (e depois os DOIS
            // estendem de novo) — evita contar agachamento assimétrico ou
            // um "chute" de perna só.
            const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
            const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);

            // Pontos médios (esquerdo+direito) do quadril, ombro e
            // tornozelo — usados pros vetores de corpo inteiro abaixo em
            // vez de só um lado, então ruído/oclusão de um lado só não
            // derruba a leitura.
            const hipMid = midpoint(leftHip, rightHip);
            const shoulderMid = midpoint(leftShoulder, rightShoulder);
            const ankleMid = midpoint(leftAnkle, rightAnkle);

            // Ângulo do tronco (ombro-quadril) em relação à vertical real —
            // precisa continuar razoavelmente ereto. Sem essa checagem,
            // dava pra "roubar" o agachamento só se curvando pra frente
            // (dobrar a cintura) sem realmente flexionar o joelho e abaixar
            // o quadril.
            const torsoAngle = angleFromVertical(shoulderMid, hipMid);
            const isTorsoUpright = torsoAngle <= 55;

            const kneeAngleAvg = (leftKneeAngle + rightKneeAngle) / 2;

            // Limiares do ângulo de joelho.
            //
            // KNEE_STRAIGHT: no topo os dois joelhos precisam estar
            // realmente esticados — é o começo da "amplitude completa" que o
            // treino exige.
            // KNEE_BENT_MAX / KNEE_DELTA_DOWN: pra considerar "dobrado"
            // basta uma dobra moderada, mas ela é medida DUAS vezes: pelo
            // ângulo absoluto e pela variação em relação ao ângulo que os
            // joelhos tinham em pé (KNEE_DELTA_DOWN). A variação é o que
            // salva a leitura quando a pessoa está de frente pra câmera,
            // onde o ângulo absoluto projetado em 2D fica sempre alto.
            const KNEE_STRAIGHT = 158;
            const KNEE_BENT_MAX = 168;
            const KNEE_DELTA_DOWN = 14;
            const KNEE_DELTA_UP = 7;

            const kneeDrop =
              standingKneeAngle !== null ? standingKneeAngle - kneeAngleAvg : 0;

            const bothStanding =
              leftKneeAngle > KNEE_STRAIGHT &&
              rightKneeAngle > KNEE_STRAIGHT &&
              (standingKneeAngle === null || kneeDrop <= KNEE_DELTA_UP);

            const bothBent =
              leftKneeAngle < KNEE_BENT_MAX &&
              rightKneeAngle < KNEE_BENT_MAX &&
              standingKneeAngle !== null &&
              kneeDrop >= KNEE_DELTA_DOWN;

            // PROFUNDIDADE DO AGACHAMENTO
            //
            // Contar agachamento só pelo ângulo do joelho não funciona bem
            // com a pessoa de FRENTE pra câmera: a dobra do joelho acontece
            // em profundidade (o eixo que a câmera achata), então o ângulo
            // projetado em 2D quase não muda mesmo num agachamento completo.
            //
            // O que a câmera SEMPRE enxerga bem é o movimento vertical, que
            // está no plano da imagem. Então medimos o quanto o CORPO INTEIRO
            // desceu: "depth" (quadril) e "shoulderDepth" (ombro) são a
            // fração de altura perdida em relação à posição em pé (0 = em
            // pé, ~0.2 = meio agachamento, 0.35+ = agachamento completo).
            // Exigir os dois juntos significa que o corpo todo desceu — não
            // dá pra validar a repetição só dobrando/esticando o joelho com o
            // corpo parado na mesma altura.
            const hipHeight = heightInTorsos(hipMid, shoulderMid, hipMid, ankleMid);
            const shoulderHeight = heightInTorsos(shoulderMid, shoulderMid, hipMid, ankleMid);
            const depth =
              hipHeight !== null && standingHipHeight
                ? 1 - hipHeight / standingHipHeight
                : 0;
            const shoulderDepth =
              shoulderHeight !== null && standingShoulderHeight
                ? 1 - shoulderHeight / standingShoulderHeight
                : 0;

            if (!isWorkoutActive) {
              // Antes do treino começar ainda não existe referência de "em
              // pé", então aqui o critério de joelho esticado é só o ângulo
              // absoluto (o delta só passa a valer depois da calibração).
              const kneesExtended =
                leftKneeAngle > KNEE_STRAIGHT && rightKneeAngle > KNEE_STRAIGHT;

              if (!kneesExtended || !isTorsoUpright) {
                drawSkeleton(kp, '#ff0055');
                resetCountdown();
                sendStatus('Fique em pé, ereto, com as duas pernas visíveis, para começar');
                return;
              }

              // Chegou aqui = está de pé e ereto. Esse é o momento certo de
              // calibrar as referências de altura e de joelho esticado.
              if (hipHeight !== null) {
                standingHipHeight = hipHeight;
              }
              if (shoulderHeight !== null) {
                standingShoulderHeight = shoulderHeight;
              }
              standingKneeAngle = kneeAngleAvg;
            }

            const skeletonColor = isExiting ? '#ff0055' : (isWorkoutActive ? '#00ff88' : '#00e5ff');
            drawSkeleton(kp, skeletonColor);

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

                  sendToRN('READY', {});
                }
              }, 1000);
              return;
            }

            if (isCountingDown) return;

            if (isWorkoutActive && !isExiting) {
              let stateChanged = false;

              const DEPTH_DOWN = 0.15;
              const DEPTH_UP = 0.07;
              // O ombro desce um pouco menos que o quadril (o tronco se
              // inclina pra frente na descida), por isso o limiar dele é
              // proporcionalmente menor.
              const SHOULDER_DEPTH_DOWN = DEPTH_DOWN * 0.6;

              // DESCEU = o CORPO INTEIRO baixou (quadril E ombro) E os dois
              // joelhos dobraram. É um E, não um OU: os dois sinais juntos
              // são o que impede validar a repetição só dobrando e
              // esticando o joelho com o corpo parado na mesma altura
              // (quadril/ombro sem descer), ou só afundando o corpo sem
              // flexionar as pernas.
              const bodyWentDown =
                depth >= DEPTH_DOWN && shoulderDepth >= SHOULDER_DEPTH_DOWN;
              const isDown = bodyWentDown && bothBent;

              // SUBIU = o corpo voltou pra altura de pé E os dois joelhos
              // estão esticados de novo (amplitude completa). A faixa morta
              // entre DEPTH_UP e DEPTH_DOWN (histerese) evita contar várias
              // repetições com um tremor em cima do limiar.
              const isUp =
                depth <= DEPTH_UP &&
                shoulderDepth <= DEPTH_UP + 0.05 &&
                bothStanding;

              if (isDown && stage !== 'down') {
                stage = 'down';
                stateChanged = true;
              }

              // Feedback de "quase lá": ajuda a pessoa a entender por que a
              // repetição não contou quando só um dos dois sinais apareceu.
              if (stage !== 'down') {
                if (bothBent && !bodyWentDown) {
                  sendStatus('Desça o corpo todo, não só dobre os joelhos');
                } else if (bodyWentDown && !bothBent) {
                  sendStatus('Dobre mais os joelhos ao descer');
                }
              }

              if (isUp && stage === 'down') {
                if (isTorsoUpright) {
                  stage = 'up';
                  count++;
                  stateChanged = true;
                } else {
                  sendStatus('Mantenha o tronco mais ereto');
                }
              }

              // No topo, reajusta devagar as referências de "em pé". Cobre a
              // pessoa mudando de lugar no meio do treino sem estragar a
              // contagem — e é lento o bastante (5% por frame) pra não
              // acompanhar a descida de uma repetição.
              if (stage === 'up' && depth < 0.05 && shoulderDepth < 0.05) {
                if (hipHeight !== null && standingHipHeight) {
                  standingHipHeight = standingHipHeight * 0.95 + hipHeight * 0.05;
                }
                if (shoulderHeight !== null && standingShoulderHeight) {
                  standingShoulderHeight = standingShoulderHeight * 0.95 + shoulderHeight * 0.05;
                }
                if (standingKneeAngle !== null && kneeAngleAvg > KNEE_STRAIGHT) {
                  standingKneeAngle = standingKneeAngle * 0.95 + kneeAngleAvg * 0.05;
                }
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
          onPermissionRequest={(request: any) => {
            request.grant(request.resources);
          }}
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
            <Text style={styles.exitSubtitle}>Finalizando treino em</Text>
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
            <Text style={styles.countdownText}>{countdown}</Text>
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
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', gap: 12 },
  backButtonInline: { marginTop: 8 },
  grayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.50)',
  },
  redOverlay: {
    ...StyleSheet.absoluteFillObject,
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
    ...StyleSheet.absoluteFillObject,
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
