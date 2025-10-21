import { Stack, useRouter, usePathname } from "expo-router";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { Colors, Fonts, FontSizes } from "@/constants/theme";

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();

  // Only show back button if not on the home page
  const showBackButton = pathname !== '/';

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: {
          color: Colors.textPrimary,
          fontFamily: Fonts.body,
          fontSize: FontSizes.xl,
        },
        headerShadowVisible: false,
        headerLeft: showBackButton
          ? () => (
              <TouchableOpacity
                onPress={handleBack}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
            )
          : undefined,
      }}
    />
  );
}

const styles = StyleSheet.create({
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backButtonText: {
    fontSize: FontSizes.lg,
    color: Colors.accentSecondary,
    fontWeight: '600',
    fontFamily: Fonts.body,
  },
});
