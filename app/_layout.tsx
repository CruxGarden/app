import { Stack, useRouter, usePathname } from "expo-router";
import { TouchableOpacity, Text, StyleSheet } from "react-native";

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
    fontSize: 16,
    color: '#12230F',
    fontWeight: '600',
  },
});
