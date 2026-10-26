import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClientProvider } from './src/client';
import { AppTheme } from './src/ui';
import Famora from './src/Famora';

export default function App() {
  return (
    <SafeAreaProvider>
      <ClientProvider>
        <AppTheme>
          <Famora />
        </AppTheme>
      </ClientProvider>
    </SafeAreaProvider>
  );
}
