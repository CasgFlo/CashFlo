import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={24} color={color} />
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'web' ? 8 : 10);

  return (
    <Tabs
      screenOptions={{
        // Every tab draws its own large title, so the native header is hidden
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 58 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 6,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Główna', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="transactions"
        options={{ title: 'Transakcje', tabBarIcon: tabIcon('list', 'list-outline') }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: 'Statystyki', tabBarIcon: tabIcon('pie-chart', 'pie-chart-outline') }}
      />
      <Tabs.Screen
        name="goals"
        options={{ title: 'Cele', tabBarIcon: tabIcon('flag', 'flag-outline') }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'Więcej', tabBarIcon: tabIcon('person-circle', 'person-circle-outline') }}
      />
    </Tabs>
  );
}
