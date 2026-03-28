import { cn } from "@/lib/utils";

export function Logo({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = {
    sm: "text-[22px]",
    md: "text-[28px]",
    lg: "text-[40px]",
  };

  return (
    <span className={cn("font-bold tracking-tight select-none", sizes[size], className)}>
      dapipe<span className="text-[#8e8e93]">.</span>
    </span>
  );
}
