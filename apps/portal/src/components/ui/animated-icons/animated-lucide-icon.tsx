"use client";

import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type AnimatedLucideIconProps = HTMLAttributes<HTMLSpanElement> & {
  icon: LucideIcon;
  size?: number;
  active?: boolean;
  animation?: "pulse" | "swing" | "bounce" | "tilt";
};

type ShapeMeta = {
  shape: SVGGraphicsElement;
  length: number;
  cx: number;
  cy: number;
  areaRatio: number;
  tag: string;
  isClosed: boolean;
  phase: "frame" | "detail";
};

function getSvgFrames(animation: NonNullable<AnimatedLucideIconProps["animation"]>) {
  if (animation === "swing") {
    return [
      { transform: "translateY(0px) rotate(0deg)" },
      { transform: "translateY(-0.75px) rotate(-7deg)" },
      { transform: "translateY(-0.75px) rotate(7deg)" },
      { transform: "translateY(0px) rotate(0deg)" },
    ];
  }

  if (animation === "bounce") {
    return [
      { transform: "translateY(0px) scale(1)" },
      { transform: "translateY(-2px) scale(1.045)" },
      { transform: "translateY(0px) scale(1)" },
    ];
  }

  if (animation === "tilt") {
    return [
      { transform: "translateY(0px) rotate(0deg)" },
      { transform: "translateY(-1px) rotate(-6deg)" },
      { transform: "translateY(0px) rotate(0deg)" },
    ];
  }

  return [
    { transform: "scale(1)" },
    { transform: "scale(1.085)" },
    { transform: "scale(1)" },
  ];
}

function isClosedShape(shape: SVGGraphicsElement) {
  const tag = shape.tagName.toLowerCase();
  if (tag === "circle" || tag === "ellipse" || tag === "rect" || tag === "polygon") return true;
  if (tag !== "path") return false;

  const d = shape.getAttribute("d") ?? "";
  return /z\s*$/i.test(d.trim()) || /\bz\b/i.test(d);
}

function getGeometryLength(shape: SVGGraphicsElement) {
  const geometry = shape as unknown as { getTotalLength?: () => number };
  if (typeof geometry.getTotalLength !== "function") return 28;

  try {
    return Math.max(geometry.getTotalLength(), 1);
  } catch {
    return 28;
  }
}

function getShapeMetas(svg: SVGSVGElement) {
  const shapes = Array.from(
    svg.querySelectorAll<SVGGraphicsElement>(
      "path, line, polyline, polygon, rect, circle, ellipse",
    ),
  );

  const svgBox = (() => {
    try {
      return svg.getBBox();
    } catch {
      return { x: 0, y: 0, width: 24, height: 24 };
    }
  })();

  const svgArea = Math.max(svgBox.width * svgBox.height, 1);
  const centerX = svgBox.x + svgBox.width / 2;
  const centerY = svgBox.y + svgBox.height / 2;

  const metas: ShapeMeta[] = shapes.map((shape) => {
    const bbox = (() => {
      try {
        return shape.getBBox();
      } catch {
        return { x: centerX - 6, y: centerY - 6, width: 12, height: 12 };
      }
    })();

    const length = getGeometryLength(shape);
    const area = Math.max(bbox.width * bbox.height, 1);
    const areaRatio = area / svgArea;
    const isClosed = isClosedShape(shape);

    const frameLike =
      areaRatio > 0.18 ||
      (isClosed && areaRatio > 0.07) ||
      (isClosed && length > 42);

    return {
      shape,
      length,
      cx: bbox.x + bbox.width / 2,
      cy: bbox.y + bbox.height / 2,
      areaRatio,
      tag: shape.tagName.toLowerCase(),
      isClosed,
      phase: frameLike ? "frame" : "detail",
    };
  });

  const frames = metas
    .filter((meta) => meta.phase === "frame")
    .sort((a, b) => b.areaRatio - a.areaRatio);

  const details = metas
    .filter((meta) => meta.phase === "detail")
    .sort((a, b) => a.areaRatio - b.areaRatio);

  return {
    ordered: [...frames, ...details],
    centerX,
    centerY,
  };
}

function getDashStartOffset(meta: ShapeMeta, centerX: number, centerY: number) {
  if (meta.isClosed) return meta.length * 0.8;

  const dx = meta.cx - centerX;
  const dy = meta.cy - centerY;
  const mostlyHorizontal = Math.abs(dx) >= Math.abs(dy);

  if (mostlyHorizontal) {
    return dx < 0 ? -meta.length : meta.length;
  }

  return dy < 0 ? -meta.length : meta.length;
}

function getShapeFrames(meta: ShapeMeta, centerX: number, centerY: number) {
  const dx = meta.cx - centerX;
  const dy = meta.cy - centerY;
  const distance = Math.max(Math.hypot(dx, dy), 0.001);
  const ux = dx / distance;
  const uy = dy / distance;

  const drift = meta.phase === "frame" ? 1.2 : 1.8;
  const fromX = ux * drift;
  const fromY = uy * drift;

  if (meta.tag === "circle" || meta.tag === "ellipse") {
    return [
      { opacity: 0.45, transform: `translate(${fromX}px, ${fromY}px) scale(0.88)` },
      { opacity: 1, transform: "translate(0px, 0px) scale(1)" },
    ];
  }

  if (meta.tag === "line" || meta.tag === "polyline") {
    return [
      { opacity: 0.5, transform: `translate(${fromX}px, ${fromY}px)` },
      { opacity: 1, transform: "translate(0px, 0px)" },
    ];
  }

  return [
    { opacity: 0.45, transform: `translate(${fromX}px, ${fromY}px) scale(0.96)` },
    { opacity: 1, transform: "translate(0px, 0px) scale(1)" },
  ];
}

export function AnimatedLucideIcon({
  icon: Icon,
  size = 18,
  active = false,
  animation = "pulse",
  className,
  onMouseEnter,
  onMouseLeave,
  ...props
}: AnimatedLucideIconProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const animationsRef = useRef<Animation[]>([]);

  const stopAnimations = useCallback(() => {
    for (const animation of animationsRef.current) {
      animation.cancel();
    }
    animationsRef.current = [];

    const root = rootRef.current;
    if (!root) return;

    const svg = root.querySelector("svg");
    if (svg) {
      svg.style.transform = "";
      svg.style.transformOrigin = "50% 50%";
    }

    const shapes = root.querySelectorAll<SVGGraphicsElement>(
      "path, line, polyline, polygon, rect, circle, ellipse",
    );
    for (const shape of shapes) {
      shape.style.strokeDasharray = "";
      shape.style.strokeDashoffset = "";
      shape.style.opacity = "";
      shape.style.transform = "";
      shape.style.transformBox = "fill-box";
      shape.style.transformOrigin = "center";
    }
  }, []);

  const runAnimation = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    stopAnimations();

    const svg = root.querySelector("svg");
    if (!svg) return;

    svg.style.transformOrigin = "50% 50%";

    const svgAnim = svg.animate(getSvgFrames(animation), {
      duration: 760,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "none",
    });
    animationsRef.current.push(svgAnim);

    const { ordered, centerX, centerY } = getShapeMetas(svg);

    ordered.forEach((meta, index) => {
      const shape = meta.shape;
      const dashStart = getDashStartOffset(meta, centerX, centerY);

      shape.style.strokeDasharray = `${meta.length}`;
      shape.style.strokeDashoffset = `${dashStart}`;
      shape.style.opacity = "0.45";
      shape.style.transformBox = "fill-box";
      shape.style.transformOrigin = "center";

      const phaseDelay = meta.phase === "frame" ? 0 : 160;
      const delay = phaseDelay + index * 42;
      const duration = meta.phase === "frame" ? 460 : 520;

      const drawAnim = shape.animate(
        [
          { strokeDashoffset: `${dashStart}`, opacity: 0.45 },
          { strokeDashoffset: "0", opacity: 1 },
        ],
        {
          duration,
          delay,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        },
      );

      animationsRef.current.push(drawAnim);

      const settleAnim = shape.animate(getShapeFrames(meta, centerX, centerY), {
        duration: duration + 120,
        delay,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      });

      animationsRef.current.push(settleAnim);
    });
  }, [animation, stopAnimations]);

  useEffect(() => {
    if (!active) return;
    runAnimation();
  }, [active, runAnimation]);

  useEffect(() => {
    return () => {
      stopAnimations();
    };
  }, [stopAnimations]);

  return (
    <span
      ref={rootRef}
      className={cn("inline-flex items-center justify-center", className)}
      onMouseEnter={(event) => {
        runAnimation();
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
      }}
      {...props}
    >
      <Icon size={size} />
    </span>
  );
}
