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
import {
  CrimsonPro_300Light,
  CrimsonPro_400Regular,
  CrimsonPro_500Medium,
  CrimsonPro_600SemiBold,
  CrimsonPro_700Bold,
} from '@expo-google-fonts/crimson-pro';
import {
  WorkSans_400Regular,
  WorkSans_500Medium,
  WorkSans_600SemiBold,
  WorkSans_700Bold,
} from '@expo-google-fonts/work-sans';
import { AppProvider } from './lib/_AppContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { View, Button } from '@/components';
import '@/utils/unistyles'; // Import Unistyles configuration

function AppLayout() {
  const { setMode, resolvedMode } = useTheme();

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
      {/* Floating mode toggle button */}
      <View style={{ position: 'absolute', top: 20, right: 20, zIndex: 1000 }}>
        <Button
          title={resolvedMode === 'light' ? '🌙' : '☀️'}
          variant="ghost"
          onPress={toggleMode}
        />
      </View>
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
    // IBM Plex Sans (primary font family)
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
    // Legacy fonts (kept for backwards compatibility)
    CrimsonPro_300Light,
    CrimsonPro_400Regular,
    CrimsonPro_500Medium,
    CrimsonPro_600SemiBold,
    CrimsonPro_700Bold,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
    WorkSans_700Bold,
  });

  // Don't render app until fonts are loaded
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
