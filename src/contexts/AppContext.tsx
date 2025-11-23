import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setAuthToken, Profile } from '@/lib/api';

// Storage keys
const ACCESS_TOKEN_KEY = 'cg:auth:access_token';
const REFRESH_TOKEN_KEY = 'cg:auth:refresh_token';

// App context type
interface AppContextType {
  // Auth state
  account: Profile | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Auth methods
  login: (email: string, code: string) => Promise<Profile>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;

  // Future: Add other app state here (themes, settings, etc.)
}

// Create context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider props
interface AppProviderProps {
  children: ReactNode;
}

// Provider component
export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  // Auth state
  const [account, setAccount] = useState<Profile | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuth = useCallback(async () => {
    // Clear storage
    await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);

    // Clear state
    setAccessTokenState(null);
    setAuthToken(null);
    setAccount(null);
  }, []);

  const refreshAuthWithToken = useCallback(async (refreshToken: string) => {
    try {
      // Call refresh endpoint
      const response = await api.refreshToken(refreshToken);

      // Store new tokens
      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);

      // Update state
      setAccessTokenState(response.accessToken);
      setAuthToken(response.accessToken);

      // Fetch user profile
      const profile = await api.getUserProfile();
      setAccount(profile);
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }, []);

  const loadStoredAuth = useCallback(async () => {
    try {
      const storedAccessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
      const storedRefreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);

      if (storedAccessToken && storedRefreshToken) {
        // Set the access token
        setAccessTokenState(storedAccessToken);
        setAuthToken(storedAccessToken);

        // Try to fetch user profile
        try {
          const profile = await api.getUserProfile();
          setAccount(profile);
        } catch {
          // If access token expired, try to refresh
          try {
            await refreshAuthWithToken(storedRefreshToken);
          } catch {
            // Refresh failed, clear auth
            await clearAuth();
          }
        }
      }
    } catch (error) {
      console.error('Failed to load stored auth:', error);
    } finally {
      setIsLoading(false);
    }
  }, [refreshAuthWithToken, clearAuth]);

  // Load tokens from storage on mount
  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  // Update axios headers when access token changes
  useEffect(() => {
    setAuthToken(accessToken);
  }, [accessToken]);

  const login = async (email: string, code: string): Promise<Profile> => {
    try {
      // Call login endpoint
      const response = await api.login(email, code);

      // Store tokens
      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);

      // Update state
      setAccessTokenState(response.accessToken);
      setAuthToken(response.accessToken);

      // Fetch user profile
      const profile = await api.getUserProfile();
      setAccount(profile);

      return profile;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Call logout endpoint (invalidates refresh token)
      await api.logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      // Clear local auth state regardless of API call success
      await clearAuth();
    }
  };

  const refreshAuth = async () => {
    const storedRefreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    if (!storedRefreshToken) {
      throw new Error('No refresh token available');
    }
    await refreshAuthWithToken(storedRefreshToken);
  };

  const value: AppContextType = {
    // Auth state
    account,
    accessToken,
    isLoading,
    isAuthenticated: !!account,

    // Auth methods
    login,
    logout,
    refreshAuth,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// Hook to use app context
export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
