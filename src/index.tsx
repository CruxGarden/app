import { View, Image, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useRouter } from 'expo-router';
import { useApp } from './lib/_AppContext';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading, account, logout } = useApp();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4dd9b8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/banner.png')}
        style={styles.banner}
        resizeMode="contain"
      />

      {isAuthenticated ? (
        <View style={styles.content}>
          <Text style={styles.welcomeText}>
            Welcome, {account?.author?.displayName || account?.email}
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.button} onPress={() => router.push('/author')}>
              <Text style={styles.buttonText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => router.push('/account')}>
              <Text style={styles.buttonText}>Account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => router.push('/settings')}>
              <Text style={styles.buttonText}>Settings</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => router.push('/bloom-examples')}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Bloom Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => logout()}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          <TouchableOpacity style={styles.button} onPress={() => router.push('/login')}>
            <Text style={styles.buttonText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => router.push('/bloom-examples')}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Bloom Gallery</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1214',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  banner: {
    width: '90%',
    maxWidth: 1200,
    height: undefined,
    aspectRatio: 3 / 1,
    marginBottom: 48,
  },
  content: {
    alignItems: 'center',
    gap: 16,
  },
  welcomeText: {
    fontSize: 16,
    color: '#e8eef2',
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    backgroundColor: '#4dd9b8',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonText: {
    color: '#0f1214',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#4dd9b8',
  },
  secondaryButtonText: {
    color: '#4dd9b8',
  },
});
