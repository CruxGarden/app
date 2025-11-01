import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useRouter } from 'expo-router';
import { useApp } from './lib/_AppContext';
import api, { Account } from './lib/api';

export default function AccountScreen() {
  const router = useRouter();
  const { logout } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const emailCheckTimeout = useRef<NodeJS.Timeout | null>(null);

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
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToCheck)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    // If email hasn't changed, clear error
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
      // Don't show error for network issues - just allow submission
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail);
    setEmailError('');

    // Clear previous timeout
    if (emailCheckTimeout.current) {
      clearTimeout(emailCheckTimeout.current);
    }

    // Debounce email check (wait 500ms after user stops typing)
    emailCheckTimeout.current = setTimeout(() => {
      checkEmailAvailability(newEmail);
    }, 500);
  };

  const handleUpdateEmail = async () => {
    if (!email || email === account?.email) {
      return;
    }

    // Check if there's a validation error
    if (emailError) {
      Alert.alert('Invalid Email', emailError);
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    // Show confirmation prompt with the new email
    Alert.alert(
      'Confirm Email Change',
      `Are you sure you want to change your email to:\n\n${email}\n\nYou will be logged out and must log in again with this new email address. Make sure it's correct!`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            // Reset to original email
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

              // Email was updated successfully - tokens are now invalid, must re-login
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
              // Reset to original email on error
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
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4dd9b8" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Account Settings</Text>
      </View>

      {/* Account Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Information</Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Account ID:</Text>
          <Text style={styles.value}>{account?.id}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Role:</Text>
          <Text style={styles.value}>{account?.role}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Created:</Text>
          <Text style={styles.value}>
            {account?.created ? new Date(account.created).toLocaleDateString() : 'N/A'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Last Updated:</Text>
          <Text style={styles.value}>
            {account?.updated ? new Date(account.updated).toLocaleDateString() : 'N/A'}
          </Text>
        </View>
      </View>

      {/* Email Update */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Email Address</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, emailError && styles.inputError]}
            value={email}
            onChangeText={handleEmailChange}
            placeholder="Enter email address"
            placeholderTextColor="#666"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          {checkingEmail && (
            <View style={styles.inputIcon}>
              <ActivityIndicator size="small" color="#4dd9b8" />
            </View>
          )}
        </View>
        {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
        <TouchableOpacity
          style={[
            styles.button,
            (saving || email === account?.email || !!emailError || checkingEmail) &&
              styles.buttonDisabled,
          ]}
          onPress={handleUpdateEmail}
          disabled={saving || email === account?.email || !!emailError || checkingEmail}
        >
          {saving ? (
            <ActivityIndicator color="#0f1214" />
          ) : (
            <Text style={styles.buttonText}>Update Email</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Danger Zone */}
      <View style={[styles.section, styles.dangerSection]}>
        <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
        <Text style={styles.dangerText}>
          Deleting your account is permanent and cannot be undone. All your data will be removed.
        </Text>

        <Text style={styles.label}>Type &quot;DELETE MY ACCOUNT&quot; to confirm:</Text>
        <TextInput
          style={styles.input}
          value={deleteConfirmation}
          onChangeText={setDeleteConfirmation}
          placeholder="DELETE MY ACCOUNT"
          placeholderTextColor="#666"
          autoCapitalize="characters"
        />

        <TouchableOpacity
          style={[styles.button, styles.deleteButton, deleting && styles.buttonDisabled]}
          onPress={handleDeleteAccount}
          disabled={deleting || deleteConfirmation !== 'DELETE MY ACCOUNT'}
        >
          {deleting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.deleteButtonText}>Delete Account</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#0F1214',
  },
  container: {
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    color: '#4dd9b8',
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e8eef2',
  },
  section: {
    marginBottom: 32,
    padding: 16,
    backgroundColor: '#1a1f24',
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e8eef2',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#a0aab5',
    marginBottom: 8,
  },
  value: {
    fontSize: 14,
    color: '#e8eef2',
  },
  inputWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f1214',
    borderWidth: 1,
    borderColor: '#2d3339',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    paddingRight: 48,
    fontSize: 16,
    color: '#e8eef2',
  },
  inputError: {
    borderColor: '#e63946',
  },
  inputIcon: {
    position: 'absolute',
    right: 16,
    top: 12,
  },
  errorText: {
    color: '#e63946',
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#4dd9b8',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#0f1214',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerSection: {
    borderColor: '#e63946',
    borderWidth: 1,
  },
  dangerTitle: {
    color: '#e63946',
  },
  dangerText: {
    color: '#a0aab5',
    fontSize: 14,
    marginBottom: 16,
  },
  deleteButton: {
    backgroundColor: '#e63946',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
