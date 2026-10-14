import React from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { ThemeProvider } from '../contexts/ThemeContext';
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
          background: #E8E4DC !important;
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
          background: #F5F5F5;
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

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootSiblingParent>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth/login" />
            <Stack.Screen name="auth/register" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </RootSiblingParent>
      </AuthProvider>
    </ThemeProvider>
  );
}
