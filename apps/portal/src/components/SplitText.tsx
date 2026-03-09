/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/prefer-nullish-coalescing */
import React, { useRef, useEffect, useState } from 'react';

type TweenVars = Record<string, unknown>;

export interface SplitTextProps {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
  ease?: string | ((t: number) => number);
  splitType?: 'chars' | 'words' | 'lines' | 'words, chars';
  from?: TweenVars;
  to?: TweenVars;
  threshold?: number;
  rootMargin?: string;
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';
  textAlign?: React.CSSProperties['textAlign'];
  onLetterAnimationComplete?: () => void;
}

const SplitText: React.FC<SplitTextProps> = ({
  text,
  className = '',
  delay = 50,
  duration = 1.25,
  ease = 'power3.out',
  splitType = 'chars',
  from = { opacity: 0, y: 40 },
  to = { opacity: 1, y: 0 },
  threshold = 0.1,
  rootMargin = '-100px',
  tag = 'p',
  textAlign = 'center',
  onLetterAnimationComplete
}) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const animationCompletedRef = useRef(false);
  const onCompleteRef = useRef(onLetterAnimationComplete);
  const [fontsLoaded, setFontsLoaded] = useState<boolean>(false);
  const splitInstanceRef = useRef<{ revert: () => void } | null>(null);
  const tweenRef = useRef<{ scrollTrigger?: { kill: () => void }; kill: () => void } | null>(null);

  // Keep callback ref updated
  useEffect(() => {
    onCompleteRef.current = onLetterAnimationComplete;
  }, [onLetterAnimationComplete]);

  useEffect(() => {
    if (document.fonts.status === 'loaded') {
      setFontsLoaded(true);
    } else {
      void document.fonts.ready.then(() => {
        setFontsLoaded(true);
      });
    }
  }, []);

  useEffect(() => {
    if (!ref.current || !text || !fontsLoaded) return;
    if (animationCompletedRef.current) return;

    let cancelled = false;

    const setupAnimation = async () => {
      const [{ gsap }, { ScrollTrigger }, { SplitText: GSAPSplitText }] = await Promise.all([
        import('gsap/dist/gsap'),
        import('gsap/dist/ScrollTrigger'),
        import('gsap/dist/SplitText')
      ]);

      if (cancelled || !ref.current) return;

      gsap.registerPlugin(ScrollTrigger, GSAPSplitText);

      const el = ref.current as HTMLElement & {
        _rbsplitInstance?: { revert: () => void };
      };

      if (el._rbsplitInstance) {
        try {
          el._rbsplitInstance.revert();
        } catch { /* revert may fail if element is detached */ }
        el._rbsplitInstance = undefined;
      }

      const startPct = (1 - threshold) * 100;
      const marginMatch = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(rootMargin);
      const marginValue = marginMatch?.[1] ? parseFloat(marginMatch[1]) : 0;
      const marginUnit = marginMatch?.[2] || 'px';
      const sign =
        marginValue === 0
          ? ''
          : marginValue < 0
            ? `-=${Math.abs(marginValue)}${marginUnit}`
            : `+=${marginValue}${marginUnit}`;
      const start = `top ${startPct}%${sign}`;
      let targets: Element[] = [];
      const assignTargets = (self: any) => {
        if (splitType.includes('chars') && self.chars?.length) targets = self.chars;
        if (!targets.length && splitType.includes('words') && self.words?.length) targets = self.words;
        if (!targets.length && splitType.includes('lines') && self.lines?.length) targets = self.lines;
        if (!targets.length) targets = self.chars || self.words || self.lines || [];
      };

      const splitInstance = new GSAPSplitText(el, {
        type: splitType,
        smartWrap: true,
        autoSplit: splitType === 'lines',
        linesClass: 'split-line',
        wordsClass: 'split-word',
        charsClass: 'split-char',
        reduceWhiteSpace: false,
        onSplit: (self: any) => {
          assignTargets(self);
          tweenRef.current = gsap.fromTo(
            targets,
            { ...from },
            {
              ...to,
              duration,
              ease,
              stagger: delay / 1000,
              scrollTrigger: {
                trigger: el,
                start,
                once: true,
                fastScrollEnd: true,
                anticipatePin: 0.4
              },
              onComplete: () => {
                animationCompletedRef.current = true;
                onCompleteRef.current?.();
              },
              willChange: 'transform, opacity',
              force3D: true
            }
          ) as unknown as { scrollTrigger?: { kill: () => void }; kill: () => void };

          return tweenRef.current;
        }
      });

      splitInstanceRef.current = splitInstance as { revert: () => void };
      el._rbsplitInstance = splitInstance as { revert: () => void };
    };

    void setupAnimation();

    return () => {
      cancelled = true;

      if (tweenRef.current?.scrollTrigger?.kill) {
        tweenRef.current.scrollTrigger.kill();
      }
      if (tweenRef.current?.kill) {
        tweenRef.current.kill();
      }
      tweenRef.current = null;

      const el = ref.current as (HTMLElement & { _rbsplitInstance?: { revert: () => void } }) | null;
      const instance = el?._rbsplitInstance ?? splitInstanceRef.current;

      if (instance) {
        try {
          instance.revert();
        } catch { /* revert may fail if element is detached */ }
      }

      if (el) {
        el._rbsplitInstance = undefined;
      }
      splitInstanceRef.current = null;
    };
  }, [
    text,
    delay,
    duration,
    ease,
    splitType,
    JSON.stringify(from),
    JSON.stringify(to),
    threshold,
    rootMargin,
    fontsLoaded
  ]);

  const renderTag = () => {
    const style: React.CSSProperties = {
      textAlign,
      wordWrap: 'break-word',
      willChange: 'transform, opacity'
    };
    const classes = `split-parent overflow-hidden inline-block whitespace-normal ${className}`;
    const Tag = (tag || 'p') as React.ElementType;

    return (
      <Tag ref={ref} style={style} className={classes}>
        {text}
      </Tag>
    );
  };

  return renderTag();
};

export default SplitText;
