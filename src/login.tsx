import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from './lib/_AppContext';
import { api } from './lib/api';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useApp();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequestCode = async () => {
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await api.requestAuthCode(email);
      setStep('code');
      Alert.alert('Code Sent', `An authentication code has been sent to ${email}`);
    } catch (err: any) {
      console.error('Request code error:', err);
      setError(
        err.response?.data?.message || 'Failed to send authentication code. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!code.trim()) {
      setError('Please enter the authentication code');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const account = await login(email, code);
      // Navigate to author page if available, otherwise home
      if (account?.author?.username) {
        router.replace(`/@${account.author.username}` as any);
      } else {
        router.replace('/');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.response?.data?.message || 'Invalid code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep('email');
    setCode('');
    setError('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>CruxGarden</Text>
          <Text style={styles.subtitle}>
            {step === 'email' ? 'Sign in to continue' : 'Enter your code'}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {step === 'email' ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor="#8b9199"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!isLoading}
                returnKeyType="done"
                onSubmitEditing={handleRequestCode}
              />

              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleRequestCode}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#0f1214" />
                ) : (
                  <Text style={styles.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.emailDisplay}>
                <Text style={styles.emailLabel}>Sending code to:</Text>
                <Text style={styles.emailValue}>{email}</Text>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Authentication code"
                placeholderTextColor="#8b9199"
                value={code}
                onChangeText={setCode}
                keyboardType="default"
                editable={!isLoading}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                autoFocus
              />

              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#0f1214" />
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.backButton} onPress={handleBack} disabled={isLoading}>
                <Text style={styles.backButtonText}>Use a different email</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Error message */}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {step === 'email'
              ? 'Enter your email to receive a sign-in code'
              : 'Check your email for your authentication code'}
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1214',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    marginBottom: 48,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#e8eef2',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#c2cad2',
  },
  form: {
    gap: 16,
  },
  emailDisplay: {
    marginBottom: 8,
  },
  emailLabel: {
    fontSize: 13,
    color: '#8b9199',
    marginBottom: 4,
  },
  emailValue: {
    fontSize: 14,
    color: '#e8eef2',
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#1a1d21',
    borderWidth: 1,
    borderColor: '#2f3338',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#e8eef2',
  },
  button: {
    backgroundColor: '#4dd9b8',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#0f1214',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backButtonText: {
    color: '#4dd9b8',
    fontSize: 14,
  },
  error: {
    color: '#e89881',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: '#3d2825',
    padding: 12,
    borderRadius: 8,
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    color: '#8b9199',
    fontSize: 13,
    textAlign: 'center',
  },
});
