import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { setUnauthorizedHandler } from '../utils/api';
import { User } from '../utils/types';
import { apiErrorMessage } from '../utils/format';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // An expired or revoked session signs the user out everywhere
    setUnauthorizedHandler(() => setUser(null));
    checkAuth();
    return () => setUnauthorizedHandler(null);
  }, []);

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        const response = await api.get('/auth/me');
        setUser(response.data);
      }
    } catch (error) {
      // A 401 already cleared the token in the API client; other errors (e.g. offline) keep it
      console.log('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await api.post('/auth/login', { email: email.trim().toLowerCase(), password });
      const { access_token, user: userData } = response.data;
      await AsyncStorage.setItem('authToken', access_token);
      setUser(userData);
    } catch (error: any) {
      throw new Error(apiErrorMessage(error, 'Nie udało się zalogować. Spróbuj ponownie.'));
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      const response = await api.post('/auth/register', {
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
      });
      const { access_token, user: userData } = response.data;
      await AsyncStorage.setItem('authToken', access_token);
      setUser(userData);
    } catch (error: any) {
      throw new Error(apiErrorMessage(error, 'Nie udało się utworzyć konta. Spróbuj ponownie.'));
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('authToken');
    setUser(null);
  };

  const deleteAccount = async (password: string) => {
    try {
      await api.post('/auth/delete-account', { password });
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new Error('Nieprawidłowe hasło.');
      }
      if (error.response?.status === 502 || error.response?.status === 503) {
        throw new Error(
          'Nie udało się anulować subskrypcji, więc konto nie zostało usunięte. Spróbuj ponownie albo napisz do nas: cashflo2026@gmail.com.'
        );
      }
      throw new Error(apiErrorMessage(error, 'Nie udało się usunąć konta. Spróbuj ponownie.'));
    }
    await AsyncStorage.removeItem('authToken');
    setUser(null);
  };

  const requestPasswordReset = async (email: string) => {
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
    } catch (error: any) {
      throw new Error(apiErrorMessage(error, 'Nie udało się wysłać kodu. Spróbuj ponownie.'));
    }
  };

  const resetPassword = async (email: string, code: string, newPassword: string) => {
    try {
      await api.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        new_password: newPassword,
      });
    } catch (error: any) {
      throw new Error(apiErrorMessage(error, 'Nie udało się zmienić hasła. Spróbuj ponownie.'));
    }
  };

  const refreshUser = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        const response = await api.get('/auth/me');
        setUser(response.data);
      }
    } catch (error) {
      console.log('Refresh user failed:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        deleteAccount,
        requestPasswordReset,
        resetPassword,
        refreshUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
