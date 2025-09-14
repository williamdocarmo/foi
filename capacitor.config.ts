import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vocesabia.app',
  appName: 'Você Sabia?',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
};

export default config;
