import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';
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

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
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
