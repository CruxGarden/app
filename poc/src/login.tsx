import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from './lib/_AppContext';
import { api } from './lib/api';
import { Container, View, Text, TextInput, Button, Panel } from '@/components';
import { useTheme } from '@/contexts/ThemeContext';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useApp();
  const { tokens } = useTheme();

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
      style={{ flex: 1 }}
    >
      <Container centered>
        <Panel style={{ maxWidth: 400, width: '100%' }}>
          {/* Header */}
          <View style={{ marginBottom: tokens.spacing.xl, alignItems: 'center' }}>
            <Text variant="heading" weight="bold" style={{ marginBottom: tokens.spacing.sm }}>
              CruxGarden
            </Text>
            <Text>{step === 'email' ? 'Sign in to continue' : 'Enter your code'}</Text>
          </View>

          {/* Form */}
          <View style={{ gap: tokens.spacing.md }}>
            {step === 'email' ? (
              <>
                <TextInput
                  placeholder="Email address"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!isLoading}
                  returnKeyType="done"
                  onSubmitEditing={handleRequestCode}
                />

                <Button
                  title="Continue"
                  onPress={handleRequestCode}
                  disabled={isLoading}
                  loading={isLoading}
                  fullWidth
                />
              </>
            ) : (
              <>
                <View style={{ marginBottom: tokens.spacing.md }}>
                  <Text style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>
                    Sending code to:
                  </Text>
                  <Text weight="medium">{email}</Text>
                </View>

                <TextInput
                  placeholder="Authentication code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="default"
                  editable={!isLoading}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  autoFocus
                />

                <Button
                  title="Sign In"
                  onPress={handleLogin}
                  disabled={isLoading}
                  loading={isLoading}
                  fullWidth
                />

                <Button
                  title="Use a different email"
                  variant="ghost"
                  onPress={handleBack}
                  disabled={isLoading}
                  fullWidth
                />
              </>
            )}

            {/* Error message */}
            {error ? (
              <View
                style={{
                  backgroundColor: tokens.colors.panel,
                  padding: tokens.spacing.md,
                  borderRadius: tokens.borders.radius,
                  borderWidth: 1,
                  borderColor: '#e63946',
                }}
              >
                <Text style={{ color: '#e63946', textAlign: 'center' }}>{error}</Text>
              </View>
            ) : null}
          </View>

          {/* Footer */}
          <View style={{ marginTop: tokens.spacing.xl, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, opacity: 0.7, textAlign: 'center' }}>
              {step === 'email'
                ? 'Enter your email to receive a sign-in code'
                : 'Check your email for your authentication code'}
            </Text>
          </View>
        </Panel>
      </Container>
    </KeyboardAvoidingView>
  );
}
