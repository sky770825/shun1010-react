import { X, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { SlotBadge } from "@/components/ui/slot-badge";
import { formatDisplayDate } from "@/lib/utils";
import { SLOT_INFO } from "@/lib/constants";
import type { ScheduleReport as ScheduleReportType, SlotCode } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ScheduleReportProps {
  report: ScheduleReportType;
  month: string;
  onClose: () => void;
}

export function ScheduleReport({ report, month, onClose }: ScheduleReportProps) {
  const slotCodes: SlotCode[] = ['WD_AM', 'WD_PM', 'WE_AM', 'WE_MD', 'WE_PM'];

  return (
    <GlassCard className="mb-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">排班報告</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Missing Slots */}
      {report.missing_slots.length > 0 && (
        <div className="mb-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
          <div className="flex items-center gap-2 mb-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">缺人班次 ({report.missing_slots.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {report.missing_slots.slice(0, 10).map((slot) => (
              <div key={`${slot.date}-${slot.slot_code}`} className="text-xs bg-destructive/20 text-destructive px-2 py-1 rounded" title={SLOT_INFO[slot.slot_code].time}>
                {formatDisplayDate(slot.date)} {SLOT_INFO[slot.slot_code].short}
              </div>
            ))}
            {report.missing_slots.length > 10 && (
              <span className="text-xs text-muted-foreground">
                還有 {report.missing_slots.length - 10} 個...
              </span>
            )}
          </div>
        </div>
      )}

      {/* WE_PM Balance */}
      {(report.we_pm_balance.most || report.we_pm_balance.least) && (
        <div className="mb-4 p-3 bg-secondary rounded-lg">
          <div className="text-sm font-medium mb-2">假日晚班 (WE_PM) 分配</div>
          <div className="flex gap-4 text-sm">
            {report.we_pm_balance.most && (
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-warning" />
                <span>最多: {report.we_pm_balance.most.member.name} ({report.we_pm_balance.most.count}次)</span>
              </div>
            )}
            {report.we_pm_balance.least && (
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-success" />
                <span>最少: {report.we_pm_balance.least.member.name} ({report.we_pm_balance.least.count}次)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Member Stats Table：實排/目標；目標＝每人平均（該班型或總格數 ÷ 排班人數） */}
      <div className="overflow-x-auto">
        <p className="text-[10px] text-muted-foreground mb-1">格內 實排/目標。目標＝每人平均：單欄＝該班型格數÷人數；總計＝全部班別格數加總÷人數（均以本表當月為準）</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">成員</TableHead>
              {slotCodes.map(code => (
                <TableHead key={code} className="text-center w-16">
                  <SlotBadge slotCode={code} />
                </TableHead>
              ))}
              <TableHead className="text-center w-16">總計</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.member_stats.map(({ member, assigned, target }) => {
              const total = Object.values(assigned).reduce((a, b) => a + b, 0);
              const targetTotal = Object.values(target).reduce((a, b) => a + b, 0);
              const totalSlots = Object.values(report.slot_counts).reduce((a, b) => a + b, 0);

              return (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.id} {member.name}</TableCell>
                  {slotCodes.map(code => (
                      <TableCell key={code} className="text-center">
                        <span>{assigned[code]}</span>
                        <span className="text-[10px] text-muted-foreground ml-0.5" title={`目標（每人平均）= ${report.slot_counts[code]} 格 ÷ ${report.eligible_count} 人 = ${target[code].toFixed(2)}`}>
                          /{target[code].toFixed(2)}
                        </span>
                      </TableCell>
                    ))}
                  <TableCell className="text-center font-medium">
                    {total}
                    <span className="text-[10px] text-muted-foreground ml-0.5" title={`目標（每人平均總班數）= 全部班別格數加總 ${totalSlots} ÷ ${report.eligible_count} 人 = ${targetTotal.toFixed(2)}`}>
                      /{targetTotal.toFixed(2)}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Next Month Carry Preview：累計至本月底，每個月延續 */}
      {report.next_month_carry.length > 0 && (
        <div className="mt-4 p-3 bg-secondary/50 rounded-lg">
          <div className="text-sm font-medium mb-2">下月 Carry 預估（累計，每月延續）</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {report.next_month_carry
              .filter(c => Math.abs(c.total) > 0.5)
              .slice(0, 6)
              .map(({ member, total }) => (
                <div key={member.id} className="flex items-center justify-between">
                  <span>{member.name}</span>
                  <span className={total > 0 ? "text-warning" : "text-success"}>
                    {total > 0 ? `欠 ${total.toFixed(1)}` : `超 ${Math.abs(total).toFixed(1)}`}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
