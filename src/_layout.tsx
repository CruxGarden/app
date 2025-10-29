import { Stack } from 'expo-router';
import { AppProvider } from './lib/_AppContext';

export default function RootLayout() {
  return (
    <AppProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          title: 'Crux Garden',
        }}
      />
    </AppProvider>
  );
}
