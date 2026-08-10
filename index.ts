// index.ts
// Ponto de entrada do app — é isto que falta pro Metro resolver o campo
// "main": "index.ts" do package.json. registerRootComponent() é a forma
// recomendada pelo próprio Expo (em vez de apontar "main" direto pra
// node_modules/expo/AppEntry.js, que é um caminho interno e não é uma API
// pública estável entre versões do SDK).

import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent chama AppRegistry.registerComponent('main', () => App),
// e também cuida de carregar o app tanto no Expo Go quanto em builds nativas.
registerRootComponent(App);
