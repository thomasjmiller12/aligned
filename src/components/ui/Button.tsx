"use client";

import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost";
/* `icon`/`iconLg` are square and padding-free — 44px is the minimum touch
   target, 56px is the floating-action size. Having these here is what keeps
   call sites from fighting the component with !important or inline styles. */
type Size = "sm" | "md" | "lg" | "icon" | "iconLg";

/* Hover is a designed state, not a filter: the surface rises toward the
   light (lighter fill, taller shadow, 1px lift) and presses back down on
   active. Nothing here uses brightness(). */
const VARIANTS: Record<Variant, string> = {
  primary: [
    "bg-caustic text-abyss",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_24px_-12px_rgba(111,224,210,0.7)]",
    "hover:bg-[#8AEBDF]",
    "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_16px_32px_-12px_rgba(111,224,210,0.85)]",
    "hover:-translate-y-px",
    "active:translate-y-0 active:bg-[#5FCFC1]",
    "active:shadow-[inset_0_2px_6px_rgba(6,24,42,0.35)]",
  ].join(" "),
  secondary: [
    "text-caustic border border-caustic/30 bg-caustic/5",
    "hover:bg-caustic/12 hover:border-caustic/55 hover:-translate-y-px",
    "active:translate-y-0 active:bg-caustic/20",
  ].join(" "),
  ghost: [
    "text-silt",
    "hover:text-foam hover:bg-foam/5",
    "active:bg-foam/10",
  ].join(" "),
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-base",
  lg: "px-6 py-3.5 text-lg",
  icon: "h-11 w-11 p-0",
  iconLg: "h-14 w-14 p-0",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  /** Circular instead of the standard control radius — icon buttons and FABs. */
  round?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "lg",
      fullWidth = false,
      round = false,
      className = "",
      ...props
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={[
          "inline-flex shrink-0 items-center justify-center gap-2 font-semibold",
          round ? "rounded-full" : "rounded-xl",
          "transition-[background-color,box-shadow,transform,border-color] duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caustic/70",
          "focus-visible:ring-offset-2 focus-visible:ring-offset-deep",
          "disabled:pointer-events-none disabled:opacity-40",
          "motion-reduce:transform-none motion-reduce:transition-none",
          VARIANTS[variant],
          SIZES[size],
          fullWidth ? "w-full" : "",
          className,
        ].join(" ")}
        {...props}
      />
    );
  }
);
