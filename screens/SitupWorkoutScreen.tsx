// screens/SitupWorkoutScreen.tsx
// Tela de treino de abdominais — MediaPipe Pose rodando via WebView.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, SafeAreaView, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { Camera } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

export type Stage = 'up' | 'down' | 'unknown';

type Props = NativeStackScreenProps<RootStackParamList, 'Situp'>;

export default function SitupWorkoutScreen({ navigation }: Props) {
    const onBack = () => navigation.goBack();
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [count, setCount] = useState(0);
    const [stage, setStage] = useState<Stage>('unknown');
    const [feedback, setFeedback] = useState('Solicitando permissão...');
    const [countdown, setCountdown] = useState<number | string | null>(null);
    const [isWorkoutActive, setIsWorkoutActive] = useState(false);

    const [exitCountdown, setExitCountdown] = useState<number | null>(null);
    const [isPositionLost, setIsPositionLost] = useState(false);

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
                navigation.goBack();
            }
        } catch (err) {
            console.warn('Erro ao processar dados:', err);
        }
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

        let exitTimer = null;
        let exitValue = 3;
        let isExiting = false;

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

        function drawSkeleton(nose, shoulder, hip, knee, ankle, color = '#00e5ff') {
          canvasElement.width = videoElement.videoWidth || 640;
          canvasElement.height = videoElement.videoHeight || 480;
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

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const pose = new Pose({
            locateFile: (file) => \`https://cdn.jsdelivr.net/npm/@mediapipe/pose/\${file}\`
          });

          pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.35,
            minTrackingConfidence: 0.35
          });

          pose.onResults((results) => {
            if (!results.poseLandmarks) {
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              if (!isWorkoutActive) resetCountdown();
              if (isWorkoutActive) startExitCountdown();
              return;
            }

            const kp = results.poseLandmarks;

            const leftVis = (kp[11]?.visibility || 0) + (kp[23]?.visibility || 0) + (kp[25]?.visibility || 0);
            const rightVis = (kp[12]?.visibility || 0) + (kp[24]?.visibility || 0) + (kp[26]?.visibility || 0);
            const isLeft = leftVis >= rightVis;

            const nose = kp[0];
            const shoulder = isLeft ? kp[11] : kp[12];
            const hip = isLeft ? kp[23] : kp[24];
            const knee = isLeft ? kp[25] : kp[26];
            const ankle = isLeft ? kp[27] : kp[28];

            const minVis = 0.35;
            const hasAllPoints =
              nose && nose.visibility > minVis &&
              shoulder && shoulder.visibility > minVis &&
              hip && hip.visibility > minVis &&
              knee && knee.visibility > minVis;

            if (isWorkoutActive && !hasAllPoints) {
              startExitCountdown();
            } else if (isWorkoutActive && hasAllPoints) {
              cancelExitCountdown();
            }

            if (!isWorkoutActive && !hasAllPoints) {
              canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              resetCountdown();
              sendToRN('STATUS', { message: 'Fique de lado visível para a câmera' });
              return;
            }

            // Verifica se o joelho está dobrado (posição padrão de abdominal)
            const kneeAngle = calculateAngle(hip, knee, ankle);
            const isKneeBent = kneeAngle < 130;

            if (!isWorkoutActive) {
              if (!isKneeBent) {
                drawSkeleton(nose, shoulder, hip, knee, ankle, '#ff0055');
                resetCountdown();
                sendToRN('STATUS', { message: 'Dobre os joelhos para começar' });
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

            if (isWorkoutActive && nose && knee && hip && !isExiting) {
              const torsoLength = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y) || 1;
              const headToKneeDist = Math.hypot(nose.x - knee.x, nose.y - knee.y);
              const distRatio = headToKneeDist / torsoLength;

              let stateChanged = false;

              // Subida: Cabeça próxima do joelho
              if (distRatio < 0.22 && stage !== 'up') {
                stage = 'up';
                stateChanged = true;
              }

              // Descida: Cabeça afastada do joelho
              if (distRatio > 0.45 && stage === 'up') {
                stage = 'down';
                count++;
                stateChanged = true;
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
            sendToRN('STATUS', { message: 'Posicione-se para os abdominais' });
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
                <Pressable onPress={onBack} style={styles.backButtonInline}>
                    <Text style={{ color: '#4ea8de' }}>Voltar</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {hasPermission && (
                <WebView
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
                    style={StyleSheet.absoluteFill}
                />
            )}

            {!isWorkoutActive && !isPositionLost && (
                <View style={styles.grayOverlay} pointerEvents="none" />
            )}

            {isPositionLost && (
                <View style={styles.redOverlay} pointerEvents="none">
                    <Text style={styles.exitTitle}>SAÍU DA POSIÇÃO!</Text>
                    <Text style={styles.exitSubtitle}>Finalizando treino em</Text>
                    <Text style={styles.exitCountdownText}>{exitCountdown}</Text>
                    <Text style={styles.stopText}>STOP</Text>
                </View>
            )}

            {countdown !== null && !isPositionLost && (
                <View style={styles.countdownContainer} pointerEvents="none">
                    <Text style={styles.countdownText}>{countdown}</Text>
                </View>
            )}

            <Pressable style={styles.backButton} onPress={onBack}>
                <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
                <Text style={styles.backButtonText}>Início</Text>
            </Pressable>

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
    backButton: {
        position: 'absolute',
        top: 50,
        left: 16,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        zIndex: 40,
    },
    backButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    countdownContainer: {
        ...StyleSheet.absoluteFillObject,
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
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderColor: '#00ff88',
        borderWidth: 1,
        textAlign: 'center',
    },
    badge: {
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
        paddingHorizontal: 22,
        paddingVertical: 10,
        borderRadius: 20,
        zIndex: 35,
    },
    badgeText: { color: '#000', fontWeight: '800', fontSize: 14, letterSpacing: 1 },
});
