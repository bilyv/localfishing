/**
 * Base API Client
 * Centralized HTTP client with consistent error handling and configuration
 */

import type { ApiResponse, ApiRequestConfig, ApiError } from './types';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5004/api';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;

/**
 * Custom API Error class
 */
export class ApiClientError extends Error {
  public status?: number;
  public code?: string;
  public details?: any;

  constructor(message: string, status?: number, code?: string, details?: any) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Base API Client class
 * Handles authentication, error handling, retries, and common request logic
 */
export class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number;
  private maxRetries: number;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.defaultTimeout = DEFAULT_TIMEOUT;
    this.maxRetries = MAX_RETRIES;
  }

  /**
   * Get authentication token from localStorage
   */
  private getAuthToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  /**
   * Build headers for requests
   */
  private buildHeaders(config: ApiRequestConfig = {}): Record<string, string> {
    const headers: Record<string, string> = {};
    
    // Add Content-Type only for non-FormData requests
    const isFormData = config.body instanceof FormData;
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    
    // Add Authorization header if token exists
    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Merge with any additional headers
    if (config.headers) {
      Object.assign(headers, config.headers);
    }
    
    return headers;
  }

  /**
   * Handle API response and extract data
   */
  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    let data: any;
    
    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new ApiClientError(
        'Invalid JSON response from server',
        response.status,
        'INVALID_JSON'
      );
    }

    if (!response.ok) {
      const errorMessage = data.message || data.error || `HTTP ${response.status}`;
      throw new ApiClientError(
        errorMessage,
        response.status,
        data.code || 'HTTP_ERROR',
        data
      );
    }

    return data;
  }

  /**
   * Implement retry logic for failed requests
   */
  private async withRetry<T>(
    requestFn: () => Promise<Response>,
    retries: number = this.maxRetries
  ): Promise<Response> {
    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await requestFn();
        
        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return response;
        }
        
        // Don't retry on successful responses
        if (response.ok) {
          return response;
        }
        
        // Retry on server errors (5xx) and rate limiting (429)
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        return response;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    throw lastError!;
  }

  /**
   * Make HTTP request with timeout and retry logic
   */
  private async makeRequest<T>(
    endpoint: string,
    config: ApiRequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const timeout = config.timeout || this.defaultTimeout;
    const retries = config.retries ?? this.maxRetries;

    // Build request configuration
    const requestConfig: RequestInit = {
      ...config,
      headers: this.buildHeaders(config),
    };

    // Create request function with timeout
    const requestFn = async (): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          ...requestConfig,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ApiClientError('Request timeout', 408, 'TIMEOUT');
        }
        throw error;
      }
    };

    try {
      const response = await this.withRetry(requestFn, retries);
      return await this.handleResponse<T>(response);
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }
      
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ApiClientError(
          'Network error: Unable to connect to server',
          0,
          'NETWORK_ERROR'
        );
      }
      
      throw new ApiClientError(
        error instanceof Error ? error.message : 'Unknown error',
        0,
        'UNKNOWN_ERROR'
      );
    }
  }

  /**
   * GET request
   */
  public async get<T>(endpoint: string, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, { ...config, method: 'GET' });
  }

  /**
   * POST request
   */
  public async post<T>(
    endpoint: string,
    data?: any,
    config?: ApiRequestConfig
  ): Promise<ApiResponse<T>> {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return this.makeRequest<T>(endpoint, { ...config, method: 'POST', body });
  }

  /**
   * PUT request
   */
  public async put<T>(
    endpoint: string,
    data?: any,
    config?: ApiRequestConfig
  ): Promise<ApiResponse<T>> {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return this.makeRequest<T>(endpoint, { ...config, method: 'PUT', body });
  }

  /**
   * PATCH request
   */
  public async patch<T>(
    endpoint: string,
    data?: any,
    config?: ApiRequestConfig
  ): Promise<ApiResponse<T>> {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return this.makeRequest<T>(endpoint, { ...config, method: 'PATCH', body });
  }

  /**
   * DELETE request
   */
  public async delete<T>(endpoint: string, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, { ...config, method: 'DELETE' });
  }

  /**
   * Upload file with progress tracking (optional)
   */
  public async uploadFile<T>(
    endpoint: string,
    file: File,
    additionalData?: Record<string, string>,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append('file', file);
    
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    // TODO: Implement progress tracking with XMLHttpRequest if needed
    return this.post<T>(endpoint, formData);
  }
}

// Create and export default client instance
export const apiClient = new ApiClient();
