"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, useSpring, useTransform, motion } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function AnimatedCounter({ 
  value, 
  decimals = 1, 
  prefix = "", 
  suffix = "", 
  className = "" 
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionVal = useMotionValue(value);
  // Critically-damped spring: snappy, smooth, zero overshoot/bounce
  const springVal = useSpring(motionVal, { stiffness: 220, damping: 30 });
  const displayVal = useTransform(springVal, (latest) => {
    return `${prefix}${latest.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`;
  });

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  return (
    <motion.span ref={ref} suppressHydrationWarning className={`tabular-nums ${className}`}>
      {displayVal}
    </motion.span>
  );
}
