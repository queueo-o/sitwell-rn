import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text } from 'react-native';

import { AppColors } from '@/theme/colors';

const HIDDEN = 160;

/**
 * Toast pinned above the tab bar. Swipe down (or sideways) to dismiss, or wait
 * for it to auto-hide. Optionally carries a single action, e.g. Undo.
 */
export function BottomToast({
  visible,
  message,
  tone,
  actionLabel,
  onAction,
  onDismiss,
  autoHideMs = 4000,
  c,
  bottomOffset = 0,
}: {
  visible: boolean;
  message: string;
  tone: 'warning' | 'suggestion' | 'neutral';
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  autoHideMs?: number;
  c: AppColors;
  bottomOffset?: number;
}) {
  const translateY = useRef(new Animated.Value(HIDDEN)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useRef(() => {});
  hide.current = () => {
    Animated.timing(translateY, {
      toValue: HIDDEN,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      translateX.setValue(0);
      onDismiss();
    });
  };

  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (visible) {
      translateX.setValue(0);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 180,
      }).start();
      if (autoHideMs > 0) {
        hideTimer.current = setTimeout(() => hide.current(), autoHideMs);
      }
    } else {
      translateY.setValue(HIDDEN);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [visible, autoHideMs, translateY, translateX]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 6 || Math.abs(g.dx) > 6,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
        translateX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        const flung = g.dy > 45 || Math.abs(g.dx) > 90 || g.vy > 0.7;
        if (flung) {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          hide.current();
        } else {
          Animated.parallel([
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
          ]).start();
        }
      },
    }),
  ).current;

  if (!visible) return null;

  const bg = tone === 'warning' ? c.pink : tone === 'suggestion' ? c.accent : c.surface;
  const fg = tone === 'neutral' ? c.textPri : c.bg;

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[
        styles.toast,
        {
          bottom: bottomOffset + 12,
          backgroundColor: bg,
          borderColor: tone === 'neutral' ? c.border : 'transparent',
          transform: [{ translateY }, { translateX }],
        },
      ]}>
      <Ionicons
        name={
          tone === 'warning'
            ? 'alert-circle'
            : tone === 'suggestion'
              ? 'bulb'
              : 'information-circle'
        }
        size={18}
        color={fg}
      />
      <Text style={[styles.text, { color: fg }]} numberOfLines={2}>
        {message}
      </Text>

      {actionLabel && onAction && (
        <Pressable
          onPress={() => {
            if (hideTimer.current) clearTimeout(hideTimer.current);
            onAction();
            hide.current();
          }}
          hitSlop={8}
          style={styles.action}>
          <Text style={[styles.actionText, { color: fg }]}>{actionLabel}</Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          hide.current();
        }}
        hitSlop={8}>
        <Ionicons name="close" size={16} color={fg} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  text: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  action: { paddingHorizontal: 8, paddingVertical: 2 },
  actionText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textDecorationLine: 'underline' },
});
