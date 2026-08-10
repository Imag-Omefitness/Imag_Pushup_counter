// App.tsx
// Raiz do app: configura o NavigationContainer e o stack de telas.

import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './screens/HomeScreen';
import PushupWorkoutScreen from './screens/PushupWorkoutScreen';
import SitupWorkoutScreen from './screens/SitupWorkoutScreen';
import SquatWorkoutScreen from './screens/SquatWorkoutScreen';
import RankingScreen from './screens/RankingScreen';
import { RootStackParamList } from './navigation/types';
import { ProfileProvider } from './context/ProfileContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0a0a0f',
  },
};

export default function App() {
  return (
    <ProfileProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <NavigationContainer theme={AppTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Pushup" component={PushupWorkoutScreen} />
          <Stack.Screen name="Situp" component={SitupWorkoutScreen} />
          <Stack.Screen name="Squat" component={SquatWorkoutScreen} />
          <Stack.Screen name="Ranking" component={RankingScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </ProfileProvider>
  );
}
