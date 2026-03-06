"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { SunIcon, type SunIconHandle } from "@/components/ui/sun";
import { MoonIcon, type MoonIconHandle } from "@/components/ui/moon";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const sunRef = useRef<SunIconHandle>(null);
  const moonRef = useRef<MoonIconHandle>(null);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="size-9" />;

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      onMouseEnter={() => isDark ? moonRef.current?.startAnimation() : sunRef.current?.startAnimation()}
      onMouseLeave={() => isDark ? moonRef.current?.stopAnimation() : sunRef.current?.stopAnimation()}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.div
            key="moon"
            initial={{ scale: 0, rotate: -90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, rotate: 90, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <MoonIcon ref={moonRef} size={18} />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            initial={{ scale: 0, rotate: 90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, rotate: -90, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <SunIcon ref={sunRef} size={18} />
          </motion.div>
        )}
      </AnimatePresence>
    </Button>
  );
}
