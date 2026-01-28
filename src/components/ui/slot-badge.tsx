import { cn } from "@/lib/utils";
import type { SlotCode } from "@/types";
import { SLOT_INFO } from "@/lib/constants";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SlotBadgeProps {
  slotCode: SlotCode;
  showLabel?: boolean;
  className?: string;
}

export function SlotBadge({ slotCode, showLabel = false, className }: SlotBadgeProps) {
  const info = SLOT_INFO[slotCode];

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded",
        info.color,
        className
      )}
    >
      <span>{info.short}</span>
      {showLabel && <span className="text-[10px] opacity-80">{info.label}</span>}
    </span>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        <p>{info.time}</p>
        <p className="text-muted-foreground text-xs">{info.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
