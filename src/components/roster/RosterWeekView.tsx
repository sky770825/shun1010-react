import { format, parseISO, getDay, isSameDay } from "date-fns";
import { GlassCard } from "@/components/ui/glass-card";
import { cn, isWeekendDay, getNoScheduleLabel } from "@/lib/utils";
import { WEEKDAY_NAMES, SLOT_INFO } from "@/lib/constants";
import type { SlotCode } from "@/types";

export type DaySlotData = { slotCode: SlotCode; assignee: string | null; isMissing: boolean };

type WeekViewProps = {
  weekDays: string[];
  weekSlots: unknown[];
  getDaySlotsData: (date: string, slotsSource?: unknown) => DaySlotData[];
  isDateLocked: (date: string) => boolean;
  selectedSlot: { date: string; slotCode: SlotCode } | null;
  setSelectedSlot: (s: { date: string; slotCode: SlotCode } | null) => void;
};

/**
 * 網頁版本週：框、間距、字型依視窗比例調整（md/lg/xl/2xl），大螢幕時隨比例放大，不與手機共用。
 */
export function RosterWeekDesktop({
  weekDays,
  weekSlots,
  getDaySlotsData,
  isDateLocked,
  selectedSlot,
  setSelectedSlot,
}: WeekViewProps) {
  return (
    <GlassCard className="mb-4 p-4 md:p-5 lg:p-5 xl:p-6 2xl:p-6">
      <div className="grid grid-cols-7 gap-2 md:gap-3 lg:gap-4 xl:gap-5 2xl:gap-6">
        {weekDays.map((dateStr) => {
          const d = parseISO(dateStr);
          const isToday = isSameDay(d, new Date());
          const isWeekend = isWeekendDay(dateStr);
          const daySlots = getDaySlotsData(dateStr, weekSlots);
          const hasMissing = daySlots.some((s) => s.isMissing);
          return (
            <div
              key={dateStr}
              className={cn(
                "rounded-lg p-2 md:p-3 lg:p-4 xl:p-4 2xl:p-5 border min-h-[96px] md:min-h-[108px] lg:min-h-[120px] xl:min-h-[132px] 2xl:min-h-[144px]",
                isWeekend && "bg-destructive/5 border-destructive/20",
                isToday && "ring-2 ring-primary",
                hasMissing && "border-destructive/50"
              )}
            >
              <div
                className={cn(
                  "font-semibold pb-1.5 mb-1.5 border-b border-border/60 text-xs md:text-sm lg:text-base xl:text-lg 2xl:text-xl",
                  isWeekend && "text-destructive"
                )}
              >
                {WEEKDAY_NAMES[getDay(d)]} {format(d, "d")}
              </div>
              <div className="space-y-1">
                {daySlots.length === 0 && getNoScheduleLabel(dateStr) ? (
                  <div className="text-[10px] md:text-xs text-amber-600/90" title="全員不排班">
                    {getNoScheduleLabel(dateStr)}
                  </div>
                ) : (
                  daySlots.map(({ slotCode, assignee, isMissing }) => (
                    <div
                      key={slotCode}
                      role="button"
                      tabIndex={0}
                      onClick={() => !isDateLocked(dateStr) && setSelectedSlot({ date: dateStr, slotCode })}
                      onKeyDown={(e) => {
                        if (
                          !isDateLocked(dateStr) &&
                          (e.key === "Enter" || e.key === " ")
                        ) {
                          e.preventDefault();
                          setSelectedSlot({ date: dateStr, slotCode });
                        }
                      }}
                      className={cn(
                        "flex items-center gap-1.5 leading-snug rounded px-1 py-0.5 text-[10px] md:text-xs lg:text-sm xl:text-base 2xl:text-lg",
                        isMissing && "bg-destructive/20",
                        !isDateLocked(dateStr) && "cursor-pointer hover:bg-muted/60",
                        selectedSlot?.date === dateStr &&
                          selectedSlot?.slotCode === slotCode &&
                          "ring-1 ring-primary bg-primary/10"
                      )}
                      title={SLOT_INFO[slotCode].time}
                    >
                      <span
                        className={cn(
                          "shrink-0 font-semibold",
                          slotCode.includes("AM") && "text-sky-700",
                          slotCode.includes("MD") && "text-emerald-700",
                          slotCode.includes("PM") && "text-violet-700"
                        )}
                      >
                        {slotCode.includes("AM")
                          ? "早"
                          : slotCode.includes("MD")
                            ? "午"
                            : "晚"}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 inline-flex items-center justify-center rounded border min-w-[1.25rem] md:min-w-[1.5rem] lg:min-w-[1.75rem] xl:min-w-[2rem] px-1 py-0.5 text-[10px] md:text-xs lg:text-sm xl:text-base font-semibold",
                          isMissing
                            ? "border-destructive/50 bg-destructive/10 text-destructive"
                            : "border-border bg-muted/80"
                        )}
                      >
                        {assignee || "缺"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

/**
 * 手機／平板版本週：獨立結構，依手機／平板視窗比例調整，不與桌面混用。
 */
export function RosterWeekMobile({
  weekDays,
  weekSlots,
  getDaySlotsData,
  isDateLocked,
  selectedSlot,
  setSelectedSlot,
}: WeekViewProps) {
  return (
    <GlassCard className="mb-4 p-3 sm:p-4">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {weekDays.map((dateStr) => {
          const d = parseISO(dateStr);
          const isToday = isSameDay(d, new Date());
          const isWeekend = isWeekendDay(dateStr);
          const daySlots = getDaySlotsData(dateStr, weekSlots);
          const hasMissing = daySlots.some((s) => s.isMissing);
          return (
            <div
              key={dateStr}
              className={cn(
                "rounded-lg p-1.5 sm:p-2 border min-h-[76px] sm:min-h-[84px]",
                isWeekend && "bg-destructive/5 border-destructive/20",
                isToday && "ring-2 ring-primary",
                hasMissing && "border-destructive/50"
              )}
            >
              <div
                className={cn(
                  "font-semibold pb-1 mb-1 border-b border-border/60 text-[9px] sm:text-[10px]",
                  isWeekend && "text-destructive"
                )}
              >
                {WEEKDAY_NAMES[getDay(d)]} {format(d, "d")}
              </div>
              <div className="space-y-0.5">
                {daySlots.length === 0 && getNoScheduleLabel(dateStr) ? (
                  <div className="text-[8px] sm:text-[9px] text-amber-600/90" title="全員不排班">
                    {getNoScheduleLabel(dateStr)}
                  </div>
                ) : (
                  daySlots.map(({ slotCode, assignee, isMissing }) => (
                    <div
                      key={slotCode}
                      role="button"
                      tabIndex={0}
                      onClick={() => !isDateLocked(dateStr) && setSelectedSlot({ date: dateStr, slotCode })}
                      onKeyDown={(e) => {
                        if (
                          !isDateLocked(dateStr) &&
                          (e.key === "Enter" || e.key === " ")
                        ) {
                          e.preventDefault();
                          setSelectedSlot({ date: dateStr, slotCode });
                        }
                      }}
                      className={cn(
                        "flex items-center gap-1 leading-snug rounded px-0.5 py-0.5 text-[8px] sm:text-[9px]",
                        isMissing && "bg-destructive/20",
                        !isDateLocked(dateStr) && "cursor-pointer hover:bg-muted/60 active:bg-muted/80",
                        selectedSlot?.date === dateStr &&
                          selectedSlot?.slotCode === slotCode &&
                          "ring-1 ring-primary bg-primary/10"
                      )}
                      title={SLOT_INFO[slotCode].time}
                    >
                      <span
                        className={cn(
                          "shrink-0 font-semibold",
                          slotCode.includes("AM") && "text-sky-700",
                          slotCode.includes("MD") && "text-emerald-700",
                          slotCode.includes("PM") && "text-violet-700"
                        )}
                      >
                        {slotCode.includes("AM")
                          ? "早"
                          : slotCode.includes("MD")
                            ? "午"
                            : "晚"}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 inline-flex items-center justify-center rounded border min-w-[1rem] sm:min-w-[1.25rem] px-0.5 py-0 text-[8px] sm:text-[9px] font-semibold",
                          isMissing
                            ? "border-destructive/50 bg-destructive/10 text-destructive"
                            : "border-border bg-muted/80"
                        )}
                      >
                        {assignee || "缺"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
