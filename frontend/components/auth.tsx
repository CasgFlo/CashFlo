import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../contexts/ThemeContext';
import { space, radius } from './ui';

/** Logo mark and name shown at the top of the sign-in screens. */
export function AuthBrand({ colors }: { colors: ThemeColors }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.xxl }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="wallet" size={22} color={colors.onPrimary} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginLeft: space.sm, letterSpacing: -0.3 }}>
        CashFlo
      </Text>
    </View>
  );
}

export const createAuthStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, paddingHorizontal: space.xl, maxWidth: 480, width: '100%', alignSelf: 'center' },
    title: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 15, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xl, lineHeight: 21 },
    label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: space.sm, marginTop: space.md },
    inputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: space.lg,
      minHeight: 52,
    },
    input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 12, marginLeft: space.md },
    forgot: { alignSelf: 'flex-end', marginTop: space.md },
    link: { fontSize: 14, fontWeight: '700', color: colors.primary },
    errorText: { color: colors.error, fontSize: 14, marginTop: space.md, lineHeight: 20 },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: space.xl },
    footerText: { fontSize: 14, color: colors.textSecondary },
  });
