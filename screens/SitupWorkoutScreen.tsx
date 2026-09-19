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
          data.stage === 'up'
            ? 'Excelente subida! Agora deite'
            : data.stage === 'down'
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
        // Quando o timer zera ("STOP"), encerra o treino e abre o modal de resumo
        stopCamera();
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
    setIsWorkoutActive(false);
    setShowSummaryModal(true);
  };

  const handleFinishAndNavigate = () => {
    setShowSummaryModal(false);
    addXp(xpEarned);
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

        // Posição do ombro (e escala do tronco) no momento em que a fase
        // "up" (crunch completo) começou — usado pra exigir um deslocamento
        // mínimo real do ombro até a fase "down" (ver checagem de
        // micro-movimento mais abaixo), mesma lógica anti-cheat da flexão:
        // sem isso, um balanço pequeno de cabeça/ombro já contava como
        // abdominal completo.
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

        // Deslocamento do ponto A pro B, medido só ao longo do eixo
        // VERTICAL real (perpendicular à horizontal do mundo, ver
        // isRawFrameLandscape) — normalizado pela escala do tronco, então
        // funciona tanto com a pessoa perto quanto longe da câmera.
        function verticalMoveRatio(fromPoint, toPoint, torsoScale, frameIsLandscape) {
          if (!fromPoint || !torsoScale) return Infinity;
          const raw = frameIsLandscape
            ? Math.abs(toPoint.y - fromPoint.y)
            : Math.abs(toPoint.x - fromPoint.x);
          return raw / torsoScale;
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
              if (isWorkoutActive) startExitCountdown();
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

            // Exige nariz, ombro, quadril, joelho E tornozelo visíveis —
            // antes o tornozelo era usado pro desenho do esqueleto mas não
            // entrava nessa checagem, o que podia deixar passar poses com
            // o pé fora de quadro.
            const minVis = 0.35;
            const hasAllPoints =
              nose && nose.visibility > minVis &&
              shoulder && shoulder.visibility > minVis &&
              hip && hip.visibility > minVis &&
              knee && knee.visibility > minVis &&
              ankle && ankle.visibility > minVis;

            if (isWorkoutActive && !hasAllPoints) {
              startExitCountdown();
            } else if (isWorkoutActive && hasAllPoints) {
              cancelExitCountdown();
            }

            if (!isWorkoutActive && !hasAllPoints) {
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              resetCountdown();
              sendStatus('Fique de lado visível para a câmera');
              return;
            }

            // Ângulo do joelho (quadril-joelho-tornozelo): precisa estar
            // dobrado pra ser uma posição válida de abdominal (pés no chão).
            // Ângulo do quadril (ombro-quadril-joelho): mede o quanto o
            // tronco está flexionado em relação à coxa — é o que
            // efetivamente conta a repetição, do mesmo jeito que o ângulo
            // do cotovelo conta a flexão de braço na tela de flexão.
            const frameIsLandscape = isRawFrameLandscape();

            const kneeAngle = calculateAngle(hip, knee, ankle);
            const hipAngle = calculateAngle(shoulder, hip, knee);
            const isKneeBent = kneeAngle < 140;

            if (!isWorkoutActive) {
              if (!isKneeBent) {
                drawSkeleton(nose, shoulder, hip, knee, ankle, '#ff0055');
                resetCountdown();
                sendStatus('Dobre os joelhos para começar');
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

                  sendToRN('READY', {});
                }
              }, 1000);
              return;
            }

            if (isCountingDown) return;

            if (isWorkoutActive && shoulder && hip && !isExiting) {
              let stateChanged = false;

              // Subida: tronco bem flexionado sobre a coxa (crunch completo).
              // Guarda a posição do ombro e a escala do tronco nesse
              // instante — é a referência que vamos comparar lá na frente
              // pra confirmar que o tronco realmente se moveu ao deitar de
              // novo, não só balançou a cabeça/ombro (mesma lógica
              // anti-cheat do deslocamento de ombro na tela de flexão).
              if (hipAngle < 90 && stage !== 'up') {
                stage = 'up';
                stateChanged = true;
                upShoulderPos = { x: shoulder.x, y: shoulder.y };
                upTorsoScale = distance(shoulder, hip);
              }

              // Descida: tronco de volta ao chão, joelhos ainda dobrados —
              // só conta a repetição se: (1) a forma do joelho continuar
              // válida, e (2) o ombro realmente se deslocou uma quantidade
              // mínima desde o topo do crunch (escala relativa ao tamanho
              // do tronco no frame). O item 2 impede contar abdominal
              // "balançando" só o pescoço/ombro sem deitar de verdade.
              const MIN_SHOULDER_MOVE_RATIO = 0.12;
              const shoulderMoved =
                verticalMoveRatio(upShoulderPos, shoulder, upTorsoScale, frameIsLandscape) >=
                MIN_SHOULDER_MOVE_RATIO;

              if (hipAngle > 140 && stage === 'up' && isKneeBent) {
                if (shoulderMoved) {
                  stage = 'down';
                  count++;
                  stateChanged = true;
                } else {
                  sendStatus('Deite o tronco por completo, não só balance o ombro');
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
          <Text style={styles.exitSubtitle}>Finalizando treino em</Text>
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
            <Text style={styles.count}>{count}</Text>
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
                  ? 'MUITO BEM! (NO JOELHO)'
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
