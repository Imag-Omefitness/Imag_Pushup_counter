// screens/PushupWorkoutScreen.tsx
// Tela de treino de flexões — MediaPipe Pose rodando via WebView com Design Futurista + Cronômetro e Filtros.

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

type Props = NativeStackScreenProps<RootStackParamList, 'Pushup'>;

const PUSHUP_TUTORIAL_STORAGE_KEY = '@pushup_counter/pushup_tutorial_hidden';

export default function PushupWorkoutScreen({ navigation }: Props) {
  const { addXp } = useProfile();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);
  const [stage, setStage] = useState<Stage>('unknown');
  const [feedback, setFeedback] = useState('Solicitando permissão...');
  const [countdown, setCountdown] = useState<number | string | null>(null);
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);

  const webViewRef = useRef<WebView>(null);

  // Controle de Tempo Decorrido (em segundos)
  const [durationSeconds, setDurationSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Estados para o cancelamento/finalização por saída de prancha
  const [exitCountdown, setExitCountdown] = useState<number | null>(null);
  const [isPlankLost, setIsPlankLost] = useState(false);

  // Modal do Fim de Treino (Resumo)
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  const tutorial = useWorkoutTutorial(PUSHUP_TUTORIAL_STORAGE_KEY);
  const [showExitModal, setShowExitModal] = useState(false);

  // O treino de flexão só conta se o celular estiver apoiado na horizontal
  // (paisagem), filmando a pessoa de lado a uma certa distância — não
  // segurado na mão em pé. Detectado via acelerômetro (eixo x dominante
  // sobre o eixo y) em vez de orientação de tela, porque a UI do app fica
  // travada em portrait mesmo com o aparelho físico deitado de lado.
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
    if (isWorkoutActive && !isPlankLost) {
      timerRef.current = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isWorkoutActive, isPlankLost]);

  // Para o stream de câmera de dentro da WebView explicitamente. Sem isso,
  // o <video>/getUserMedia continua ativo em segundo plano enquanto o modal
  // de resumo fica aberto (às vezes por bastante tempo), e o Android não
  // libera o hardware da câmera a tempo — daí a tela preta ao abrir o
  // próximo treino. Chamamos isso assim que o treino termina, não só
  // quando o usuário sai da tela.
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

  // Garantia extra: se o componente desmontar por qualquer outro caminho
  // (ex: botão de voltar do Android), tenta parar a câmera mesmo assim.
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
            ? 'Ótima descida! Agora empurre'
            : data.stage === 'up'
              ? 'Subida contabilizada!'
              : 'Mantenha o ritmo'
        );
      } else if (data.type === 'STATUS') {
        setFeedback(data.message);
      } else if (data.type === 'PLANK_LOST_TICK') {
        setIsPlankLost(true);
        setExitCountdown(data.value);
      } else if (data.type === 'WORKOUT_FINISHED') {
        // Quando o timer zera ("STOP"), encerra o treino e abre o modal de resumo
        stopCamera();
        setIsPlankLost(false);
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
    addXp(count);
    navigation.navigate('Home');
  };

  const calories = (count * 0.35).toFixed(1);

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
        let stage = 'up';

        let countdownTimer = null;
        let countdownValue = 3;
        let isCountingDown = false;
        let isWorkoutActive = false;

        // Timer de desistência / saída da prancha
        let exitTimer = null;
        let exitValue = 3;
        let isExiting = false;

        // Posição do ombro (e escala do tronco) no momento em que a fase
        // "down" começou — usado pra exigir um deslocamento mínimo real do
        // ombro até a fase "up" (ver checagem de micro-movimento mais
        // abaixo). Sem isso, balançar só o antebraço com o tronco parado
        // ainda contava, mesmo já deitado corretamente.
        let downShoulderPos = null;
        let downTorsoScale = null;

        // Só conta flexão com o celular apoiado na horizontal (paisagem),
        // filmando a pessoa de lado. O React Native detecta isso via
        // acelerômetro (a UI do app fica travada em portrait, então não dá
        // pra usar orientação de tela) e injeta o valor aqui.
        let orientationOk = false;

        window.__setOrientationOk = function(ok) {
          const wasOk = orientationOk;
          orientationOk = !!ok;
          if (!orientationOk && wasOk !== orientationOk) {
            resetCountdown();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            sendToRN('STATUS', { message: 'Apoie o celular na horizontal, de lado, para começar' });
          }
        };

        function sendToRN(type, payload) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
          }
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
        // horizontal do mundo real. Isso não é sempre o eixo X: o celular
        // fica deitado de lado (paisagem) durante a flexão, mas o sensor
        // da câmera muitas vezes entrega o frame no formato nativo dele —
        // que costuma ser retrato (mais alto que largo) — mesmo com o
        // aparelho fisicamente girado. Nesse caso, o que é horizontal no
        // mundo real aparece alinhado com o eixo Y do vídeo, não o X.
        // Detectamos isso comparando videoWidth x videoHeight do frame
        // bruto (não o tamanho do canvas na tela, que já pode estar
        // esticado pelo CSS) a cada frame, então funciona nos dois casos
        // sem precisar supor qual é o comportamento do aparelho.
        function isRawFrameLandscape() {
          const w = videoElement.videoWidth || 0;
          const h = videoElement.videoHeight || 0;
          return w >= h;
        }

        // Ângulo do segmento A-B em relação à HORIZONTAL REAL (0° =
        // deitado, 90° = em pé) — já considerando qual eixo do frame
        // representa essa horizontal (ver isRawFrameLandscape). Isso é
        // diferente de "colinearidade": uma pessoa em pé, esticada, também
        // tem ombro-quadril-tornozelo quase alinhados (colineares) — só
        // que na vertical. Sem essa checagem, dava pra "roubar" a flexão
        // ficando em pé e só balançando o braço, já que só o ângulo do
        // cotovelo era conferido depois do início do treino.
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

        // Deslocamento do ponto A pro B, medido só ao longo do eixo
        // VERTICAL real (perpendicular ao eixo horizontal acima) —
        // normalizado pela escala do tronco, então funciona tanto com a
        // pessoa perto quanto longe da câmera.
        function verticalMoveRatio(fromPoint, toPoint, torsoScale, frameIsLandscape) {
          if (!fromPoint || !torsoScale) return Infinity;
          const raw = frameIsLandscape
            ? Math.abs(toPoint.y - fromPoint.y)
            : Math.abs(toPoint.x - fromPoint.x);
          return raw / torsoScale;
        }

        function drawSkeleton(shoulder, elbow, wrist, hip, knee, ankle, color = '#00e5ff') {
          canvasElement.width = videoElement.videoWidth || 640;
          canvasElement.height = videoElement.videoHeight || 480;
          canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

          const w = canvasElement.width;
          const h = canvasElement.height;

          const lines = [
            [shoulder, elbow], [elbow, wrist],
            [shoulder, hip],
            [hip, knee], [knee, ankle]
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

          const points = [shoulder, elbow, wrist, hip, knee, ankle];
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
          sendToRN('PLANK_LOST_TICK', { value: exitValue });

          exitTimer = setInterval(() => {
            exitValue--;
            if (exitValue > 0) {
              sendToRN('PLANK_LOST_TICK', { value: exitValue });
            } else {
              clearInterval(exitTimer);
              sendToRN('WORKOUT_FINISHED', {});
            }
          }, 1000);
        }

        // Exposto para o lado React Native chamar via injectJavaScript assim
        // que o treino terminar. Para o loop do MediaPipe Camera E solta
        // explicitamente as tracks do getUserMedia — sem isso, o Android
        // pode continuar segurando o hardware da câmera depois que esta
        // WebView é desmontada, deixando a câmera preta na próxima tela.
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
            minDetectionConfidence: 0.70,
            minTrackingConfidence: 0.70
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

            const leftVis = (kp[11]?.visibility || 0) + (kp[13]?.visibility || 0) + (kp[23]?.visibility || 0);
            const rightVis = (kp[12]?.visibility || 0) + (kp[14]?.visibility || 0) + (kp[24]?.visibility || 0);
            const isLeft = leftVis >= rightVis;

            const shoulder = isLeft ? kp[11] : kp[12];
            const elbow = isLeft ? kp[13] : kp[14];
            const wrist = isLeft ? kp[15] : kp[16];
            const hip = isLeft ? kp[23] : kp[24];
            const knee = isLeft ? kp[25] : kp[26];
            const ankle = isLeft ? kp[27] : kp[28];

            const minVis = 0.35;
            const hasAllPoints =
              shoulder && shoulder.visibility > minVis &&
              elbow && elbow.visibility > minVis &&
              wrist && wrist.visibility > minVis &&
              hip && hip.visibility > minVis &&
              ankle && ankle.visibility > minVis;

            if (!isWorkoutActive && !hasAllPoints) {
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              resetCountdown();
              sendToRN('STATUS', { message: 'Fique visível para a câmera' });
              return;
            }

            const frameIsLandscape = isRawFrameLandscape();

            const bodyAngle = calculateAngle(shoulder, hip, ankle);
            const isValidBodyLine = bodyAngle >= 135;

            // Corpo tem que estar deitado (linha ombro-tornozelo perto da
            // horizontal REAL, não só da imagem), não só "reto" — em pé o
            // corpo também fica reto, só que na vertical.
            // HORIZONTAL_MAX_ANGLE é a tolerância: até esse desvio da
            // horizontal ainda conta como prancha válida (dá folga pra
            // variações naturais de câmera/ângulo do corpo sem exigir
            // perfeição).
            const HORIZONTAL_MAX_ANGLE = 35;
            const isHorizontal = angleFromHorizontal(shoulder, ankle, frameIsLandscape) <= HORIZONTAL_MAX_ANGLE;
            const isPlankValid = isValidBodyLine && isHorizontal;

            // Se o treino está ativo e o usuário sair da posição (some da
            // câmera OU perde a postura de prancha, por exemplo ficando em
            // pé), inicia o STOP. Antes só a visibilidade era conferida
            // aqui — a postura só valia pra iniciar o treino, então dava
            // pra ficar em pé "flexionando o braço" depois do início sem
            // nada travar isso.
            if (isWorkoutActive && (!hasAllPoints || wrist.visibility < minVis || !isPlankValid)) {
              startExitCountdown();
            }

            if (!isWorkoutActive) {
              if (!isValidBodyLine) {
                drawSkeleton(shoulder, elbow, wrist, hip, knee, ankle, '#ff0055');
                resetCountdown();
                sendToRN('STATUS', { message: 'Alinhe o corpo reto em prancha' });
                return;
              }
              if (!isHorizontal) {
                drawSkeleton(shoulder, elbow, wrist, hip, knee, ankle, '#ff0055');
                resetCountdown();
                sendToRN('STATUS', { message: 'Fique deitado, na horizontal, para começar' });
                return;
              }
            }

            // Regra do Joelho (Entre 80 e 135 desqualifica)
            const kneeAngle = calculateAngle(hip, knee, ankle);
            if (kneeAngle >= 0 && kneeAngle <= 135) {
              drawSkeleton(shoulder, elbow, wrist, hip, knee, ankle, '#ff0055');
              sendToRN('STATUS', { message: 'Atenção: Ângulo do joelho inválido!' });
              if (!isWorkoutActive) resetCountdown();
              return;
            }

            const skeletonColor = isExiting ? '#ff0055' : (isWorkoutActive ? '#00ff88' : '#00e5ff');
            drawSkeleton(shoulder, elbow, wrist, hip, knee, ankle, skeletonColor);

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

            if (isWorkoutActive && shoulder && elbow && wrist && hip && !isExiting) {
              const elbowAngle = calculateAngle(shoulder, elbow, wrist);

              let stateChanged = false;

              // Desceu: cotovelo dobrado (~90° ou menos). Guarda a posição
              // do ombro e a escala do tronco nesse instante — é a
              // referência que vamos comparar lá na frente pra confirmar
              // que o corpo realmente se moveu, não só o antebraço.
              if (elbowAngle < 100 && stage !== 'down') {
                stage = 'down';
                stateChanged = true;
                downShoulderPos = { x: shoulder.x, y: shoulder.y };
                downTorsoScale = distance(shoulder, hip);
              }

              // Subiu: braço quase totalmente estendido de novo — só conta
              // se: (1) o corpo continuar em posição de prancha válida
              // (reto E deitado na horizontal), e (2) o ombro realmente se
              // deslocou uma quantidade mínima desde a fase "down" (escala
              // relativa ao tamanho do tronco no frame). O item 2 é o que
              // impede balançar só o antebraço/cotovelo com o tronco
              // parado: numa flexão de verdade o tronco inteiro sobe e
              // desce, não só o braço.
              const MIN_SHOULDER_MOVE_RATIO = 0.08;
              const shoulderMoved =
                verticalMoveRatio(downShoulderPos, shoulder, downTorsoScale, frameIsLandscape) >=
                MIN_SHOULDER_MOVE_RATIO;

              if (elbowAngle > 155 && stage === 'down' && isPlankValid) {
                if (shoulderMoved) {
                  stage = 'up';
                  count++;
                  stateChanged = true;
                } else {
                  sendToRN('STATUS', { message: 'Desça o corpo inteiro, não só o braço' });
                }
              }

              if (stateChanged) {
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
            sendToRN('STATUS', { message: 'Posicione-se em prancha' });
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
                if (window.__setOrientationOk) { window.__setOrientationOk(${isLandscapeRef.current}); }
              })();
              true;
            `);
          }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Overlay Escuro Pré-Treino */}
      {!isWorkoutActive && !isPlankLost && !showSummaryModal && (
        <View style={styles.grayOverlay} pointerEvents="none" />
      )}

      {/* Overlay Vermelho ao Perder a Prancha — usa <Modal> (janela nativa
          própria) em vez de uma View irmã da WebView: a WebView renderiza
          numa camada nativa separada e pode ignorar o empilhamento normal
          (zIndex) das Views do React Native, fazendo overlays comuns
          ficarem escondidos atrás da câmera. */}
      <Modal
        visible={isPlankLost && !showSummaryModal}
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

      {/* Countdown do Início (3, 2, 1, GO!) — mesmo motivo do Modal acima.
          Escurece a câmera durante a contagem; ao chegar em "GO!" o
          countdown vira null pouco depois (ver handleMessage) e o Modal
          fecha, removendo o filtro escuro e voltando a câmera ao normal. */}
      <Modal
        visible={countdown !== null && !isPlankLost && !showSummaryModal}
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
            <Text style={styles.label}>FLEXÕES VÁLIDAS</Text>
            <Text style={styles.feedback}>{feedback}</Text>
          </View>

          <View
            pointerEvents="none"
            style={[
              styles.badge,
              {
                backgroundColor: isPlankLost
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
              {isPlankLost
                ? 'FORA DA POSIÇÃO'
                : stage === 'down'
                  ? 'ÓTIMA DESCIDA'
                  : stage === 'up'
                    ? 'NO TOPO'
                    : 'POSICIONE-SE'}
            </Text>
          </View>
        </>
      )}

      {/* Modal Futurista de Resumo do Treino (FIM) */}
      <Modal visible={showSummaryModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.summaryCard}>
            {/* Quinas Azuis Neon */}
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />

            <Text style={styles.summaryTitle}>FIM</Text>

            {/* Tempo Final em Branco formato 00:00 / 00:00:00 */}
            <Text style={styles.finalTimeText}>
              {formatTime(durationSeconds)}
            </Text>

            <View style={styles.summaryStatsContainer}>
              <Text style={styles.statLine}>
                <Text style={styles.statLabel}>XP Adquirido: </Text>
                <Text style={styles.statValue}>{count} XP</Text>
              </Text>

              <Text style={styles.statLine}>
                <Text style={styles.statLabel}>Total de Flexões: </Text>
                <Text style={styles.statValue}>{count}</Text>
              </Text>

              <Text style={styles.statLine}>
                <Text style={styles.statLabel}>Calorias Queimadas: </Text>
                <Text style={styles.statValue}>{calories} kcal</Text>
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
        repsLabel="FLEXÕES"
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
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
