import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

export default function MoreScreen() {
  const router = useRouter();
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Wyloguj', 'Czy na pewno chcesz się wylogować?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Wyloguj',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/auth/login');
        },
      },
    ]);
  };

  const styles = createStyles(colors);

  const menuItems = [
    {
      icon: 'wallet-outline',
      title: 'Budżet',
      subtitle: 'Ustaw limit wydatków',
      onPress: () => router.push('/budget/settings'),
      color: colors.primary,
    },
    {
      icon: 'pricetag-outline',
      title: 'Kategorie',
      subtitle: 'Zarządzaj kategoriami',
      onPress: () => router.push('/categories/manage'),
      color: colors.info,
    },
    {
      icon: 'star',
      title: 'CashFlo Pro',
      subtitle: user?.is_pro ? 'Aktywne' : 'Odblokuj więcej funkcji',
      onPress: () => router.push('/pro/upgrade'),
      color: colors.warning,
      badge: user?.is_pro ? 'PRO' : null,
      highlight: !user?.is_pro,
    },
    ...(user?.is_admin
      ? [
          {
            icon: 'shield-checkmark',
            title: 'Panel Administratora',
            subtitle: 'Statystyki, użytkownicy, zarządzanie',
            onPress: () => router.push('/admin'),
            color: '#9333EA',
            badge: 'ADMIN',
          },
        ]
      : []),
  ];

  const settingsItems = [
    {
      icon: 'help-circle-outline',
      title: 'Pomoc i wsparcie',
      onPress: () => router.push('/support/contact'),
    },
    {
      icon: 'document-text-outline',
      title: 'Regulamin',
      onPress: () => router.push('/terms'),
    },
    {
      icon: 'shield-checkmark-outline',
      title: 'Polityka Prywatności',
      onPress: () => router.push('/privacy'),
    },
    {
      icon: 'information-circle-outline',
      title: 'O aplikacji',
      onPress: () => Alert.alert('CashFlo', 'Wersja 1.0.0\n\nAplikacja do zarządzania finansami osobistymi'),
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={36} color="#fff" />
        </View>
        <Text style={styles.userName}>{user?.name}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        {user?.is_pro && (
          <View style={styles.proBadgeContainer}>
            <Ionicons name="star" size={14} color="#fff" />
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        )}
      </View>

      {/* Dark Mode Toggle */}
      <View style={styles.themeCard}>
        <View style={styles.themeLeft}>
          <View style={[styles.themeIcon, { backgroundColor: isDark ? colors.primary + '30' : colors.text + '15' }]}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={24} color={isDark ? colors.primary : colors.warning} />
          </View>
          <View style={styles.themeTextContainer}>
            <Text style={styles.themeTitle}>Tryb ciemny</Text>
            <Text style={styles.themeSubtitle}>{isDark ? 'Włączony' : 'Wyłączony'}</Text>
          </View>
        </View>
        <Switch
          value={isDark}
          onValueChange={toggleTheme}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>

      {/* Menu Items */}
      <View style={styles.section}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.menuItem,
              item.highlight && styles.menuItemHighlight,
            ]}
            onPress={item.onPress}
          >
            <View style={[styles.menuIcon, { backgroundColor: item.color + '20' }]}>
              <Ionicons name={item.icon as any} size={24} color={item.color} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
            {item.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ustawienia</Text>
        {settingsItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.settingsItem}
            onPress={item.onPress}
          >
            <Ionicons name={item.icon as any} size={24} color={colors.textSecondary} />
            <Text style={styles.settingsTitle}>{item.title}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={24} color={colors.error} />
        <Text style={styles.logoutText}>Wyloguj się</Text>
      </TouchableOpacity>

      {/* Delete account (required by the App Store and GDPR) */}
      <TouchableOpacity style={styles.deleteAccountButton} onPress={() => router.push('/account/delete')}>
        <Text style={styles.deleteAccountText}>Usuń konto</Text>
      </TouchableOpacity>

      {/* Bottom padding */}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: 16,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  proBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  proBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 4,
  },
  themeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  themeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  themeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  themeTextContainer: {
    flex: 1,
  },
  themeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  themeSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  menuItemHighlight: {
    borderWidth: 2,
    borderColor: colors.warning,
    backgroundColor: colors.warning + '08',
  },
  menuIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  menuSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
  },
  badge: {
    backgroundColor: colors.warning,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  settingsTitle: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    marginLeft: 14,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.error,
    marginTop: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
    marginLeft: 10,
  },
  deleteAccountButton: {
    alignItems: 'center',
    padding: 14,
    marginTop: 12,
  },
  deleteAccountText: {
    fontSize: 14,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
