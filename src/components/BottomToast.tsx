import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppColors } from '@/theme/colors';

const HIDDEN = 180;
const SPRING = { damping: 20, stiffness: 220, mass: 0.7 };

/**
 * Toast pinned above the tab bar. Flick it in any direction to dismiss.
 *
 * Gestures run through gesture-handler + Reanimated so the drag is driven on
 * the UI thread — a PanResponder version stuttered and could be left stranded
 * mid-swipe when the JS thread was busy rendering sensor updates.
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
  const ty = useSharedValue(HIDDEN);
  const tx = useSharedValue(0);
  const opacity = useSharedValue(1);

  const finish = useCallback(() => onDismiss(), [onDismiss]);

  const dismiss = useCallback(() => {
    ty.value = withTiming(HIDDEN, { duration: 180 });
    opacity.value = withTiming(0, { duration: 180 }, (done) => {
      if (done) runOnJS(finish)();
    });
  }, [finish, opacity, ty]);

  useEffect(() => {
    if (!visible) return;
    tx.value = 0;
    ty.value = HIDDEN;
    opacity.value = 1;
    ty.value = withSpring(0, SPRING);

    if (autoHideMs <= 0) return;
    const t = setTimeout(dismiss, autoHideMs);
    return () => clearTimeout(t);
  }, [visible, autoHideMs, dismiss, opacity, tx, ty]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Downward and sideways drag both track the finger; upward resists.
      ty.value = e.translationY > 0 ? e.translationY : e.translationY * 0.25;
      tx.value = e.translationX;
    })
    .onEnd((e) => {
      const flung =
        e.translationY > 40 ||
        Math.abs(e.translationX) > 80 ||
        e.velocityY > 600 ||
        Math.abs(e.velocityX) > 700;
      if (flung) {
        ty.value = withTiming(HIDDEN, { duration: 160 });
        tx.value = withTiming(Math.sign(e.translationX) * 240, { duration: 160 });
        opacity.value = withTiming(0, { duration: 160 }, (done) => {
          if (done) runOnJS(finish)();
        });
      } else {
        ty.value = withSpring(0, SPRING);
        tx.value = withSpring(0, SPRING);
      }
    });

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }, { translateX: tx.value }],
  }));

  if (!visible) return null;

  const bg = tone === 'warning' ? c.pink : tone === 'suggestion' ? c.accent : c.surface;
  const fg = tone === 'neutral' ? c.textPri : c.bg;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.toast,
          {
            bottom: bottomOffset + 12,
            backgroundColor: bg,
            borderColor: tone === 'neutral' ? c.border : 'transparent',
          },
          style,
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
              onAction();
              dismiss();
            }}
            hitSlop={10}
            style={styles.action}>
            <Text style={[styles.actionText, { color: fg }]}>{actionLabel}</Text>
          </Pressable>
        )}

        <Pressable onPress={dismiss} hitSlop={10}>
          <Ionicons name="close" size={16} color={fg} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
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
  actionText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textDecorationLine: 'underline',
  },
});
