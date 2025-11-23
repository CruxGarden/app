import axios from 'axios';

// API base URL - defaults to localhost for development
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth types
export interface AuthCodeRequest {
  email: string;
}

export interface AuthCodeResponse {
  message: string;
}

export interface LoginRequest {
  email: string;
  code: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Profile {
  id: string;
  email: string;
  role: 'admin' | 'author' | 'keeper';
  homeId: string;
  created: string;
  updated: string;
  author: {
    id: string;
    username: string;
    displayName: string;
  } | null;
}

// Account types
export interface Account {
  id: string;
  email: string;
  role: 'admin' | 'author' | 'keeper';
  homeId: string;
  created: string;
  updated: string;
}

export interface UpdateAccountRequest {
  email?: string;
}

export interface DeleteAccountRequest {
  confirmationText: string;
}

// Author types
export interface Author {
  id: string;
  key: string;
  username: string;
  displayName: string;
  bio?: string;
  rootId?: string;
  accountId: string;
  homeId: string;
  type?: string;
  kind?: string;
  meta?: any;
  created: string;
  updated: string;
  root?: any; // Embedded root crux (populated via embed=root query param)
}

export interface UpdateAuthorRequest {
  username?: string;
  displayName?: string;
  bio?: string;
}

// Crux types
export interface Crux {
  id: string;
  key: string;
  slug: string;
  title?: string;
  description?: string;
  data: string;
  type?: string;
  status?: string;
  visibility?: string;
  authorId: string;
  homeId: string;
  accountId: string;
  themeId?: string;
  meta?: any;
  created: string;
  updated: string;
}

export interface CreateCruxRequest {
  slug: string;
  title?: string;
  description?: string;
  data: string;
  type?: string;
  status?: string;
  visibility?: string;
  tags?: string[];
  meta?: any;
}

export interface UpdateCruxRequest {
  slug?: string;
  title?: string;
  description?: string;
  data?: string;
  type?: string;
  status?: string;
  visibility?: string;
  tags?: string[];
  meta?: any;
}

// Dimension types
export interface Dimension {
  id: string;
  key: string;
  sourceId: string;
  type: 'gate' | 'garden' | 'growth' | 'graft';
  weight?: number;
  note?: string;
  authorId: string;
  homeId: string;
  created: string;
  updated: string;
  // Target crux info (joined from cruxes table)
  target: {
    id: string;
    key?: string;
    slug?: string;
    title?: string;
    data?: string;
  };
}

export interface CreateDimensionRequest {
  targetId: string;
  type: 'gate' | 'garden' | 'growth' | 'graft';
  weight?: number;
  note?: string;
}

// Theme types
export interface Theme {
  id: string;
  key: string;
  title: string;
  description?: string;
  type?: string;
  kind?: string;
  system: boolean;
  meta: any; // Theme metadata with palette, bloom, content, controls sections
  authorId: string;
  homeId: string;
  created: string;
  updated: string;
}

export interface CreateThemeRequest {
  title: string;
  description?: string;
  type?: string;
  kind?: string;
  meta: any; // Theme metadata with palette, bloom, content, controls sections
}

export interface UpdateThemeRequest {
  title?: string;
  description?: string;
  type?: string;
  kind?: string;
  meta?: any; // Theme metadata with palette, bloom, content, controls sections
}

// Set auth token for all requests
export const setAuthToken = (token: string | null) => {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
};

// API methods
export const api = {
  // Auth methods
  /**
   * Request an authentication code to be sent to email
   * @param email - User's email address
   * @returns Success message
   */
  async requestAuthCode(email: string): Promise<AuthCodeResponse> {
    const response = await apiClient.post<AuthCodeResponse>('/auth/code', { email });
    return response.data;
  },

  /**
   * Login with email and authentication code
   * @param email - User's email address
   * @param code - 6-digit authentication code
   * @returns Access token, refresh token, and expiration time
   */
  async login(email: string, code: string): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/login', { email, code });
    return response.data;
  },

  /**
   * Refresh access token using refresh token
   * @param refreshToken - Valid refresh token
   * @returns New access token, refresh token, and expiration time
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    const response = await apiClient.post<RefreshTokenResponse>('/auth/token', { refreshToken });
    return response.data;
  },

  /**
   * Get current user profile (requires authentication)
   * @returns User profile information
   */
  async getUserProfile(): Promise<Profile> {
    const response = await apiClient.get<Profile>('/auth/profile');
    return response.data;
  },

  /**
   * Logout and invalidate refresh token (requires authentication)
   */
  async logout(): Promise<void> {
    await apiClient.delete('/auth/logout');
  },

  // Account methods
  /**
   * Check if an email is available for use
   * @param email - Email address to check
   * @returns Object with available boolean
   */
  async checkEmailAvailability(email: string): Promise<{ available: boolean }> {
    const response = await apiClient.get<{ available: boolean }>('/account/check-email', {
      params: { email },
    });
    return response.data;
  },

  /**
   * Get current user account (requires authentication)
   * @returns Account information
   */
  async getAccount(): Promise<Account> {
    const response = await apiClient.get<Account>('/account');
    return response.data;
  },

  /**
   * Update current user account (requires authentication)
   * @param accountData - Account update data (currently supports email)
   * @returns Updated Account object
   */
  async updateAccount(accountData: UpdateAccountRequest): Promise<Account> {
    const response = await apiClient.patch<Account>('/account', accountData);
    return response.data;
  },

  /**
   * Delete current user account (requires authentication and confirmation)
   * @param confirmationText - Must be exactly 'DELETE MY ACCOUNT'
   */
  async deleteAccount(confirmationText: string): Promise<void> {
    await apiClient.delete('/account', {
      data: { confirmationText },
    });
  },

  // Author methods
  /**
   * Fetch all authors
   * @returns Array of Author objects
   */
  async getAllAuthors(): Promise<Author[]> {
    const response = await apiClient.get<Author[]>('/authors');
    return response.data;
  },

  /**
   * Fetch author by username or key
   * @param identifier - Author username (e.g., 'keeper') or key
   * @param embed - Optional embed parameter ('root' to include root crux)
   * @returns Author object
   */
  async getAuthor(identifier: string, embed?: 'root'): Promise<Author> {
    // If identifier doesn't start with @, add it for username lookup
    const authorIdentifier = identifier.startsWith('@') ? identifier : `@${identifier}`;
    const params = embed ? { embed } : {};
    const response = await apiClient.get<Author>(`/authors/${authorIdentifier}`, { params });
    return response.data;
  },

  /**
   * Check if a username is available for use
   * @param username - Username to check
   * @returns Object with available boolean
   */
  async checkUsernameAvailability(username: string): Promise<{ available: boolean }> {
    const response = await apiClient.get<{ available: boolean }>('/authors/check-username', {
      params: { username },
    });
    return response.data;
  },

  /**
   * Update an author profile (requires authentication)
   * @param authorKey - Author key
   * @param authorData - Author update data
   * @returns Updated Author object
   */
  async updateAuthor(authorKey: string, authorData: UpdateAuthorRequest): Promise<Author> {
    const response = await apiClient.patch<Author>(`/authors/${authorKey}`, authorData);
    return response.data;
  },

  // Crux methods
  /**
   * Get a crux by key
   * @param cruxKey - Crux key
   * @returns Crux object
   */
  async getCrux(cruxKey: string): Promise<Crux> {
    const response = await apiClient.get<Crux>(`/cruxes/${cruxKey}`);
    return response.data;
  },

  /**
   * Get a crux by author username and slug
   * @param username - Author username (with or without @ prefix)
   * @param slug - Crux slug
   * @returns Crux object
   */
  async getCruxByAuthorAndSlug(username: string, slug: string): Promise<Crux> {
    // Ensure username has @ prefix
    const authorIdentifier = username.startsWith('@') ? username : `@${username}`;
    const response = await apiClient.get<Crux>(`/authors/${authorIdentifier}/cruxes/${slug}`);
    return response.data;
  },

  /**
   * Create a new crux
   * @param cruxData - Crux creation data
   * @returns Created Crux object
   */
  async createCrux(cruxData: CreateCruxRequest): Promise<Crux> {
    const response = await apiClient.post<Crux>('/cruxes', cruxData);
    return response.data;
  },

  /**
   * Update an existing crux
   * @param cruxKey - Crux key
   * @param cruxData - Crux update data
   * @returns Updated Crux object
   */
  async updateCrux(cruxKey: string, cruxData: UpdateCruxRequest): Promise<Crux> {
    const response = await apiClient.patch<Crux>(`/cruxes/${cruxKey}`, cruxData);
    return response.data;
  },

  /**
   * Delete a crux
   * @param cruxKey - Crux key
   * @returns void
   */
  async deleteCrux(cruxKey: string): Promise<void> {
    await apiClient.delete(`/cruxes/${cruxKey}`);
  },

  // Dimension methods
  /**
   * Get dimensions for a crux
   * @param cruxKey - Crux key
   * @param type - Optional dimension type filter (gate, garden, growth, graft)
   * @returns Array of Dimension objects
   */
  async getDimensions(
    cruxKey: string,
    type?: 'gate' | 'garden' | 'growth' | 'graft'
  ): Promise<Dimension[]> {
    const params = type ? { type } : {};
    const response = await apiClient.get<Dimension[]>(`/cruxes/${cruxKey}/dimensions`, { params });
    return response.data;
  },

  /**
   * Create a dimension for a crux
   * @param cruxKey - Source crux key
   * @param dimensionData - Dimension creation data
   * @returns Created Dimension object
   */
  async createDimension(
    cruxKey: string,
    dimensionData: CreateDimensionRequest
  ): Promise<Dimension> {
    const response = await apiClient.post<Dimension>(
      `/cruxes/${cruxKey}/dimensions`,
      dimensionData
    );
    return response.data;
  },

  // Theme methods
  /**
   * Get all themes (requires authentication)
   * @returns Array of Theme objects
   */
  async getThemes(): Promise<Theme[]> {
    const response = await apiClient.get<Theme[]>('/themes');
    return response.data;
  },

  /**
   * Get a theme by key
   * @param themeKey - Theme key
   * @returns Theme object
   */
  async getTheme(themeKey: string): Promise<Theme> {
    const response = await apiClient.get<Theme>(`/themes/${themeKey}`);
    return response.data;
  },

  /**
   * Create a new theme (requires authentication)
   * @param themeData - Theme creation data
   * @returns Created Theme object
   */
  async createTheme(themeData: CreateThemeRequest): Promise<Theme> {
    const response = await apiClient.post<Theme>('/themes', themeData);
    return response.data;
  },

  /**
   * Update an existing theme (requires authentication)
   * @param themeKey - Theme key
   * @param themeData - Theme update data
   * @returns Updated Theme object
   */
  async updateTheme(themeKey: string, themeData: UpdateThemeRequest): Promise<Theme> {
    const response = await apiClient.patch<Theme>(`/themes/${themeKey}`, themeData);
    return response.data;
  },

  /**
   * Delete a theme (requires authentication)
   * @param themeKey - Theme key
   * @returns void
   */
  async deleteTheme(themeKey: string): Promise<void> {
    await apiClient.delete(`/themes/${themeKey}`);
  },

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<any> {
    const response = await apiClient.get('/');
    return response.data;
  },
};

export default api;
