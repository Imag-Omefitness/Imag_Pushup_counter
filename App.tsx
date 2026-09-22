// App.tsx
// Raiz do app: configura o NavigationContainer e o stack de telas.

import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationBar } from 'expo-navigation-bar';
import { useFonts } from 'expo-font';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './screens/HomeScreen';
import PushupWorkoutScreen from './screens/PushupWorkoutScreen';
import SitupWorkoutScreen from './screens/SitupWorkoutScreen';
import SquatWorkoutScreen from './screens/SquatWorkoutScreen';
import RankingScreen from './screens/RankingScreen';
import ChallengeWarmupScreen from './screens/ChallengeWarmupScreen';
import ChallengeRestScreen from './screens/ChallengeRestScreen';
import ChallengeResultScreen from './screens/ChallengeResultScreen';
import { RootStackParamList } from './navigation/types';
import { ProfileProvider, useProfile } from './context/ProfileContext';
import { ChallengeProvider } from './context/ChallengeContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0a0a0f',
  },
};

// O ChallengeProvider precisa de um jeito de creditar o prêmio, mas não
// deve conhecer o formato do perfil — então quem liga os dois é este
// componentezinho, montado por dentro do ProfileProvider (é o único lugar
// de onde dá pra chamar useProfile).
function ChallengeBridge({ children }: { children: React.ReactNode }) {
  const { grantRewards } = useProfile();
  return <ChallengeProvider onGrantRewards={grantRewards}>{children}</ChallengeProvider>;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    'Yearbook Solid': require('./assets/fonts/Yearbook Solid.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ProfileProvider>
      <ChallengeBridge>
        {/* Tela cheia: esconde a barra de notificação (topo) e, no Android, a
            barra de navegação com os botões voltar/home (base). O usuário
            ainda consegue revelá-las momentaneamente deslizando da borda —
            isso é comportamento do sistema e não dá pra desativar. */}
        <StatusBar hidden barStyle="light-content" backgroundColor="#0a0a0f" />
        <NavigationBar hidden />
        <NavigationContainer theme={AppTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Pushup" component={PushupWorkoutScreen} />
            <Stack.Screen name="Situp" component={SitupWorkoutScreen} />
            <Stack.Screen name="Squat" component={SquatWorkoutScreen} />
            <Stack.Screen name="Ranking" component={RankingScreen} />

            {/* Telas do Desafio Diário. O gesto de voltar fica desligado
                nelas: o desafio é uma sequência — voltar pro meio dela
                reabriria uma etapa já fechada (e uma câmera já desligada). */}
            <Stack.Screen
              name="ChallengeWarmup"
              component={ChallengeWarmupScreen}
              options={{ gestureEnabled: false }}
            />
            <Stack.Screen
              name="ChallengeRest"
              component={ChallengeRestScreen}
              options={{ gestureEnabled: false }}
            />
            <Stack.Screen
              name="ChallengeResult"
              component={ChallengeResultScreen}
              options={{ gestureEnabled: false }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ChallengeBridge>
    </ProfileProvider>
  );
}
