import { useState, useEffect, useRef } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from './lib/_AppContext';
import api, { Account } from './lib/api';
import {
  Container,
  ScrollView,
  View,
  Text,
  TextInput,
  Button,
  Panel,
  Section,
  Loading,
} from '@/components';
import { useTheme } from '@/contexts/ThemeContext';

export default function AccountScreen() {
  const router = useRouter();
  const { logout } = useApp();
  const { tokens } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const emailCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadAccount();
  }, []);

  useEffect(() => {
    return () => {
      if (emailCheckTimeout.current) {
        clearTimeout(emailCheckTimeout.current);
      }
    };
  }, []);

  const loadAccount = async () => {
    try {
      setLoading(true);
      const accountData = await api.getAccount();
      setAccount(accountData);
      setEmail(accountData.email);
    } catch (error: any) {
      console.error('Failed to load account:', error);
      Alert.alert('Error', 'Failed to load account information');
    } finally {
      setLoading(false);
    }
  };

  const checkEmailAvailability = async (emailToCheck: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToCheck)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    if (emailToCheck === account?.email) {
      setEmailError('');
      return;
    }

    try {
      setCheckingEmail(true);
      setEmailError('');
      const result = await api.checkEmailAvailability(emailToCheck);

      if (!result.available) {
        setEmailError('This email is already in use');
      }
    } catch (error: any) {
      console.error('Failed to check email availability:', error);
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail);
    setEmailError('');

    if (emailCheckTimeout.current) {
      clearTimeout(emailCheckTimeout.current);
    }

    emailCheckTimeout.current = setTimeout(() => {
      checkEmailAvailability(newEmail);
    }, 500);
  };

  const handleUpdateEmail = async () => {
    if (!email || email === account?.email) {
      return;
    }

    if (emailError) {
      Alert.alert('Invalid Email', emailError);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    Alert.alert(
      'Confirm Email Change',
      `Are you sure you want to change your email to:\n\n${email}\n\nYou will be logged out and must log in again with this new email address. Make sure it's correct!`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            setEmail(account?.email || '');
          },
        },
        {
          text: 'Change Email',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await api.updateAccount({ email });
              setEmailError('');

              Alert.alert(
                'Email Updated',
                'Your email has been updated. Please log in again with your new email address.',
                [
                  {
                    text: 'OK',
                    onPress: async () => {
                      await logout();
                      router.replace('/');
                    },
                  },
                ]
              );
            } catch (error: any) {
              console.error('Failed to update email:', error);
              const message = error.response?.data?.message || 'Failed to update email';
              Alert.alert('Error', message);
              setEmail(account?.email || '');
              setEmailError('');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE MY ACCOUNT') {
      Alert.alert('Invalid Confirmation', 'Please type "DELETE MY ACCOUNT" exactly');
      return;
    }

    Alert.alert(
      'Confirm Account Deletion',
      'Are you absolutely sure? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await api.deleteAccount(deleteConfirmation);
              Alert.alert('Account Deleted', 'Your account has been deleted successfully', [
                {
                  text: 'OK',
                  onPress: () => {
                    logout();
                    router.replace('/');
                  },
                },
              ]);
            } catch (error: any) {
              console.error('Failed to delete account:', error);
              const message = error.response?.data?.message || 'Failed to delete account';
              Alert.alert('Error', message);
            } finally {
              setDeleting(false);
              setDeleteConfirmation('');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <ScrollView>
      <Container padded>
        <View style={{ marginBottom: tokens.spacing.lg }}>
          <Button
            title="← Back"
            variant="ghost"
            onPress={() => router.back()}
            style={{ alignSelf: 'flex-start', marginBottom: tokens.spacing.md }}
          />
          <Text variant="heading" weight="bold">
            Account Settings
          </Text>
        </View>

        {/* Account Information */}
        <Section title="Account Information">
          <View style={{ gap: tokens.spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ opacity: 0.7 }}>Account ID:</Text>
              <Text>{account?.id}</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ opacity: 0.7 }}>Role:</Text>
              <Text>{account?.role}</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ opacity: 0.7 }}>Created:</Text>
              <Text>
                {account?.created ? new Date(account.created).toLocaleDateString() : 'N/A'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ opacity: 0.7 }}>Last Updated:</Text>
              <Text>
                {account?.updated ? new Date(account.updated).toLocaleDateString() : 'N/A'}
              </Text>
            </View>
          </View>
        </Section>

        {/* Email Update */}
        <Section title="Email Address">
          <View style={{ position: 'relative', marginBottom: tokens.spacing.md }}>
            <TextInput
              value={email}
              onChangeText={handleEmailChange}
              placeholder="Enter email address"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={emailError ? { borderColor: '#e63946', borderWidth: 1 } : undefined}
            />
            {checkingEmail && (
              <View style={{ position: 'absolute', right: 16, top: 12 }}>
                <ActivityIndicator size="small" color={tokens.colors.buttonBackground} />
              </View>
            )}
          </View>
          {emailError ? (
            <Text style={{ color: '#e63946', fontSize: 14, marginBottom: tokens.spacing.md }}>
              {emailError}
            </Text>
          ) : null}
          <Button
            title="Update Email"
            onPress={handleUpdateEmail}
            disabled={saving || email === account?.email || !!emailError || checkingEmail}
            loading={saving}
            fullWidth
          />
        </Section>

        {/* Danger Zone */}
        <Panel style={{ borderColor: '#e63946', borderWidth: 1 }}>
          <Text
            variant="heading"
            weight="bold"
            style={{ color: '#e63946', marginBottom: tokens.spacing.md }}
          >
            Danger Zone
          </Text>
          <Text style={{ opacity: 0.7, marginBottom: tokens.spacing.lg }}>
            Deleting your account is permanent and cannot be undone. All your data will be removed.
          </Text>

          <Text style={{ opacity: 0.7, marginBottom: tokens.spacing.sm }}>
            Type "DELETE MY ACCOUNT" to confirm:
          </Text>
          <TextInput
            value={deleteConfirmation}
            onChangeText={setDeleteConfirmation}
            placeholder="DELETE MY ACCOUNT"
            autoCapitalize="characters"
            style={{ marginBottom: tokens.spacing.md }}
          />

          <Button
            title="Delete Account"
            variant="secondary"
            onPress={handleDeleteAccount}
            disabled={deleting || deleteConfirmation !== 'DELETE MY ACCOUNT'}
            loading={deleting}
            fullWidth
            style={{ backgroundColor: '#e63946' }}
          />
        </Panel>
      </Container>
    </ScrollView>
  );
}
