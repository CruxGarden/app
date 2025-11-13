import { useRouter } from 'expo-router';
import { useApp } from './lib/_AppContext';
import { Container, View, Text, Button, Loading, CruxBloom, Panel } from '@/components';
import { useTheme } from '@/contexts/ThemeContext';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading, account, logout } = useApp();
  const { tokens } = useTheme();

  if (isLoading) {
    return <Loading />;
  }

  return (
    <Container centered>
      <View style={{ marginBottom: 48, alignItems: 'center' }}>
        <CruxBloom
          theme={{
            primary: tokens.colors.bloomPrimary,
            secondary: tokens.colors.bloomSecondary,
            tertiary: tokens.colors.bloomTertiary,
            quaternary: tokens.colors.bloomQuaternary,
            borderColor: tokens.colors.bloomBorder,
            borderWidth: tokens.bloom.borderWidth,
          }}
          size={200}
        />
      </View>

      {isAuthenticated ? (
        <Panel style={{ alignItems: 'center', gap: 16, minWidth: 300 }}>
          <Text style={{ marginBottom: 8 }}>
            Welcome, {account?.author?.displayName || account?.email}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button title="Profile" onPress={() => router.push('/author')} />
            <Button title="Account" onPress={() => router.push('/account')} />
            <Button title="Settings" onPress={() => router.push('/settings')} />
          </View>
          <Button
            title="Bloom Gallery"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/bloom-examples')}
          />
          <Button
            title="Theme Builder"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/theme-builder')}
          />
          <Button
            title="Sign Out"
            variant="secondary"
            fullWidth
            onPress={() => logout()}
          />
        </Panel>
      ) : (
        <Panel style={{ alignItems: 'center', gap: 16, minWidth: 300 }}>
          <Button title="Sign In" onPress={() => router.push('/login')} />
          <Button
            title="Bloom Gallery"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/bloom-examples')}
          />
          <Button
            title="Theme Builder"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/theme-builder')}
          />
        </Panel>
      )}
    </Container>
  );
}
