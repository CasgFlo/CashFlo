import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || Constants.expoConfig?.extra?.backendUrl;

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// AuthContext registers this so an expired session signs the user out
// and sends them back to the login screen.
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

// Add token to requests
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const hadToken = !!error.config?.headers?.Authorization;
    if (error.response?.status === 401 && hadToken) {
      // Session expired, password changed or account removed
      await AsyncStorage.removeItem('authToken');
      onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

/**
 * Sends a file to the server (multipart form). Uses fetch, which handles files on phones reliably.
 * Errors are shaped like axios errors, so apiErrorMessage() understands them.
 */
export async function uploadFile<T>(path: string, form: FormData): Promise<T> {
  const token = await AsyncStorage.getItem('authToken');
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
  } catch {
    throw { response: undefined };
  }
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    if (response.status === 401 && token) {
      await AsyncStorage.removeItem('authToken');
      onUnauthorized?.();
    }
    throw { response: { status: response.status, data } };
  }
  return data as T;
}

export default api;
