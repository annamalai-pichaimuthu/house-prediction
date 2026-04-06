import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size    = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:   "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300",
  secondary: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300",
  danger:    "bg-red-500 text-white hover:bg-red-600 disabled:bg-red-300",
  ghost:     "bg-transparent text-slate-600 hover:bg-slate-100 border border-slate-200",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors cursor-pointer disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {children}
    </button>
  );
}
