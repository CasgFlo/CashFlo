import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

/**
 * On web, constrains all app content to a phone-like frame (max 480px wide).
 * Achieved by injecting CSS rules globally — this works around expo-router's
 * Stack component using position:absolute which would otherwise escape any
 * parent React Native View constraints.
 *
 * On native platforms, this is a no-op.
 */
export default function WebFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <>
      <WebFrameStyles />
      <View style={styles.outer}>
        <View style={styles.frame}>{children}</View>
      </View>
    </>
  );
}

// Inject CSS once for desktop framing behaviour. We use a small wrapper class
// added to html/body so the OS-painted area behind the phone frame gets the
// muted "stage" background. Expo router will render inside #root.
function WebFrameStyles() {
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = '__cashflo_webframe_styles__';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.innerHTML = `
      html, body, #root {
        height: 100%;
        margin: 0;
      }
      body {
        background: #E8E4DC;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #0A0A0A; }
      }
      /* On wide screens, center #root content into a phone-like frame */
      @media (min-width: 600px) {
        #root > div { /* outermost RN-web view */
          max-width: 480px !important;
          margin: 0 auto !important;
          height: 100vh !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18);
          overflow: hidden;
          position: relative !important;
          background: #F5F5F5;
        }
        /* Ensure inner absolutely-positioned Stack respects the frame */
        #root > div > div { position: relative; }
      }
    `;
    document.head.appendChild(style);
  }, []);
  return null;
}

const styles = StyleSheet.create({
  outer: { flex: 1, width: '100%' },
  frame: { flex: 1, width: '100%' },
});
