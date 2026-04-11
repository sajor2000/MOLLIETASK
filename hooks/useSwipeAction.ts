"use client";

import { useRef, useCallback, useState } from "react";

const SWIPE_THRESHOLD = 60;
const VERTICAL_TOLERANCE = 30;

interface UseSwipeActionOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  enabled?: boolean;
}

export function useSwipeAction({
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
}: UseSwipeActionOptions) {
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef(false); // true once we commit to swipe vs scroll
  const isHorizontal = useRef(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      locked.current = false;
      isHorizontal.current = false;
      setOffsetX(0);
      setIsSwiping(false);
    },
    [enabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;

      if (!locked.current) {
        // Wait for enough movement to decide direction
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        locked.current = true;
        isHorizontal.current = Math.abs(dx) > Math.abs(dy);
      }

      if (!isHorizontal.current) return;

      // Abort if too much vertical drift
      if (Math.abs(dy) > VERTICAL_TOLERANCE) {
        setOffsetX(0);
        setIsSwiping(false);
        isHorizontal.current = false;
        return;
      }

      // Only allow swipe in directions that have handlers
      if (dx < 0 && !onSwipeLeft) return;
      if (dx > 0 && !onSwipeRight) return;

      e.preventDefault();
      setOffsetX(dx);
      setIsSwiping(true);
    },
    [enabled, onSwipeLeft, onSwipeRight],
  );

  const onTouchEnd = useCallback(() => {
    if (!isSwiping) {
      setOffsetX(0);
      return;
    }

    if (offsetX < -SWIPE_THRESHOLD && onSwipeLeft) {
      onSwipeLeft();
    } else if (offsetX > SWIPE_THRESHOLD && onSwipeRight) {
      onSwipeRight();
    }

    setOffsetX(0);
    setIsSwiping(false);
  }, [isSwiping, offsetX, onSwipeLeft, onSwipeRight]);

  return {
    offsetX,
    isSwiping,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
