"use client";

import * as React from "react";
import { useState, useEffect, useRef, createContext, useContext } from "react";
import { motion } from "framer-motion";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  registerTab: (value: string) => void;
  tabs: string[];
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within a Tabs provider");
  }
  return context;
}

interface TabsProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  TabsProps
>(
  (
    { className, defaultValue, value, onValueChange, children, ...props },
    ref,
  ) => {
    const [internalValue, setInternalValue] = useState(defaultValue ?? "");
    const [tabs, setTabs] = useState<string[]>([]);

    const activeTab = value ?? internalValue;

    const setActiveTab = (newValue: string) => {
      if (value === undefined) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    };

    const registerTab = (tabValue: string) => {
      setTabs((prev) => {
        if (!prev.includes(tabValue)) {
          return [...prev, tabValue];
        }
        return prev;
      });
    };

    return (
      <TabsContext.Provider
        value={{ activeTab, setActiveTab, registerTab, tabs }}
      >
        <TabsPrimitive.Root
          ref={ref}
          value={activeTab}
          onValueChange={setActiveTab}
          className={cn("w-full", className)}
          {...props}
        >
          {children}
        </TabsPrimitive.Root>
      </TabsContext.Provider>
    );
  },
);
Tabs.displayName = "Tabs";

type TabsListProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, children, ...props }, ref) => {
  const { activeTab } = useTabsContext();
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const [indicatorStyles, setIndicatorStyles] = useState<{
    left: number;
    width: number;
  }>({
    left: 0,
    width: 0,
  });
  const [lineStyles, setLineStyles] = useState<{
    left: number;
    width: number;
  }>({
    left: 0,
    width: 0,
  });
  const [indicatorVisible, setIndicatorVisible] = useState(false);
  const [justActivated, setJustActivated] = useState(false);
  const [justRendered, setJustRendered] = useState(true);

  useEffect(() => {
    setJustRendered(false);
  }, []);

  useEffect(() => {
    const activeElement = itemRefs.current.get(activeTab);
    if (activeElement && navRef.current) {
      const navRect = navRef.current.getBoundingClientRect();
      const itemRect = activeElement.getBoundingClientRect();
      setLineStyles({
        left: itemRect.left - navRect.left + 8,
        width: itemRect.width - 16,
      });
    }
  }, [activeTab]);

  function updateIndicator(element: HTMLButtonElement) {
    if (element && navRef.current) {
      const navRect = navRef.current.getBoundingClientRect();
      const itemRect = element.getBoundingClientRect();
      setIndicatorStyles({
        left: itemRect.left - navRect.left,
        width: itemRect.width,
      });
    }
  }

  useEffect(() => {
    const activeElement = itemRefs.current.get(activeTab);
    if (activeElement && navRef.current) {
      updateIndicator(activeElement);
      setIndicatorVisible(false);
      setJustActivated(true);
    } else {
      setIndicatorVisible(false);
      setJustActivated(false);
      setIndicatorStyles({ left: 0, width: 0 });
    }
  }, [activeTab]);

  function handleItemMouseEnter(element: HTMLButtonElement) {
    if (!indicatorVisible) {
      updateIndicator(element);
      setIndicatorVisible(true);
      setJustActivated(true);
    } else {
      updateIndicator(element);
      setJustActivated(false);
    }
  }

  function handleNavMouseLeave() {
    setIndicatorVisible(false);
    setJustActivated(false);
  }

  const registerRef = (value: string, element: HTMLButtonElement | null) => {
    if (element) {
      itemRefs.current.set(value, element);
    } else {
      itemRefs.current.delete(value);
    }
  };

  return (
    <div className={cn("border-border relative border-b", className)}>
      <div ref={navRef} className="relative" onMouseLeave={handleNavMouseLeave}>
        <motion.div
          className="absolute top-0 z-0 h-full rounded-lg bg-black/[0.04] ring-1 ring-black/[0.03] dark:bg-white/[0.06] dark:ring-white/[0.03]"
          initial={{
            left: indicatorStyles.left,
            width: indicatorStyles.width,
            opacity: indicatorVisible ? 1 : 0,
          }}
          animate={{
            left: indicatorStyles.left,
            width: indicatorStyles.width,
            opacity: indicatorVisible ? 1 : 0,
          }}
          transition={
            justActivated
              ? {
                  left: { duration: 0 },
                  width: { duration: 0 },
                  opacity: {
                    duration: justRendered ? 0 : 0.2,
                    ease: "easeInOut",
                  },
                }
              : {
                  left: { type: "spring", stiffness: 300, damping: 30 },
                  width: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.3, ease: "easeInOut" },
                }
          }
        />
        <TabsPrimitive.List
          ref={ref}
          className="relative z-0 mb-2 flex"
          {...props}
        >
          {React.Children.map(children, (child) => {
            if (React.isValidElement(child) && child.type === TabsTrigger) {
              return React.cloneElement(
                child as React.ReactElement<TabsTriggerProps>,
                {
                  _onMouseEnter: handleItemMouseEnter,
                  _registerRef: registerRef,
                },
              );
            }
            return child;
          })}
        </TabsPrimitive.List>
      </div>
      <motion.div
        animate={{
          width: lineStyles.width,
          left: lineStyles.left,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="bg-primary absolute bottom-0 h-0.5 rounded-lg"
      />
    </div>
  );
});
TabsList.displayName = "TabsList";

interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  _onMouseEnter?: (element: HTMLButtonElement) => void;
  _registerRef?: (value: string, element: HTMLButtonElement | null) => void;
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(
  (
    { className, value, _onMouseEnter, _registerRef, children, ...props },
    ref,
  ) => {
    const { activeTab, registerTab } = useTabsContext();
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      if (value) {
        registerTab(value);
      }
    }, [value, registerTab]);

    useEffect(() => {
      if (_registerRef && value) {
        _registerRef(value, buttonRef.current);
      }
      return () => {
        if (_registerRef && value) {
          _registerRef(value, null);
        }
      };
    }, [_registerRef, value]);

    const handleMouseEnter = () => {
      if (_onMouseEnter && buttonRef.current) {
        _onMouseEnter(buttonRef.current);
      }
    };

    return (
      <TabsPrimitive.Trigger
        ref={(el) => {
          (
            buttonRef as React.MutableRefObject<HTMLButtonElement | null>
          ).current = el;
          if (typeof ref === "function") {
            ref(el);
          } else if (ref) {
            ref.current = el;
          }
        }}
        value={value}
        onMouseEnter={handleMouseEnter}
        className={cn(
          "text-muted-foreground hover:text-foreground inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors duration-300",
          "ring-offset-background focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          "cursor-pointer disabled:pointer-events-none disabled:opacity-50",
          activeTab === value && "text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </TabsPrimitive.Trigger>
    );
  },
);
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:ring-ring mt-4 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
