import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { RootSiblingParent } from 'react-native-root-siblings';

// Inject desktop frame CSS once at module load (web only).
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const id = '__cashflo_desktop_frame__';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.innerHTML = `
      /* Remove native browser styling on inputs/textareas */
      input, textarea, select, button,
      input[type="text"], input[type="email"], input[type="password"],
      input[type="number"], input[type="search"], input[type="tel"] {
        outline: none !important;
        outline-style: none !important;
        outline-width: 0 !important;
        outline-offset: 0 !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      input:focus, textarea:focus, select:focus, button:focus,
      input:focus-visible, textarea:focus-visible, select:focus-visible, button:focus-visible,
      input:active, textarea:active {
        outline: none !important;
        outline-style: none !important;
        outline-width: 0 !important;
        box-shadow: none !important;
      }
      *:focus, *:focus-visible {
        outline: none !important;
      }
      /* Stop autofill yellow on Chrome */
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus {
        -webkit-text-fill-color: inherit;
        -webkit-box-shadow: 0 0 0px 1000px transparent inset;
        transition: background-color 5000s ease-in-out 0s;
      }

      @media (min-width: 600px) {
        html, body {
          background: #E4E9E6 !important;
        }
        #root {
          position: absolute !important;
          left: 50% !important;
          right: auto !important;
          top: 0 !important;
          bottom: 0 !important;
          transform: translateX(-50%) !important;
          width: 100% !important;
          max-width: 480px !important;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18) !important;
          overflow: hidden !important;
          background: #F4F6F5;
        }
        #root > div {
          position: relative !important;
          inset: auto !important;
          width: 100% !important;
          height: 100% !important;
        }
      }
      @media (min-width: 600px) and (prefers-color-scheme: dark) {
        html, body { background: #0A0A0A !important; }
      }
    `;
    if (document.head) {
      document.head.appendChild(style);
    } else {
      // head not ready yet, wait
      document.addEventListener('DOMContentLoaded', () => {
        if (!document.getElementById(id)) {
          document.head.appendChild(style);
        }
      });
    }
  }
}

// Screens anyone can open without signing in
const PUBLIC_ROUTES = ['auth', 'terms', 'privacy', 'legal', 'home'];

/** Sends signed-out users (e.g. after their session expired) back to the login screen. */
function AuthGate() {
  const { isAuthenticated, loading } = useAuth();
  const segments = useSegments() as string[];
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const first = segments[0];
    const onPublicScreen = !first || PUBLIC_ROUTES.includes(first);
    if (!isAuthenticated && !onPublicScreen) {
      router.replace('/auth/login');
    }
  }, [isAuthenticated, loading, segments]);

  return null;
}

function ThemedStack() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/register" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootSiblingParent>
          <AuthGate />
          <ThemedStack />
        </RootSiblingParent>
      </AuthProvider>
    </ThemeProvider>
  );
}
