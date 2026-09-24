import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Logo } from '@/components/Logo';
import { PostureProvider } from '@/state/PostureContext';
import { ThemeProvider, useThemeMode } from '@/theme/ThemeContext';
import { useAppColors } from '@/theme/useAppColors';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // ThemeProvider must wrap AppTabs so useAppColors can see the manual override.
  return (
    <ThemeProvider>
      <PostureProvider>
        <AppTabs />
      </PostureProvider>
    </ThemeProvider>
  );
}

function AppTabs() {
  const c = useAppColors();
  const theme = useThemeMode();

  return (
    <>
      <StatusBar style={theme?.isDark ? 'light' : 'dark'} />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTitleStyle: { color: c.textPri, fontWeight: '700', letterSpacing: 1 },
          headerShadowVisible: false,
          headerLeft: () => <Logo />,
          tabBarStyle: {
            backgroundColor: c.surface,
            borderTopColor: c.border,
          },
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.textMuted,
          sceneStyle: { backgroundColor: c.bg },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'SITWELL',
            tabBarLabel: 'Home',
            tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="sensors"
          options={{
            title: 'SENSORS',
            tabBarLabel: 'Sensors',
            tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="insights"
          options={{
            title: 'INSIGHTS',
            tabBarLabel: 'Insights',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="bar-chart" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'HISTORY',
            tabBarLabel: 'History',
            tabBarIcon: ({ color, size }) => <Ionicons name="time" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'SETTINGS',
            tabBarLabel: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
