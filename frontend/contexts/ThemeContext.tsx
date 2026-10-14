import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primarySoft: string; // tinted background for primary-colored chips and icons
  onPrimary: string; // text and icons on a primary background
  secondary: string;
  accent: string; // amber highlight (Pro, tips)
  onAccent: string;

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
  incomeSoft: string;
  expenseSoft: string;

  border: string;
  divider: string;
  overlay: string;

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

// Colors chosen for readable contrast: text and amounts on surfaces, white text on primary.
const lightColors: ThemeColors = {
  primary: '#0F6B54',
  primaryLight: '#2A8A70',
  primaryDark: '#0A4F3E',
  primarySoft: '#E2F0EB',
  onPrimary: '#FFFFFF',
  secondary: '#2A8A70',
  accent: '#F2B53A',
  onAccent: '#14201B',

  background: '#F4F6F5',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF2F0',

  text: '#14201B',
  textSecondary: '#5B6862',
  textLight: '#7D8A84',

  success: '#178A55',
  error: '#C93838',
  warning: '#B9780F',
  info: '#2F6FDB',

  income: '#178A55',
  expense: '#C93838',
  incomeSoft: '#E3F3EA',
  expenseSoft: '#FBE9E8',

  border: '#E2E8E5',
  divider: '#EDF1EF',
  overlay: 'rgba(10, 20, 16, 0.45)',

  categories: {
    food: '#E8655A',
    transport: '#2E9CB8',
    home: '#4C7BD9',
    entertainment: '#E38B3C',
    shopping: '#9C6ADE',
    health: '#D9577E',
    education: '#5B67D6',
    other: '#7D8A84',
  },
};

const darkColors: ThemeColors = {
  primary: '#1F8F6E',
  primaryLight: '#3FB08D',
  primaryDark: '#16705A',
  primarySoft: '#16352C',
  onPrimary: '#FFFFFF',
  secondary: '#3FB08D',
  accent: '#F2B53A',
  onAccent: '#14201B',

  background: '#0D1311',
  surface: '#151D1A',
  surfaceAlt: '#1C2622',

  text: '#E7EDEA',
  textSecondary: '#A3B0AA',
  textLight: '#74827B',

  success: '#3DBE82',
  error: '#F06B6B',
  warning: '#F2B53A',
  info: '#6B9BF2',

  income: '#3DBE82',
  expense: '#F06B6B',
  incomeSoft: '#14302A',
  expenseSoft: '#3A1E1E',

  border: '#26322D',
  divider: '#1F2925',
  overlay: 'rgba(0, 0, 0, 0.6)',

  categories: {
    food: '#F07A70',
    transport: '#4DB5CF',
    home: '#6E95E6',
    entertainment: '#EFA05A',
    shopping: '#B38AEA',
    health: '#E87598',
    education: '#7D88E6',
    other: '#93A099',
  },
};

// Colors for charts when a category has no color of its own
export const chartPalette = ['#0F6B54', '#E8655A', '#2E9CB8', '#F2B53A', '#9C6ADE', '#4C7BD9', '#D9577E', '#7D8A84'];

interface ThemeContextType {
  theme: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  // Until the user picks a theme, follow the phone's setting
  const [theme, setTheme] = useState<ThemeMode>(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

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
