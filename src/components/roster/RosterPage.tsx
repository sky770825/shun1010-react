import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, addMonths, subMonths, addDays, subDays, parseISO, startOfMonth, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { zhTW } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Sparkles, RefreshCw, Trash2, RotateCcw, Lock, Unlock, Settings, Calendar, CalendarRange, List, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge, MissingBadge } from "@/components/ui/status-badge";
import { SlotBadge } from "@/components/ui/slot-badge";
import { GlassCard } from "@/components/ui/glass-card";
import { cn, formatMonth, getSlotCodesForDay } from "@/lib/utils";
import { SLOT_INFO } from "@/lib/constants";
import type { RosterSlot, SlotCode } from "@/types";
import { getRosterSlots, getAllRosterSlots, getMembers, getMonthStatus, publishMonth, lockMonth, unlockMonth, clearMonthDraft, setRosterSlot, isAvailable } from "@/services/dataService";
import { generateSchedule, regenerateSchedule, getScheduleReport } from "@/services/schedulerEngine";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScheduleReport } from "./ScheduleReport";
import { exportRosterToCsv, importRosterFromCsv } from "@/lib/rosterExport";
import { RosterListDesktop, RosterListMobile } from "./RosterListTable";
import { RosterMonthDesktop, RosterMonthMobile } from "./RosterMonthView";
import { RosterWeekDesktop, RosterWeekMobile } from "./RosterWeekView";
import { RuleLibrary } from "./RuleLibrary";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type ViewMode = 'month' | 'week' | 'list';

export function RosterPage() {
  const [currentMonth, setCurrentMonth] = useState(() => formatMonth(new Date()));
  const [refreshKey, setRefreshKey] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [weekStart, setWeekStart] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [listFilter, setListFilter] = useState<'all' | 'missing'>('all');
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; slotCode: SlotCode } | null>(null);
  const [actionsCollapsed, setActionsCollapsed] = useState(false);
  const [rosterCollapsed, setRosterCollapsed] = useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [openRegenerate, setOpenRegenerate] = useState(false);
  const [openClearDraft, setOpenClearDraft] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const refresh = () => setRefreshKey(k => k + 1);

  // 本週時：操作、狀態、缺格數以「該週起始日所屬月份」為準，與月曆鎖定同步；列表/月曆以 currentMonth 為準
  const operationMonth = viewMode === 'week' ? formatMonth(weekStart) : currentMonth;
  const isDateLocked = (date: string) => getMonthStatus(formatMonth(date)) === 'locked';

  const monthStatus = useMemo(() => getMonthStatus(operationMonth), [operationMonth, refreshKey]);
  const slots = useMemo(() => getRosterSlots(currentMonth), [currentMonth, refreshKey]);
  const members = useMemo(() => getMembers(), [refreshKey]);
  const rosterMembers = useMemo(() => members.filter(m => m.is_active && !m.exclude_roster), [members]);
  const { data: report } = useQuery({
    queryKey: ["scheduleReport", operationMonth, refreshKey],
    queryFn: () => getScheduleReport(operationMonth),
  });
  const [candidates, setCandidates] = useState<Array<{ member: (typeof members)[0]; available: boolean; reason?: string }>>([]);
  useEffect(() => {
    if (!selectedSlot) {
      setCandidates([]);
      return;
    }
    const roster = members.filter(m => m.is_active && !m.exclude_roster);
    const list = roster.map(m => {
      const av = isAvailable(m.id, selectedSlot.date, selectedSlot.slotCode);
      return { member: m, available: av.available, reason: av.reason };
    });
    setCandidates(list);
  }, [selectedSlot, members]);

  // 本週 7 天的 slots（跨月時用 getAllRosterSlots）
  const weekSlots = useMemo(() => {
    const end = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');
    return getAllRosterSlots().filter(s => s.date >= weekStart && s.date <= end);
  }, [weekStart, refreshKey]);

  const weekDays = useMemo(() => {
    return [0, 1, 2, 3, 4, 5, 6].map(i => format(addDays(parseISO(weekStart), i), 'yyyy-MM-dd'));
  }, [weekStart]);

  const missingCount = viewMode === 'week'
    ? weekSlots.filter(s => !s.assignee_id).length
    : slots.filter(s => !s.assignee_id).length;
  const isLocked = monthStatus === 'locked';

  // 列表用：當月班次，可篩選僅缺人，依日期與班別排序
  const slotOrder: Record<string, number> = { WD_AM: 0, WD_PM: 1, WE_AM: 2, WE_MD: 3, WE_PM: 4 };
  const listRows = useMemo(() => {
    let rows = slots
      .filter(s => getSlotCodesForDay(s.date).includes(s.slot_code))
      .map(s => ({ ...s, isMissing: !s.assignee_id }));
    if (listFilter === 'missing') rows = rows.filter(r => r.isMissing);
    return rows.sort((a, b) => a.date.localeCompare(b.date) || (slotOrder[a.slot_code] ?? 0) - (slotOrder[b.slot_code] ?? 0));
  }, [slots, listFilter]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(parseISO(`${currentMonth}-01`));
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(addMonths(monthStart, 1), { weekStartsOn: 0 });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd }).slice(0, 42);
  }, [currentMonth]);

  const getDaySlotsData = (date: string, slotsSource = slots): Array<{ slotCode: SlotCode; assignee: string | null; isMissing: boolean }> => {
    const dayCodes = getSlotCodesForDay(date);
    return dayCodes.map(slotCode => {
      const slot = slotsSource.find(s => s.date === date && s.slot_code === slotCode);
      return {
        slotCode,
        assignee: slot?.assignee_id || null,
        isMissing: slot ? slot.assignee_id === null : true,
      };
    });
  };

  const handleSlotAssign = (date: string, slotCode: SlotCode, memberId: string | null) => {
    if (isDateLocked(date)) return;
    setRosterSlot(date, slotCode, memberId, { status: "draft" });
    refresh();
    toast({ title: memberId ? "已換班" : "已清除" });
  };

  const handleSubstituteToggle = (checked: boolean) => {
    if (!selectedSlot || isDateLocked(selectedSlot.date)) return;
    const slotSource = viewMode === "week" ? weekSlots : slots;
    const cur = slotSource.find(s => s.date === selectedSlot.date && s.slot_code === selectedSlot.slotCode);
    if (!cur?.assignee_id) return;
    setRosterSlot(selectedSlot.date, selectedSlot.slotCode, cur.assignee_id, {
      is_substitute: checked,
      original_assignee_id: checked ? cur.assignee_id : null,
      status: "draft",
    });
    refresh();
    toast({ title: checked ? "已標記為代班" : "已取消代班" });
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const result = await generateSchedule(operationMonth);
      setShowReport(true);
      refresh();
      toast({
        title: "排班完成",
        description: result.missingCount > 0 
          ? `已生成排班，但有 ${result.missingCount} 個缺人班次` 
          : "已成功生成完整排班",
      });
    } catch (error) {
      console.error("generateSchedule error:", error);
      toast({
        title: "排班失敗",
        description: "生成排班時發生錯誤",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    setOpenRegenerate(false);
    try {
      const result = await regenerateSchedule(operationMonth);
      setShowReport(true);
      refresh();
      toast({
        title: "重新排班完成",
        description: result.missingCount > 0 
          ? `已重新生成排班，但有 ${result.missingCount} 個缺人班次` 
          : "已成功重新生成完整排班",
      });
    } catch (error) {
      console.error("regenerateSchedule error:", error);
      toast({
        title: "排班失敗",
        description: "重新生成排班時發生錯誤",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleClearDraft = () => {
    clearMonthDraft(operationMonth);
    setOpenClearDraft(false);
    refresh();
    toast({ title: "已清空草稿", description: "本月草稿排班已清除" });
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const res = importRosterFromCsv(text);
      if (res.errors.length > 0) {
        toast({ title: "匯入有誤", description: res.errors[0], variant: "destructive" });
      } else {
        toast({
          title: `已匯入 ${res.month}`,
          description: `成功 ${res.imported} 筆，略過 ${res.skipped} 筆`,
        });
        if (res.imported > 0) {
          if (res.month !== currentMonth) setCurrentMonth(res.month);
          refresh();
        }
      }
      e.target.value = '';
    };
    reader.readAsText(f, 'UTF-8');
  };

  const handlePublish = async () => {
    await publishMonth(operationMonth);
    lockMonth(operationMonth);
    refresh();
    toast({ title: "已發布並鎖定", description: "本月排班已發布並鎖定" });
  };

  const handleUnlock = () => {
    unlockMonth(operationMonth);
    refresh();
    toast({ title: "已解鎖", description: "本月排班已解鎖，可以編輯" });
  };

  return (
    <div className="px-4">
      <PageHeader 
        title="排班管理" 
        subtitle={viewMode === 'week' 
          ? `${format(parseISO(weekStart), 'M/d', { locale: zhTW })}－${format(addDays(parseISO(weekStart), 6), 'M/d', { locale: zhTW })}` 
          : format(parseISO(`${currentMonth}-01`), "yyyy年M月", { locale: zhTW })}
      >
        <Sheet open={showRules} onOpenChange={setShowRules}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="rounded-full">
              <Settings className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>規則庫設定</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <RuleLibrary onClose={() => setShowRules(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </PageHeader>

      {/* View Tabs: 月曆 | 本週 | 列表 */}
      <div className="flex rounded-lg border border-border bg-muted/30 p-0.5 mb-4">
        <button
          type="button"
          onClick={() => setViewMode('month')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-colors",
            viewMode === 'month' ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Calendar className="w-4 h-4" />
          月曆
        </button>
        <button
          type="button"
          onClick={() => setViewMode('week')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-colors",
            viewMode === 'week' ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <CalendarRange className="w-4 h-4" />
          本週
        </button>
        <button
          type="button"
          onClick={() => setViewMode('list')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-colors",
            viewMode === 'list' ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <List className="w-4 h-4" />
          列表
        </button>
      </div>

      {/* 月曆 / 列表：月份導航；本週：週導航 */}
      <div className="flex items-center justify-between mb-4">
        {viewMode === 'week' ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setWeekStart(format(subDays(parseISO(weekStart), 7), 'yyyy-MM-dd'))}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-lg font-semibold min-w-[140px] text-center">
              {format(parseISO(weekStart), 'M/d', { locale: zhTW })}－{format(addDays(parseISO(weekStart), 6), 'M/d', { locale: zhTW })}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setWeekStart(format(addDays(parseISO(weekStart), 7), 'yyyy-MM-dd'))}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(formatMonth(subMonths(parseISO(`${currentMonth}-01`), 1)))}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-lg font-semibold min-w-[100px] text-center">
              {format(parseISO(`${currentMonth}-01`), "M月", { locale: zhTW })}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(formatMonth(addMonths(parseISO(`${currentMonth}-01`), 1)))}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <StatusBadge variant={monthStatus}>{monthStatus === 'draft' ? '草稿' : monthStatus === 'published' ? '已發布' : '已鎖定'}</StatusBadge>
          {missingCount > 0 && <MissingBadge count={missingCount} />}
        </div>
      </div>

      {/* Action Buttons：可收合，預設展開 */}
      <div className="mb-4 rounded-lg border border-border bg-muted/20 overflow-hidden">
        <button
          type="button"
          onClick={() => setActionsCollapsed((c) => !c)}
          className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
        >
          <span>操作</span>
          {actionsCollapsed ? (
            <ChevronDown className="w-4 h-4 shrink-0" />
          ) : (
            <ChevronUp className="w-4 h-4 shrink-0" />
          )}
        </button>
        {!actionsCollapsed && (
          <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-0">
            <Button 
              onClick={handleGenerate} 
              className="gap-2"
              disabled={monthStatus === 'locked' || isGenerating}
              title={monthStatus === 'locked' ? '本月已鎖定，請先解鎖' : undefined}
            >
              <Sparkles className="w-4 h-4" />
              {isGenerating ? "生成中…" : "自動生成"}
            </Button>
            <AlertDialog open={openRegenerate} onOpenChange={setOpenRegenerate}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={monthStatus === 'locked' || isRegenerating} title={monthStatus === 'locked' ? '本月已鎖定，請先解鎖' : undefined}>
                  <RefreshCw className="w-4 h-4" />
                  {isRegenerating ? "生成中…" : "重新生成"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>確定重新生成？</AlertDialogTitle>
                  <AlertDialogDescription>
                    這將清除本月所有草稿排班並重新生成。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleRegenerate()}>確定</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            <AlertDialog open={openClearDraft} onOpenChange={setOpenClearDraft}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-destructive" disabled={monthStatus === 'locked'} title={monthStatus === 'locked' ? '本月已鎖定，請先解鎖' : undefined}>
                  <Trash2 className="w-4 h-4" />
                  清空草稿
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>確定清空草稿？</AlertDialogTitle>
                  <AlertDialogDescription>
                    這將清除本月所有草稿排班，已發布的不受影響。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearDraft}>確定清空</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleImportCsv}
              aria-label="匯入 CSV"
            />
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
              title="CSV 需含：年月、日期、班别、成员ID；匯入至 CSV 所標月份，該月若已鎖定則不匯入"
            >
              <Upload className="w-4 h-4" />
              匯入 CSV
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                exportRosterToCsv(currentMonth, slots, members);
                toast({ title: `已匯出 ${currentMonth} 排班表` });
              }}
            >
              <Download className="w-4 h-4" />
              匯出 CSV
            </Button>

            {monthStatus === 'locked' ? (
              <Dialog open={unlockDialogOpen} onOpenChange={(o) => { setUnlockDialogOpen(o); if (!o) setUnlockPassword(""); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Unlock className="w-4 h-4" />
                    解鎖
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>解鎖</DialogTitle>
                    <DialogDescription>請輸入密碼以解鎖本月排班。</DialogDescription>
                  </DialogHeader>
                  <div className="py-2">
                    <Input
                      type="password"
                      placeholder="密碼"
                      value={unlockPassword}
                      onChange={(e) => setUnlockPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (unlockPassword === "8888") {
                            handleUnlock();
                            setUnlockDialogOpen(false);
                            setUnlockPassword("");
                          } else {
                            toast({ title: "密碼錯誤", variant: "destructive" });
                          }
                        }
                      }}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setUnlockDialogOpen(false); setUnlockPassword(""); }}>取消</Button>
                    <Button
                      onClick={() => {
                        if (unlockPassword === "8888") {
                          handleUnlock();
                          setUnlockDialogOpen(false);
                          setUnlockPassword("");
                        } else {
                          toast({ title: "密碼錯誤", variant: "destructive" });
                        }
                      }}
                    >
                      確定解鎖
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="default" className="gap-2 bg-success hover:bg-success/90">
                    <Lock className="w-4 h-4" />
                    發布鎖定
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>確定發布並鎖定？</AlertDialogTitle>
                    <AlertDialogDescription>
                      發布後本月排班將無法編輯，需要解鎖才能修改。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={handlePublish}>確定發布</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      {/* 成員對照：可收合，預設展開 */}
      <div className="mb-4 rounded-lg border border-border bg-muted/20 overflow-hidden">
        <button
          type="button"
          onClick={() => setRosterCollapsed((c) => !c)}
          className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
        >
          <span>成員對照</span>
          {rosterCollapsed ? (
            <ChevronDown className="w-4 h-4 shrink-0" />
          ) : (
            <ChevronUp className="w-4 h-4 shrink-0" />
          )}
        </button>
        {!rosterCollapsed && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-3 pt-0">
            {[...rosterMembers]
              .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
              .map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center rounded-md border border-border/70 bg-background/80 px-2 py-0.5 text-xs"
                >
                  <span className="font-semibold text-foreground tabular-nums mr-1">{m.id}</span>
                  <span className="text-muted-foreground">{m.name}</span>
                </span>
              ))}
          </div>
        )}
      </div>

      {/* 列表：篩選 全部 | 僅缺人 */}
      {viewMode === 'list' && (
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setListFilter('all')}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md border transition-colors",
              listFilter === 'all' ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"
            )}
          >
            全部
          </button>
          <button
            type="button"
            onClick={() => setListFilter('missing')}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md border transition-colors",
              listFilter === 'missing' ? "bg-destructive text-destructive-foreground border-destructive" : "border-border hover:bg-muted/50"
            )}
          >
            僅缺人
          </button>
        </div>
      )}

      {/* 換班：頁面內區塊（無彈窗） */}
      {selectedSlot && !isDateLocked(selectedSlot.date) && (
        <GlassCard className="mb-4 p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-sm font-medium">換班：{format(parseISO(selectedSlot.date), "M/d")} {SLOT_INFO[selectedSlot.slotCode].label}</span>
            <Button size="sm" variant="outline" onClick={() => handleSlotAssign(selectedSlot.date, selectedSlot.slotCode, null)}>清除（缺人）</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedSlot(null)}>取消</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map(({ member, available, reason }) => (
              available ? (
                <Button key={member.id} size="sm" variant="secondary" className="h-7 text-xs" onClick={() => handleSlotAssign(selectedSlot.date, selectedSlot.slotCode, member.id)}>{member.id} {member.name}</Button>
              ) : (
                <span key={member.id} className="inline-flex items-center rounded-md border px-2 py-1 text-xs opacity-50" title={reason}>{member.id} {member.name}</span>
              )
            ))}
          </div>
          {(() => {
            const slotSource = viewMode === "week" ? weekSlots : slots;
            const cur = slotSource.find(s => s.date === selectedSlot.date && s.slot_code === selectedSlot.slotCode);
            return cur?.assignee_id ? (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                <Switch id="swap-sub" checked={!!cur?.is_substitute} onCheckedChange={handleSubstituteToggle} />
                <Label htmlFor="swap-sub" className="text-sm">標記為代班</Label>
              </div>
            ) : null;
          })()}
        </GlassCard>
      )}

      {/* 本週班表：網頁版與手機／平板版完全分離 */}
      {viewMode === "week" &&
        (isMobile ? (
          <RosterWeekMobile
            weekDays={weekDays}
            weekSlots={weekSlots}
            getDaySlotsData={getDaySlotsData}
            isDateLocked={isDateLocked}
            selectedSlot={selectedSlot}
            setSelectedSlot={setSelectedSlot}
          />
        ) : (
          <RosterWeekDesktop
            weekDays={weekDays}
            weekSlots={weekSlots}
            getDaySlotsData={getDaySlotsData}
            isDateLocked={isDateLocked}
            selectedSlot={selectedSlot}
            setSelectedSlot={setSelectedSlot}
          />
        ))}

      {/* 列表班表：網頁版與手機版完全分離 */}
      {viewMode === 'list' && (
        <GlassCard className="mb-4">
          {listRows.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {listFilter === 'missing' ? '本月份無缺人班次' : '本月尚無排班'}
            </div>
          ) : isMobile ? (
            <RosterListMobile
              rows={listRows}
              isLocked={isLocked}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
            />
          ) : (
            <RosterListDesktop
              rows={listRows}
              isLocked={isLocked}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
            />
          )}
        </GlassCard>
      )}

      {/* 月曆：網頁版與手機／平板版完全分離 */}
      {viewMode === "month" &&
        (isMobile ? (
          <RosterMonthMobile
            calendarDays={calendarDays}
            currentMonth={currentMonth}
            getDaySlotsData={getDaySlotsData}
            isLocked={isLocked}
            selectedSlot={selectedSlot}
            setSelectedSlot={setSelectedSlot}
          />
        ) : (
          <RosterMonthDesktop
            calendarDays={calendarDays}
            currentMonth={currentMonth}
            getDaySlotsData={getDaySlotsData}
            isLocked={isLocked}
            selectedSlot={selectedSlot}
            setSelectedSlot={setSelectedSlot}
          />
        ))}

      {/* Report Section：鎖定後自動隱藏 */}
      {showReport && report && (viewMode === 'week' ? weekSlots.length : slots.length) > 0 && !isLocked && (
        <ScheduleReport 
          report={report} 
          month={operationMonth}
          onClose={() => setShowReport(false)} 
        />
      )}
    </div>
  );
}
