# Pushup Counter

App mobile de contagem de exercícios (flexão, abdominal, agachamento) usando a câmera e detecção de pose em tempo real — feito com um amigo, em desenvolvimento.

## Stack

- **Expo SDK 57** + React Native 0.86 + React 19, em TypeScript (modo `strict`)
- **React Navigation** (native stack) para navegação entre telas
- **TensorFlow.js** + **MediaPipe Pose**, rodando dentro de uma WebView (o Expo Go não expõe frame processor nativo, então a detecção de pose roda em HTML/JS embutido, não no lado nativo)
- **expo-camera** para acesso à câmera e **expo-sensors** (acelerômetro) para detectar o posicionamento do celular (ex.: exigir modo paisagem na flexão)
- **AsyncStorage** para persistência local simples (perfil, XP, preferências de tutorial)

## Pré-requisitos

- Node.js e npm
- App **Expo Go** instalado no celular (Android/iOS), ou emulador configurado

## Como rodar

```bash
npm install
npm start
```

Aperte `a` (Android), `i` (iOS) ou `w` (web) no terminal, ou escaneie o QR code com o Expo Go.

## Permissões

O app pede acesso à câmera (`NSCameraUsageDescription` / permissão `CAMERA`) — é o que alimenta a detecção de pose.

## Estrutura do projeto

Em reorganização. Hoje:

```
screens/       # telas (Home, treinos por exercício, ranking)
components/    # componentes reutilizáveis (modais)
context/       # estado global (perfil/XP do usuário)
constants/     # tema (cores, espaçamento)
navigation/    # tipos de rota
```

## Contribuindo

Em definição — veja as issues/board do projeto.
