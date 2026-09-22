// screens/SitupWorkoutScreen.tsx
// Tela de treino de abdominais — MediaPipe Pose rodando via WebView.
// Reestruturada para seguir a mesma arquitetura da tela de flexão
// (PushupWorkoutScreen): detecção por ângulo de articulação (em vez de
// razão de distância nariz-joelho), validação de forma durante a repetição,
// parada explícita da câmera, cronômetro, XP/calorias e modal de resumo.

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

type Props = NativeStackScreenProps<RootStackParamList, 'Situp'>;

// XP e calorias por repetição — mesma convenção de constantes nomeadas
// usada na tela de agachamento (valores são estimativas).
const XP_PER_REP = 0.5;
const CALORIES_PER_REP = 0.3;

const SITUP_TUTORIAL_STORAGE_KEY = '@pushup_counter/situp_tutorial_hidden';

const round1 = (n: number) => Math.round(n * 10) / 10;

export default function SitupWorkoutScreen({ navigation }: Props) {
  const { addXp } = useProfile();

  // Esta tela é a MESMA dentro e fora do Desafio Diário — ver
  // hooks/useChallengeRunner.ts e a nota equivalente na tela de flexão.
  const challenge = useChallengeRunner('situp');

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

  // Estados para o cancelamento/finalização por saída de posição
  const [exitCountdown, setExitCountdown] = useState<number | null>(null);
  const [isPositionLost, setIsPositionLost] = useState(false);

  // Modal do fim de treino (resumo)
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  const tutorial = useWorkoutTutorial(SITUP_TUTORIAL_STORAGE_KEY);
  const [showExitModal, setShowExitModal] = useState(false);

  // O abdominal, assim como a flexão, só conta com o celular apoiado na
  // horizontal (paisagem), filmando a pessoa deitada de lado — não em pé
  // segurando o aparelho. Mesma detecção via acelerômetro usada na
  // PushupWorkoutScreen (eixo x dominante sobre o eixo y), porque a UI do
  // app fica travada em portrait mesmo com o aparelho físico deitado.
  const [isLandscape, setIsLandscape] = useState(false);
  const isLandscapeRef = useRef(false);

  useEffect(() => {
    isLandscapeRef.current = isLandscape;
  }, [isLandscape]);

  useEffect(() => {
    let smoothedX = 0;
    let smoothedY = 0;

    Accelerometer.requestPermissionsAsync().catch(() => { });
    Accelerometer.setUpdateInterval(200);

    const subscription = Accelerometer.addListener(({ x, y }) => {
      smoothedX = smoothedX * 0.7 + x * 0.3;
      smoothedY = smoothedY * 0.7 + y * 0.3;

      const landscape = Math.abs(smoothedX) > Math.abs(smoothedY) && Math.abs(smoothedX) > 0.4;
      setIsLandscape((prev) => (prev !== landscape ? landscape : prev));
    });

    return () => subscription.remove();
  }, []);

  // Propaga o estado de orientação pra dentro da WebView sempre que ele
  // mudar — a lógica de pose (MediaPipe) roda lá dentro, então é lá que a
  // contagem precisa ser pausada/retomada.
  useEffect(() => {
    webViewRef.current?.injectJavaScript(`
      (function() {
        if (window.__setOrientationOk) { window.__setOrientationOk(${isLandscape}); }
      })();
      true;
    `);
  }, [isLandscape]);

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

  // Timer para contar a duração do treino ativo
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

  // Para o stream de câmera de dentro da WebView explicitamente — mesmo
  // bug/mesma correção documentada na PushupWorkoutScreen. Sem isso, o
  // Android pode não liberar o hardware da câmera a tempo e a próxima
  // tela abre com a câmera preta.
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
          data.stage === 'up'
            ? 'Boa subida! Agora deite por completo'
            : data.stage === 'down'
              ? 'Repetição contabilizada!'
              : 'Mantenha o ritmo'
        );

        // Meta da etapa batida: encerra aqui e segue pro descanso.
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
        // Quando o timer zera ("STOP"), encerra o treino e abre o modal de resumo
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
        let stage = 'down';

        let countdownTimer = null;
        let countdownValue = 3;
        let isCountingDown = false;
        let isWorkoutActive = false;

        // Timer de desistência / saída da posição
        let exitTimer = null;
        let exitValue = 3;
        let isExiting = false;

        // --- Limiares da repetição -------------------------------------
        // O sinal usado pra contar o abdominal é o ângulo do TRONCO
        // (quadril -> ombro) em relação à horizontal do mundo real:
        // deitado no chão fica perto de 0°, sentado sobe pra 60°-80°.
        //
        // Isso substitui o ângulo do quadril (ombro-quadril-joelho) que a
        // versão anterior usava: com os joelhos dobrados, esse ângulo fica
        // em torno de 120°-130° já com a pessoa deitada, então a condição
        // de "deitou de novo" (> 140°) praticamente nunca acontecia e a
        // repetição não fechava. O ângulo do tronco não depende de onde a
        // coxa está, só de quanto a pessoa realmente subiu.
        const UP_TORSO_ANGLE = 45;   // subiu: tronco a 45°+ do chão
        const DOWN_TORSO_ANGLE = 22; // deitou: tronco quase no chão de novo

        // Joelho dobrado = pés apoiados. Valor generoso porque, visto de
        // lado, a perna de trás pode aparecer parcialmente esticada.
        const MAX_KNEE_ANGLE = 150;

        // A linha quadril->tornozelo precisa estar perto da horizontal:
        // é isso que garante que a pessoa está no chão e não em pé
        // balançando o tronco (em pé, essa linha fica quase vertical).
        const MAX_LEG_ANGLE = 45;

        // Deslocamento mínimo do ombro entre o topo e a volta ao chão,
        // em relação ao tamanho do tronco no frame — mesma ideia
        // anti-cheat da flexão: impede que tremor de landmark ou um
        // balanço de cabeça fechem uma repetição.
        const MIN_SHOULDER_MOVE_RATIO = 0.25;

        // Quantos frames ruins seguidos toleramos antes de acusar saída de
        // posição. O abdominal move o corpo inteiro, então é normal o
        // MediaPipe perder um landmark isolado no meio da subida; sem essa
        // folga o treino terminava sozinho no meio de uma repetição boa.
        const BAD_FRAME_TOLERANCE = 6;
        let badFrames = 0;

        // Posição do ombro (e escala do tronco) no instante em que a fase
        // "up" começou — referência pro deslocamento mínimo acima.
        let upShoulderPos = null;
        let upTorsoScale = null;

        // Só conta abdominal com o celular apoiado na horizontal (paisagem),
        // filmando a pessoa de lado — mesma checagem da PushupWorkoutScreen.
        // O React Native detecta isso via acelerômetro e injeta o valor aqui.
        let orientationOk = false;

        window.__setOrientationOk = function(ok) {
          const wasOk = orientationOk;
          orientationOk = !!ok;
          if (!orientationOk && wasOk !== orientationOk) {
            resetCountdown();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            sendStatus('Apoie o celular na horizontal, de lado, para começar');
          }
        };

        function sendToRN(type, payload) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
          }
        }

        // Os avisos de forma sao avaliados a cada frame; sem esse filtro
        // seriam dezenas de postMessage por segundo repetindo o MESMO texto,
        // e cada um vira um setFeedback -> re-render inteiro da tela no lado
        // React Native. Mesmo filtro que o agachamento ja usava.
        let lastStatusMessage = null;

        function sendStatus(message) {
          if (message === lastStatusMessage) return;
          lastStatusMessage = message;
          sendToRN('STATUS', { message });
        }

        // Qualquer outra mensagem (UPDATE, COUNTDOWN...) reescreve o texto de
        // feedback na RN, entao o filtro acima precisa esquecer o ultimo
        // status pra ele poder reaparecer.
        function invalidateStatus() {
          lastStatusMessage = null;
        }

        function calculateAngle(A, B, C) {
          const radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
          let angle = Math.abs((radians * 180.0) / Math.PI);
          if (angle > 180.0) angle = 360 - angle;
          return angle;
        }

        function distance(A, B) {
          return Math.hypot(B.x - A.x, B.y - A.y);
        }

        // Descobre qual eixo do FRAME BRUTO da câmera corresponde à
        // horizontal do mundo real — mesma lógica da PushupWorkoutScreen
        // (ver comentário lá): o sensor da câmera muitas vezes entrega o
        // frame no formato nativo dele (retrato) mesmo com o aparelho
        // fisicamente deitado de lado.
        function isRawFrameLandscape() {
          const w = videoElement.videoWidth || 0;
          const h = videoElement.videoHeight || 0;
          return w >= h;
        }

        // Ângulo do segmento A-B em relação à HORIZONTAL REAL (0° =
        // deitado, 90° = em pé), já considerando qual eixo do frame
        // representa essa horizontal (ver isRawFrameLandscape). É a base
        // da contagem: aplicado em quadril->ombro mede o quanto o tronco
        // subiu; aplicado em quadril->tornozelo diz se a pessoa está
        // mesmo no chão.
        function angleFromHorizontal(A, B, frameIsLandscape) {
          const dx = B.x - A.x;
          const dy = B.y - A.y;
          // Frame já vem "deitado" (largo): X real = X do vídeo.
          // Frame vem "em pé" (alto): X real = Y do vídeo (eixos trocados).
          const radians = frameIsLandscape ? Math.atan2(dy, dx) : Math.atan2(dx, dy);
          let angle = Math.abs((radians * 180.0) / Math.PI);
          if (angle > 90) angle = 180 - angle;
          return angle;
        }

        // Deslocamento total do ponto A pro B normalizado pela escala do
        // tronco — funciona com a pessoa perto ou longe da câmera. Aqui
        // usamos a distância cheia (não só o eixo vertical, como na
        // flexão): no abdominal o ombro descreve um arco em torno do
        // quadril, então ele se move nos dois eixos e medir só um deles
        // subestima o movimento dependendo do ângulo da câmera.
        function moveRatio(fromPoint, toPoint, torsoScale) {
          if (!fromPoint || !torsoScale) return Infinity;
          return distance(fromPoint, toPoint) / torsoScale;
        }

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

        function drawSkeleton(nose, shoulder, hip, knee, ankle, color = '#00e5ff') {
          syncCanvasSize();
          canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

          const w = canvasElement.width;
          const h = canvasElement.height;

          const lines = [
            [nose, shoulder],
            [shoulder, hip],
            [hip, knee],
            [knee, ankle]
          ];

          canvasCtx.lineWidth = 6;
          canvasCtx.strokeStyle = color;
          canvasCtx.lineCap = 'round';

          lines.forEach(([p1, p2]) => {
            if (p1 && p2) {
              canvasCtx.beginPath();
              canvasCtx.moveTo(p1.x * w, p1.y * h);
              canvasCtx.lineTo(p2.x * w, p2.y * h);
              canvasCtx.stroke();
            }
          });

          const points = [nose, shoulder, hip, knee, ankle];
          points.forEach((p) => {
            if (p) {
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

        // Um frame ruim sozinho não significa que a pessoa saiu da
        // posição — no meio do abdominal o MediaPipe perde landmark com
        // frequência. O STOP só dispara depois de BAD_FRAME_TOLERANCE
        // frames ruins seguidos.
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
        // que o treino terminar. Para o loop do MediaPipe Camera e solta
        // explicitamente as tracks do getUserMedia — mesma correção usada
        // na tela de flexão, evita a câmera preta na próxima tela.
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
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              if (!isWorkoutActive) resetCountdown();
              return;
            }

            if (!results.poseLandmarks) {
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              if (!isWorkoutActive) resetCountdown();
              if (isWorkoutActive) registerBadFrame();
              return;
            }

            const kp = results.poseLandmarks;

            const leftVis = (kp[11]?.visibility || 0) + (kp[23]?.visibility || 0) + (kp[25]?.visibility || 0) + (kp[27]?.visibility || 0);
            const rightVis = (kp[12]?.visibility || 0) + (kp[24]?.visibility || 0) + (kp[26]?.visibility || 0) + (kp[28]?.visibility || 0);
            const isLeft = leftVis >= rightVis;

            const nose = kp[0];
            const shoulder = isLeft ? kp[11] : kp[12];
            const hip = isLeft ? kp[23] : kp[24];
            const knee = isLeft ? kp[25] : kp[26];
            const ankle = isLeft ? kp[27] : kp[28];

            // Só ombro, quadril, joelho e tornozelo são obrigatórios: são
            // os pontos que entram na conta. O nariz só serve pro desenho
            // do esqueleto e, no fundo do movimento, a cabeça costuma sair
            // de quadro ou virar — exigi-lo (como antes) fazia o treino
            // acusar "saiu da posição" durante uma repetição correta.
            const minVis = 0.35;
            const hasAllPoints =
              shoulder && shoulder.visibility > minVis &&
              hip && hip.visibility > minVis &&
              knee && knee.visibility > minVis &&
              ankle && ankle.visibility > minVis;

            if (!hasAllPoints) {
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              if (isWorkoutActive) {
                registerBadFrame();
              } else {
                resetCountdown();
                sendStatus('Deite de lado, visível para a câmera');
              }
              return;
            }

            const frameIsLandscape = isRawFrameLandscape();

            // Sinal da repetição: quanto o tronco subiu do chão.
            const torsoAngle = angleFromHorizontal(hip, shoulder, frameIsLandscape);

            // Forma: joelhos dobrados (pés apoiados) e pernas deitadas no
            // chão. A segunda checagem é o que impede "fazer abdominal"
            // em pé ou sentado numa cadeira só flexionando o tronco.
            const kneeAngle = calculateAngle(hip, knee, ankle);
            const legAngle = angleFromHorizontal(hip, ankle, frameIsLandscape);
            const isKneeBent = kneeAngle < MAX_KNEE_ANGLE;
            const isOnFloor = legAngle <= MAX_LEG_ANGLE;
            const isFormValid = isKneeBent && isOnFloor;

            // Com o treino rodando, perder a forma dispara o STOP — mas só
            // depois de BAD_FRAME_TOLERANCE frames seguidos ruins.
            if (isWorkoutActive) {
              if (isFormValid) {
                badFrames = 0;
                cancelExitCountdown();
              } else {
                registerBadFrame();
              }
            }

            // Pré-treino: a contagem regressiva só começa com a pessoa
            // deitada, na forma certa — assim o treino sempre parte da
            // posição "down" e a primeira repetição fecha normalmente.
            if (!isWorkoutActive) {
              if (!isOnFloor) {
                drawSkeleton(nose, shoulder, hip, knee, ankle, '#ff0055');
                resetCountdown();
                sendStatus('Deite no chão, de lado para a câmera');
                return;
              }
              if (!isKneeBent) {
                drawSkeleton(nose, shoulder, hip, knee, ankle, '#ff0055');
                resetCountdown();
                sendStatus('Dobre os joelhos para começar');
                return;
              }
              if (torsoAngle > DOWN_TORSO_ANGLE) {
                drawSkeleton(nose, shoulder, hip, knee, ankle, '#ff0055');
                resetCountdown();
                sendStatus('Deite o tronco por completo para começar');
                return;
              }
            }

            const skeletonColor = isExiting ? '#ff0055' : (isWorkoutActive ? '#00ff88' : '#00e5ff');
            drawSkeleton(nose, shoulder, hip, knee, ankle, skeletonColor);

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
                  stage = 'down';
                  badFrames = 0;
                  upShoulderPos = null;
                  upTorsoScale = null;

                  sendToRN('READY', {});
                }
              }, 1000);
              return;
            }

            if (isCountingDown) return;

            if (isWorkoutActive && !isExiting && isFormValid) {
              let stateChanged = false;

              // Subiu: tronco passou de UP_TORSO_ANGLE do chão. Guarda a
              // posição do ombro e o tamanho do tronco nesse instante —
              // referência do anti-cheat na volta.
              if (stage !== 'up' && torsoAngle >= UP_TORSO_ANGLE) {
                stage = 'up';
                stateChanged = true;
                upShoulderPos = { x: shoulder.x, y: shoulder.y };
                upTorsoScale = distance(shoulder, hip);
              }

              // Deitou de novo: fecha a repetição. Só conta se o ombro
              // realmente percorreu o arco esperado desde o topo — um
              // tronco que "some" e reaparece por ruído de landmark não
              // produz esse deslocamento.
              if (stage === 'up' && torsoAngle <= DOWN_TORSO_ANGLE) {
                if (moveRatio(upShoulderPos, shoulder, upTorsoScale) >= MIN_SHOULDER_MOVE_RATIO) {
                  stage = 'down';
                  count++;
                  stateChanged = true;
                } else {
                  sendStatus('Suba o tronco por completo, não só a cabeça');
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
            sendStatus('Posicione-se para os abdominais');
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
                if (window.__setOrientationOk) { window.__setOrientationOk(${isLandscapeRef.current}); }
              })();
              true;
            `);
          }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Overlay Escuro Pré-Treino */}
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
          <Text style={styles.exitTitle}>SAÍU DA POSIÇÃO!</Text>
          <Text style={styles.exitSubtitle}>
              {challenge.isActive ? 'Perdendo o desafio em' : 'Finalizando treino em'}
            </Text>
          <Text style={styles.exitCountdownText}>{exitCountdown}</Text>
          <Text style={styles.stopText}>STOP</Text>
        </View>
      </Modal>

      <Modal
        visible={countdown !== null && !isPositionLost && !showSummaryModal}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.countdownContainer} pointerEvents="none">
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      </Modal>

      {/* Botão de Sair Estilizado (Porta Vermelha) */}
      {!showSummaryModal && (
        <Pressable style={styles.doorBackButton} onPress={() => setShowExitModal(true)}>
          <MaterialCommunityIcons name="door-open" size={26} color="#ff3b30" />
        </Pressable>
      )}

      {!showSummaryModal && (
        <>
          <View style={styles.overlay} pointerEvents="none">
            {challenge.isActive && (
              <ChallengeStepBanner
                stepNumber={challenge.stepNumber}
                totalSteps={challenge.totalSteps}
                remaining={remainingReps}
              />
            )}

            <Text style={styles.count}>
              {displayCount}
              {challenge.isActive && (
                <Text style={styles.countGoal}> / {challenge.targetReps}</Text>
              )}
            </Text>
            <Text style={styles.label}>ABDOMINAIS VÁLIDOS</Text>
            <Text style={styles.feedback}>{feedback}</Text>
          </View>

          <View
            pointerEvents="none"
            style={[
              styles.badge,
              {
                backgroundColor: isPositionLost
                  ? '#ff0055'
                  : stage === 'up'
                    ? '#00ff88'
                    : stage === 'down'
                      ? '#ff0055'
                      : '#6c757d',
              },
            ]}
          >
            <Text style={styles.badgeText}>
              {isPositionLost
                ? 'FORA DA POSIÇÃO'
                : stage === 'up'
                  ? 'NO TOPO (AGORA DEITE)'
                  : stage === 'down'
                    ? 'DEITADO (SUBA)'
                    : 'POSICIONE-SE'}
            </Text>
          </View>
        </>
      )}

      {/* Modal Futurista de Resumo do Treino (FIM) — mesmo estilo da flexão/agachamento */}
      <Modal visible={showSummaryModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.summaryCard}>
            {/* Quinas Azuis Neon */}
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
                <Text style={styles.statLabel}>Total de Abdominais: </Text>
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

      <WorkoutTutorialModal
        visible={tutorial.visible}
        orientation="horizontal"
        onDismiss={tutorial.dismiss}
      />

      <ExitWorkoutModal
        visible={showExitModal}
        reps={count}
        repsLabel="ABDOMINAIS"
        elapsedLabel={formatTime(durationSeconds)}
        onCancel={() => setShowExitModal(false)}
        onConfirm={handleConfirmExit}
        isChallenge={challenge.isActive}
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
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
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

  /* Estilos do Modal Futurista */
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

  /* Quinas Azuis Neon */
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
