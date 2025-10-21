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

// API methods
export const api = {
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

  /**
   * Get dimensions for a crux
   * @param cruxKey - Crux key
   * @param type - Optional dimension type filter (gate, garden, growth, graft)
   * @returns Array of Dimension objects
   */
  async getDimensions(cruxKey: string, type?: 'gate' | 'garden' | 'growth' | 'graft'): Promise<Dimension[]> {
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
  async createDimension(cruxKey: string, dimensionData: CreateDimensionRequest): Promise<Dimension> {
    const response = await apiClient.post<Dimension>(`/cruxes/${cruxKey}/dimensions`, dimensionData);
    return response.data;
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
