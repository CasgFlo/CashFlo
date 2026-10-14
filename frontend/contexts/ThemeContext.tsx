import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark';

interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  
  background: string;
  surface: string;
  surfaceAlt: string;
  
  text: string;
  textSecondary: string;
  textLight: string;
  
  success: string;
  error: string;
  warning: string;
  info: string;
  
  income: string;
  expense: string;
  
  border: string;
  divider: string;
  
  categories: {
    food: string;
    transport: string;
    home: string;
    entertainment: string;
    shopping: string;
    health: string;
    education: string;
    other: string;
  };
}

const lightColors: ThemeColors = {
  primary: '#2F5B4C',
  primaryLight: '#3D7560',
  primaryDark: '#1F3D33',
  secondary: '#4ECDC4',
  
  background: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceAlt: '#FAFAFA',
  
  text: '#1A1A1A',
  textSecondary: '#757575',
  textLight: '#9E9E9E',
  
  success: '#4CAF50',
  error: '#F44336',
  warning: '#FF9800',
  info: '#2196F3',
  
  income: '#4CAF50',
  expense: '#F44336',
  
  border: '#E0E0E0',
  divider: '#EEEEEE',
  
  categories: {
    food: '#FF6B6B',
    transport: '#4ECDC4',
    home: '#45B7D1',
    entertainment: '#FFA07A',
    shopping: '#98D8C8',
    health: '#FF7F50',
    education: '#6C5CE7',
    other: '#95A5A6',
  }
};

const darkColors: ThemeColors = {
  primary: '#4ECDC4',
  primaryLight: '#6DD5CD',
  primaryDark: '#3BA99F',
  secondary: '#2F5B4C',
  
  background: '#121212',
  surface: '#1E1E1E',
  surfaceAlt: '#2A2A2A',
  
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textLight: '#808080',
  
  success: '#66BB6A',
  error: '#EF5350',
  warning: '#FFB74D',
  info: '#42A5F5',
  
  income: '#66BB6A',
  expense: '#EF5350',
  
  border: '#333333',
  divider: '#2A2A2A',
  
  categories: {
    food: '#FF6B6B',
    transport: '#4ECDC4',
    home: '#45B7D1',
    entertainment: '#FFA07A',
    shopping: '#98D8C8',
    health: '#FF7F50',
    education: '#6C5CE7',
    other: '#95A5A6',
  }
};

interface ThemeContextType {
  theme: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<ThemeMode>('light');

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('theme');
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
      }
    } catch (error) {
      console.log('Error loading theme:', error);
    }
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    try {
      await AsyncStorage.setItem('theme', newTheme);
    } catch (error) {
      console.log('Error saving theme:', error);
    }
  };

  const colors = theme === 'light' ? lightColors : darkColors;

  return (
    <ThemeContext.Provider
      value={{
        theme,
        colors,
        toggleTheme,
        isDark: theme === 'dark',
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
