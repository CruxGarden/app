import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
  IBMPlexSerif_300Light,
  IBMPlexSerif_400Regular,
  IBMPlexSerif_500Medium,
  IBMPlexSerif_600SemiBold,
  IBMPlexSerif_700Bold,
} from '@expo-google-fonts/ibm-plex-serif';
import { AppProvider } from '@/contexts/AppContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import '@/utils/unistyles';

function AppLayout() {
  const { setMode, resolvedMode } = useTheme();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const toggleMode = () => {
    setMode(resolvedMode === 'light' ? 'dark' : 'light');
  };

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          title: 'Crux Garden',
        }}
      />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    // IBM Plex Mono
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
    // IBM Plex Sans
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    // IBM Plex Serif
    IBMPlexSerif_300Light,
    IBMPlexSerif_400Regular,
    IBMPlexSerif_500Medium,
    IBMPlexSerif_600SemiBold,
    IBMPlexSerif_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <AppProvider>
        <AppLayout />
      </AppProvider>
    </ThemeProvider>
  );
}
