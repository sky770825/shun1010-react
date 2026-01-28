import { format, parseISO, getDay } from "date-fns";
import { SlotBadge } from "@/components/ui/slot-badge";
import { WEEKDAY_NAMES_FULL, SLOT_INFO } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { RosterSlot, SlotCode } from "@/types";

export type ListRow = RosterSlot & { isMissing: boolean };

type CommonProps = {
  rows: ListRow[];
  isLocked: boolean;
  selectedSlot: { date: string; slotCode: SlotCode } | null;
  onSelectSlot: (s: { date: string; slotCode: SlotCode }) => void;
};

/**
 * 網頁版：表格式欄位，欄位清楚、易掃描
 */
export function RosterListDesktop({ rows, isLocked, selectedSlot, onSelectSlot }: CommonProps) {
  return (
    <div className="max-h-[480px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b bg-muted/80">
          <tr>
            <th className="text-left py-2.5 px-3 font-medium w-[72px]">日期</th>
            <th className="text-left py-2.5 px-2 font-medium w-[48px]">星期</th>
            <th className="text-left py-2.5 px-2 font-medium w-[56px]">班別</th>
            <th className="text-left py-2.5 px-3 font-medium min-w-[100px]">時段</th>
            <th className="text-left py-2.5 px-3 font-medium w-[72px]">人員</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const selected = selectedSlot?.date === s.date && selectedSlot?.slotCode === s.slot_code;
            return (
              <tr
                key={`${s.date}-${s.slot_code}`}
                role="button"
                tabIndex={0}
                onClick={() => !isLocked && onSelectSlot({ date: s.date, slotCode: s.slot_code })}
                onKeyDown={(e) => {
                  if (!isLocked && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelectSlot({ date: s.date, slotCode: s.slot_code });
                  }
                }}
                className={cn(
                  "border-b border-border/60 transition-colors",
                  !isLocked && "cursor-pointer hover:bg-muted/50",
                  s.isMissing && "bg-destructive/5",
                  selected && "border-l-4 border-l-primary bg-primary/5"
                )}
              >
                <td className="py-2.5 px-3 font-medium">{format(parseISO(s.date), "M/d")}</td>
                <td className="py-2.5 px-2 text-muted-foreground">
                  {WEEKDAY_NAMES_FULL[getDay(parseISO(s.date))].replace("週", "")}
                </td>
                <td className="py-2 px-2">
                  <SlotBadge slotCode={s.slot_code} />
                </td>
                <td className="py-2.5 px-3 text-muted-foreground" title={SLOT_INFO[s.slot_code].time}>
                  {SLOT_INFO[s.slot_code].time}
                </td>
                <td className={cn("py-2.5 px-3 font-medium", s.isMissing && "text-destructive")}>
                  {s.assignee_id ?? "缺人"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 手機版：卡片式列，緊湊、觸控友善
 */
export function RosterListMobile({ rows, isLocked, selectedSlot, onSelectSlot }: CommonProps) {
  return (
    <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
      {rows.map((s) => {
        const selected = selectedSlot?.date === s.date && selectedSlot?.slotCode === s.slot_code;
        return (
          <div
            key={`${s.date}-${s.slot_code}`}
            role="button"
            tabIndex={0}
            onClick={() => !isLocked && onSelectSlot({ date: s.date, slotCode: s.slot_code })}
            onKeyDown={(e) => {
              if (!isLocked && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onSelectSlot({ date: s.date, slotCode: s.slot_code });
              }
            }}
            className={cn(
              "py-3 px-3 active:bg-muted/70",
              !isLocked && "cursor-pointer",
              s.isMissing && "bg-destructive/5",
              selected && "ring-1 ring-primary bg-primary/10"
            )}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              <span className="font-medium">{format(parseISO(s.date), "M/d")}</span>
              <span className="text-muted-foreground">{WEEKDAY_NAMES_FULL[getDay(parseISO(s.date))].replace("週", "")}</span>
              <SlotBadge slotCode={s.slot_code} />
              <span className="text-muted-foreground text-xs">{SLOT_INFO[s.slot_code].time}</span>
            </div>
            <div className={cn("mt-1 font-medium", s.isMissing && "text-destructive")}>
              {s.assignee_id ?? "缺人"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
