/* eslint-disable @typescript-eslint/no-unused-vars */
import { useRouter } from 'expo-router';
import { View, Text } from 'react-native';
import { useApp } from '@/contexts/AppContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function Index() {
  const _router = useRouter();
  const {
    isAuthenticated: _isAuthenticated,
    isLoading: _isLoading,
    account: _account,
    logout: _logout,
  } = useApp();
  const { tokens: _tokens } = useTheme();

  return (
    <View>
      <Text>Welcome to Crux Garden!</Text>
    </View>
  );
}
