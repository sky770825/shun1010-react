import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function GlassCard({ children, className, onClick }: GlassCardProps) {
  return (
    <div
      className={cn(
        "glass-card rounded-xl p-4",
        onClick && "cursor-pointer hover:shadow-xl transition-shadow",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function GlassPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("glass-panel rounded-2xl p-4", className)}>
      {children}
    </div>
  );
}
