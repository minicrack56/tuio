
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.deadreckoning.game',
  appName: 'Dead Reckoning',
  webDir: 'dist',
  backgroundColor: '#060d08',
  server: {
    androidScheme: 'https',
  },
  android: {
    // keep the game immersive edge-to-edge
    allowMixedContent: false,
  },
};

export default config;
