import { format, parseISO, isSameMonth, isSameDay } from "date-fns";
import { GlassCard } from "@/components/ui/glass-card";
import { cn, isWeekendDay, getNoScheduleLabel } from "@/lib/utils";
import { WEEKDAY_NAMES, SLOT_INFO } from "@/lib/constants";
import type { SlotCode } from "@/types";

export type DaySlotData = { slotCode: SlotCode; assignee: string | null; isMissing: boolean };

type MonthViewProps = {
  calendarDays: Date[];
  currentMonth: string;
  getDaySlotsData: (date: string, slotsSource?: unknown) => DaySlotData[];
  isLocked: boolean;
  selectedSlot: { date: string; slotCode: SlotCode } | null;
  setSelectedSlot: (s: { date: string; slotCode: SlotCode } | null) => void;
};

/**
 * 網頁版月曆：框、間距、字型依視窗比例調整（md/lg/xl/2xl），大螢幕時隨比例放大，不與手機共用。
 */
export function RosterMonthDesktop({
  calendarDays,
  currentMonth,
  getDaySlotsData,
  isLocked,
  selectedSlot,
  setSelectedSlot,
}: MonthViewProps) {
  return (
    <GlassCard className="mb-4">
      {/* 星期標題：依視窗 md→xl→2xl 等比放大 */}
      <div className="grid grid-cols-7 gap-1 md:gap-2 lg:gap-3 xl:gap-4 2xl:gap-5 mb-2">
        {WEEKDAY_NAMES.map((name, i) => (
          <div
            key={name}
            className={cn(
              "text-center font-medium py-1 text-[10px] md:text-xs lg:text-sm xl:text-base 2xl:text-lg",
              (i === 0 || i === 6) && "text-destructive"
            )}
          >
            {name}
          </div>
        ))}
      </div>

      {/* 日期格線：依視窗的 gap、格高、padding、字級，大螢幕等比放大 */}
      <div className="grid grid-cols-7 gap-1 md:gap-2 lg:gap-3 xl:gap-4 2xl:gap-5">
        {calendarDays.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isCurrentMonth = isSameMonth(day, parseISO(`${currentMonth}-01`));
          const isToday = isSameDay(day, new Date());
          const isWeekend = isWeekendDay(dateStr);
          const daySlots = isCurrentMonth ? getDaySlotsData(dateStr) : [];
          const hasMissing = daySlots.some((s) => s.isMissing);

          if (!isCurrentMonth) {
            return (
              <div
                key={dateStr}
                className="opacity-30 p-1 text-[10px] md:text-xs lg:text-sm xl:text-base min-h-[72px] md:min-h-[84px] lg:min-h-[94px] xl:min-h-[102px] 2xl:min-h-[110px]"
              >
                {format(day, "d")}
              </div>
            );
          }

          return (
            <div
              key={dateStr}
              className={cn(
                "border border-border/50 rounded-lg transition-all p-1.5 md:p-2 lg:p-2.5 xl:p-3 2xl:p-3.5",
                "min-h-[72px] md:min-h-[84px] lg:min-h-[94px] xl:min-h-[102px] 2xl:min-h-[110px]",
                "hover:bg-accent/50 hover:border-primary/30 cursor-pointer",
                isWeekend && "calendar-cell-weekend",
                isToday && "calendar-cell-today",
                hasMissing && "border-destructive/50"
              )}
            >
              <div
                className={cn(
                  "font-medium mb-1 text-[10px] md:text-xs lg:text-sm xl:text-base 2xl:text-lg",
                  isWeekend && "text-destructive"
                )}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-0.5">
                {daySlots.length === 0 && getNoScheduleLabel(dateStr) ? (
                  <div className="text-[9px] md:text-[10px] text-amber-600/90" title="全員不排班">
                    {getNoScheduleLabel(dateStr)}
                  </div>
                ) : (
                  daySlots.map(({ slotCode, assignee, isMissing }) => (
                    <div
                      key={slotCode}
                      role="button"
                      tabIndex={0}
                      onClick={() => !isLocked && setSelectedSlot({ date: dateStr, slotCode })}
                      onKeyDown={(e) => {
                        if (
                          !isLocked &&
                          (e.key === "Enter" || e.key === " ")
                        ) {
                          e.preventDefault();
                          setSelectedSlot({ date: dateStr, slotCode });
                        }
                      }}
                      className={cn(
                        "flex items-center gap-1 leading-tight rounded px-0.5 text-[9px] md:text-[10px] lg:text-xs xl:text-sm 2xl:text-base",
                        isMissing && "bg-destructive/20",
                        !isLocked && "cursor-pointer hover:bg-muted/60",
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
                          "shrink-0 inline-flex items-center justify-center rounded border px-1 py-0.5 font-semibold min-w-[1rem] md:min-w-[1.25rem] lg:min-w-[1.5rem] xl:min-w-[1.75rem] 2xl:min-w-[2rem]",
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
 * 手機／平板版月曆：獨立結構，依手機／平板視窗比例調整，不與桌面混用。
 */
export function RosterMonthMobile({
  calendarDays,
  currentMonth,
  getDaySlotsData,
  isLocked,
  selectedSlot,
  setSelectedSlot,
}: MonthViewProps) {
  return (
    <GlassCard className="mb-4">
      {/* 星期標題：對應小螢幕 */}
      <div className="grid grid-cols-7 gap-0.5 mb-1.5">
        {WEEKDAY_NAMES.map((name, i) => (
          <div
            key={name}
            className={cn(
              "text-center font-medium py-0.5 text-[8px] sm:text-[9px]",
              (i === 0 || i === 6) && "text-destructive"
            )}
          >
            {name}
          </div>
        ))}
      </div>

      {/* 日期格線：小螢幕專用 gap、格高、padding、字級 */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {calendarDays.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isCurrentMonth = isSameMonth(day, parseISO(`${currentMonth}-01`));
          const isToday = isSameDay(day, new Date());
          const isWeekend = isWeekendDay(dateStr);
          const daySlots = isCurrentMonth ? getDaySlotsData(dateStr) : [];
          const hasMissing = daySlots.some((s) => s.isMissing);

          if (!isCurrentMonth) {
            return (
              <div
                key={dateStr}
                className="opacity-30 p-0.5 text-[8px] sm:text-[9px] min-h-[48px] sm:min-h-[52px]"
              >
                {format(day, "d")}
              </div>
            );
          }

          return (
            <div
              key={dateStr}
              className={cn(
                "border border-border/50 rounded-md transition-all p-1 sm:p-1.5",
                "min-h-[48px] sm:min-h-[56px]",
                "hover:bg-accent/50 hover:border-primary/30 cursor-pointer active:bg-accent/70",
                isWeekend && "calendar-cell-weekend",
                isToday && "calendar-cell-today",
                hasMissing && "border-destructive/50"
              )}
            >
              <div
                className={cn(
                  "font-medium mb-0.5 text-[8px] sm:text-[9px]",
                  isWeekend && "text-destructive"
                )}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-0.5">
                {daySlots.length === 0 && getNoScheduleLabel(dateStr) ? (
                  <div className="text-[7px] sm:text-[8px] text-amber-600/90" title="全員不排班">
                    {getNoScheduleLabel(dateStr)}
                  </div>
                ) : (
                  daySlots.map(({ slotCode, assignee, isMissing }) => (
                    <div
                      key={slotCode}
                      role="button"
                      tabIndex={0}
                      onClick={() => !isLocked && setSelectedSlot({ date: dateStr, slotCode })}
                      onKeyDown={(e) => {
                        if (
                          !isLocked &&
                          (e.key === "Enter" || e.key === " ")
                        ) {
                          e.preventDefault();
                          setSelectedSlot({ date: dateStr, slotCode });
                        }
                      }}
                      className={cn(
                        "flex items-center gap-0.5 leading-tight rounded px-0.5 text-[7px] sm:text-[8px]",
                        isMissing && "bg-destructive/20",
                        !isLocked && "cursor-pointer hover:bg-muted/60 active:bg-muted/80",
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
                          "shrink-0 inline-flex items-center justify-center rounded border px-0.5 py-0 min-w-[0.875rem] sm:min-w-[1rem] text-[7px] sm:text-[8px] font-semibold",
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
