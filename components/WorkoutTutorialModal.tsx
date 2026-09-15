// components/WorkoutTutorialModal.tsx
// Tutorial de posicionamento mostrado na primeira vez que o usuário entra
// numa tela de treino (e sempre que ele não tiver marcado "não mostrar
// novamente"). É compartilhado pelas três telas de treino porque o conteúdo
// só muda na orientação em que o celular precisa ficar apoiado:
// agachamento é na vertical, flexão e abdominal são na horizontal.
//
// Os ícones aqui são placeholders genéricos — a ideia é trocar a caixa
// `tutorialImageBox` por uma <Image> de verdade depois.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../constants/theme';

export type WorkoutOrientation = 'vertical' | 'horizontal';

type TutorialStep = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  rotateIcon?: boolean;
  title: string;
  text: string;
};

function buildSteps(orientation: WorkoutOrientation): TutorialStep[] {
  return [
    orientation === 'vertical'
      ? {
        icon: 'cellphone',
        title: 'Posicione o celular',
        text: 'Apoie o celular na vertical, a 90°, numa altura boa (altura do quadril/peito).',
      }
      : {
        icon: 'cellphone',
        // Mesmo ícone do modo vertical, deitado — evita depender de um
        // nome de ícone específico pra versão em paisagem.
        rotateIcon: true,
        title: 'Posicione o celular',
        text: 'Apoie o celular na horizontal, a 180°, deitado de lado, numa altura boa.',
      },
    {
      icon: 'human',
      title: 'Afaste-se',
      text: 'Dê alguns passos para trás e deixe a câmera enxergar seu corpo inteiro.',
    },
  ];
}

// Lê/grava a preferência de "não mostrar novamente" no AsyncStorage.
// `checked` só vira true depois da leitura terminar: as telas usam isso pra
// segurar a montagem da WebView (câmera) até saberem se o tutorial vai
// aparecer, evitando um flash de câmera — ou pior, a contagem regressiva
// rodando escondida atrás do tutorial.
export function useWorkoutTutorial(storageKey: string) {
  const [checked, setChecked] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const hidden = await AsyncStorage.getItem(storageKey);
        if (hidden !== 'true') {
          setVisible(true);
        }
      } catch {
        // Falha na leitura: assume que ainda não viu o tutorial, já que o
        // pior caso é só mostrar de novo, não travar o treino.
        setVisible(true);
      } finally {
        setChecked(true);
      }
    })();
  }, [storageKey]);

  const dismiss = (dontShowAgain: boolean) => {
    setVisible(false);
    if (dontShowAgain) {
      AsyncStorage.setItem(storageKey, 'true').catch(() => { });
    }
  };

  return { checked, visible, dismiss };
}

export default function WorkoutTutorialModal({
  visible,
  orientation,
  onDismiss,
}: {
  visible: boolean;
  orientation: WorkoutOrientation;
  onDismiss: (dontShowAgain: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const steps = buildSteps(orientation);
  const isLastStep = step === steps.length - 1;
  const current = steps[step];

  const handleTap = () => {
    if (!isLastStep) {
      setStep((prev) => prev + 1);
      return;
    }
    onDismiss(dontShowAgain);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      {/* Tocar em qualquer lugar avança pro próximo passo (ou fecha, no
          último) — exceto na caixinha de checkbox, que é um Pressable
          aninhado e por isso captura o toque antes dele chegar no Pressable
          de fora. */}
      <Pressable style={styles.tutorialOverlay} onPress={handleTap}>
        <View style={styles.tutorialCard}>
          <View style={styles.tutorialImageBox}>
            <MaterialCommunityIcons
              name={current.icon}
              size={90}
              color="#ff3b30"
              style={current.rotateIcon ? styles.tutorialIconRotated : undefined}
            />
          </View>

          <Text style={styles.tutorialTitle}>{current.title}</Text>
          <Text style={styles.tutorialText}>{current.text}</Text>

          <View style={styles.tutorialDots}>
            {steps.map((_, index) => (
              <View
                key={index}
                style={[styles.tutorialDot, index === step && styles.tutorialDotActive]}
              />
            ))}
          </View>

          {isLastStep && (
            <Pressable
              style={styles.tutorialCheckboxRow}
              onPress={() => setDontShowAgain((prev) => !prev)}
            >
              <View
                style={[
                  styles.tutorialCheckbox,
                  dontShowAgain && styles.tutorialCheckboxChecked,
                ]}
              >
                {dontShowAgain && (
                  <MaterialCommunityIcons name="check" size={14} color="#0a0a0f" />
                )}
              </View>
              <Text style={styles.tutorialCheckboxLabel}>Não mostrar novamente</Text>
            </Pressable>
          )}

          <Text style={styles.tutorialHint}>
            {isLastStep ? 'Toque para começar' : 'Toque para continuar'}
          </Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tutorialOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 15, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  tutorialCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#15151f',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.35)',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxl,
    alignItems: 'center',
  },
  tutorialImageBox: {
    width: 140,
    height: 140,
    borderRadius: RADIUS.lg,
    backgroundColor: '#20202d',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  tutorialIconRotated: {
    transform: [{ rotate: '90deg' }],
  },
  tutorialTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  tutorialText: {
    color: '#b5b5bd',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  tutorialDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.lg,
  },
  tutorialDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2a2a35',
  },
  tutorialDotActive: {
    width: 20,
    backgroundColor: '#ff3b30',
  },
  tutorialCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  tutorialCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#6b6b73',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tutorialCheckboxChecked: {
    backgroundColor: '#ff3b30',
    borderColor: '#ff3b30',
  },
  tutorialCheckboxLabel: {
    color: '#d6d6dc',
    fontSize: 13,
    fontWeight: '600',
  },
  tutorialHint: {
    color: '#6b6b73',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
