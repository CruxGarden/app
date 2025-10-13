import axios from 'axios';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

interface HealthCheckData {
  status: string;
  [key: string]: any;
}

export default function Index() {
  const [healthData, setHealthData] = useState<HealthCheckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealthCheck = async () => {
      try {
        const response = await axios.get('http://localhost:3000');
        setHealthData(response.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch health check');
        console.error('Health check error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHealthCheck();
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: 'Crux Garden' }} />
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
      {loading && <ActivityIndicator size="large" />}

      {error && (
        <Text style={{ color: 'red', textAlign: 'center' }}>
          Error: {error}
        </Text>
      )}

      {healthData && (
        <View style={{ marginTop: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold' }}>
            API Health Check:
          </Text>
          <Text style={{ marginTop: 10 }}>
            {JSON.stringify(healthData, null, 2)}
          </Text>
        </View>
      )}
      </View>
    </>
  );
}
