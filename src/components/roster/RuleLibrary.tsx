import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Calendar, CalendarRange, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { GlassCard } from "@/components/ui/glass-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WEEKDAY_NAMES_FULL, SLOT_INFO, SHIFT_TEMPLATES } from "@/lib/constants";
import { getMembers, getRules, upsertRule, deleteRule, deleteRules, toggleRuleActive, findWeeklyRule, estimateAvailableSlots, getSameDayPairs, setSameDayPairs, applyDefaultAvailabilityRules } from "@/services/dataService";
import { formatMonth } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { AvailabilityRule, SlotCode, Member } from "@/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RuleLibraryProps {
  onClose: () => void;
}

const SLOT_LABELS: Record<SlotCode | 'any', string> = {
  any: '全部',
  WD_AM: '平日早',
  WD_PM: '平日晚',
  WE_AM: '假日早',
  WE_MD: '假日午',
  WE_PM: '假日晚',
};

export function RuleLibrary({ onClose }: RuleLibraryProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);
  const { toast } = useToast();

  const handleApplyDefaults = async () => {
    const n = await applyDefaultAvailabilityRules();
    refresh();
    toast({
      title: n > 0 ? `已套用 ${n} 筆常順預設不可排` : '無需套用',
      description: n > 0 ? '盈橙、大同、子菲、濬瑒 週一；秀華、志桓 週二；秋屏、林鋒、珈瑜 週五。' : '上述成員的該日已有規則。',
    });
  };

  return (
    <Tabs defaultValue="weekly" className="w-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-muted-foreground">
          設定成員的<strong>不可排班時段</strong>，自動排班時會避開這些規則。
        </p>
        <Button type="button" variant="outline" size="sm" onClick={handleApplyDefaults}>
          套用常順預設（週一／二／五不可排）
        </Button>
      </div>
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="weekly" className="text-xs">每週</TabsTrigger>
        <TabsTrigger value="date" className="text-xs">日期</TabsTrigger>
        <TabsTrigger value="range" className="text-xs">區間</TabsTrigger>
        <TabsTrigger value="list" className="text-xs">清單</TabsTrigger>
        <TabsTrigger value="sameday" className="text-xs">同天搭檔</TabsTrigger>
      </TabsList>
      
      <TabsContent value="weekly" className="mt-4">
        <WeeklyBuilder refreshKey={refreshKey} onRuleChange={refresh} slotLabels={SLOT_LABELS} />
      </TabsContent>
      
      <TabsContent value="date" className="mt-4">
        <DateBuilder onRuleChange={refresh} />
      </TabsContent>
      
      <TabsContent value="range" className="mt-4">
        <RangeBuilder onRuleChange={refresh} />
      </TabsContent>
      
      <TabsContent value="list" className="mt-4">
        <RulesTable refreshKey={refreshKey} onRuleChange={refresh} />
      </TabsContent>
      <TabsContent value="sameday" className="mt-4">
        <SameDayPairsEditor refreshKey={refreshKey} onRefresh={refresh} />
      </TabsContent>
    </Tabs>
  );
}

// Weekly Builder - Toggle grid per member
function WeeklyBuilder({ refreshKey, onRuleChange, slotLabels }: { refreshKey: number; onRuleChange: () => void; slotLabels: Record<SlotCode | 'any', string> }) {
  const { toast } = useToast();
  const members = useMemo(() => getMembers().filter(m => m.is_active), []);
  const { data: rulesData } = useQuery({
    queryKey: ["rules", "weekly", refreshKey],
    queryFn: async () => {
      const r = await getRules();
      return r.filter(x => x.rule_type === "weekly");
    },
  });
  const rules = rulesData ?? [];
  const [selectedMember, setSelectedMember] = useState<string>(members[0]?.id || '');
  const { data: estimateSlots } = useQuery({
    queryKey: ["estimateAvailableSlots", selectedMember, formatMonth(new Date())],
    queryFn: () => estimateAvailableSlots(selectedMember, formatMonth(new Date())),
    enabled: !!selectedMember,
  });
  
  const weekdays = [0, 1, 2, 3, 4, 5, 6]; // Sun-Sat
  const slotOptions: Array<SlotCode | 'any'> = ['any', 'WD_AM', 'WD_PM', 'WE_AM', 'WE_MD', 'WE_PM'];

  const isValidCombination = (weekday: number, slotCode: SlotCode | 'any'): boolean => {
    if (slotCode === 'any') return true;
    const isWeekend = weekday === 0 || weekday === 6;
    const isWeekendSlot = slotCode.startsWith('WE_');
    const isWeekdaySlot = slotCode.startsWith('WD_');
    
    if (isWeekend && isWeekdaySlot) return false;
    if (!isWeekend && isWeekendSlot) return false;
    return true;
  };

  // 勾選＝可排（無 blocked 規則）；不勾＝不可排（有 blocked 規則）
  const isChecked = (memberId: string, weekday: number, slotCode: SlotCode | 'any'): boolean => {
    return !rules.some(
      r => r.member_id === memberId &&
        r.rule_type === 'weekly' &&
        r.weekday === weekday &&
        r.slot_code === slotCode &&
        r.is_active
    );
  };

  const handleToggle = async (weekday: number, slotCode: SlotCode | 'any', checked: boolean) => {
    if (!selectedMember) return;
    if (!isValidCombination(weekday, slotCode)) {
      toast({ title: "無效組合", description: slotCode.startsWith('WD_') ? "平日班別不適用於週末" : "假日班別不適用於平日", variant: "destructive" });
      return;
    }
    const existing = await findWeeklyRule(selectedMember, weekday, slotCode);
    if (checked) {
      if (existing) {
        await deleteRule(existing.rule_id);
        toast({ title: "已設為可排" });
      }
    } else {
      if (!existing) {
        await upsertRule({
          member_id: selectedMember,
          rule_type: 'weekly',
          action: 'blocked',
          weekday,
          slot_code: slotCode,
          reason: `每${WEEKDAY_NAMES_FULL[weekday]}不可排`,
        });
        toast({ title: "已設為不可排" });
      } else if (!existing.is_active) {
        await toggleRuleActive(existing.rule_id, true);
        toast({ title: "已設為不可排" });
      }
    }
    onRuleChange();
  };

  const handleSelectAll = async () => {
    if (!selectedMember) return;
    const toDelete = rules.filter(r => r.member_id === selectedMember && r.rule_type === 'weekly');
    for (const r of toDelete) await deleteRule(r.rule_id);
    onRuleChange();
    toast({ title: "已全選", description: "全部可排班" });
  };

  const handleUnselectAll = async () => {
    if (!selectedMember) return;
    for (const d of weekdays) {
      for (const slot of slotOptions) {
        if (!isValidCombination(d, slot)) continue;
        const existing = await findWeeklyRule(selectedMember, d, slot);
        if (existing) {
          if (!existing.is_active) await toggleRuleActive(existing.rule_id, true);
        } else {
          await upsertRule({
            member_id: selectedMember,
            rule_type: 'weekly',
            action: 'blocked',
            weekday: d,
            slot_code: slot,
            reason: `每${WEEKDAY_NAMES_FULL[d]}不可排`,
          });
        }
      }
    }
    onRuleChange();
    toast({ title: "已全不選", description: "全部不可排班" });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>選擇成員</Label>
        <Select value={selectedMember} onValueChange={setSelectedMember}>
          <SelectTrigger>
            <SelectValue placeholder="選擇成員" />
          </SelectTrigger>
          <SelectContent>
            {members.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedMember && (
        <>
          <p className="text-xs text-muted-foreground">
            <strong>勾選＝可排班</strong>，<strong>不勾＝不可排班</strong>。可先按「全選」再取消少數，或「全不選」再勾選少數。灰色格子表示該班別不適用於該日。
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            依目前規則，此成員在當月（{formatMonth(new Date())}）約可排 <strong>{estimateSlots ?? "—"}</strong> 個班（僅供參考；可排愈少，自動排班能排給他的就愈少）。
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            <Button type="button" variant="outline" size="sm" onClick={handleSelectAll}>
              全選（全部可排）
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleUnselectAll}>
              全不選（全部不可排）
            </Button>
          </div>
          <GlassCard className="p-3 overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">每週可排班勾選：行=班別，列=星期，勾選=可排、不勾=不可排</caption>
              <thead>
                <tr>
                  <th className="text-left p-1.5 font-medium">班別</th>
                  {weekdays.map(d => (
                    <th key={d} className="text-center p-1 min-w-[32px] font-medium">
                      {WEEKDAY_NAMES_FULL[d].slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slotOptions.map(slot => (
                  <tr key={slot}>
                    <td className="p-1.5 font-medium" title={slot !== 'any' ? SLOT_INFO[slot].time : undefined}>
                      {slotLabels[slot]}
                    </td>
                  {weekdays.map(d => {
                    const valid = isValidCombination(d, slot);
                    const checked = isChecked(selectedMember, d, slot);
                    
                    return (
                      <td key={d} className="text-center p-1">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => handleToggle(d, slot, !!c)}
                          disabled={!valid}
                          className={!valid ? "opacity-20" : ""}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
            <p className="text-[10px] text-muted-foreground mt-2">勾選 ＝ 可排班　不勾 ＝ 不可排班</p>
        </GlassCard>
        </>
      )}
    </div>
  );
}

// Date Builder
function DateBuilder({ onRuleChange }: { onRuleChange: () => void }) {
  const { toast } = useToast();
  const members = useMemo(() => getMembers().filter(m => m.is_active), []);
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [dates, setDates] = useState<string>('');
  const [slotCode, setSlotCode] = useState<SlotCode | 'any'>('any');
  const [reason, setReason] = useState<string>('');

  const handleAdd = async () => {
    if (!selectedMember || !dates.trim()) {
      toast({ title: "請填寫完整資料", variant: "destructive" });
      return;
    }

    const dateList = dates.split(/[,\n]/).map(d => d.trim()).filter(Boolean);
    let added = 0;
    
    for (const date of dateList) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        await upsertRule({
          member_id: selectedMember,
          rule_type: 'date',
          action: 'blocked',
          date,
          slot_code: slotCode,
          reason: reason || `${date} 不可排`,
        });
        added++;
      }
    }

    if (added > 0) {
      toast({ title: `已新增 ${added} 筆日期規則` });
      setDates('');
      setReason('');
      onRuleChange();
    } else {
      toast({ title: "日期格式錯誤，請使用 YYYY-MM-DD", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>選擇成員</Label>
        <Select value={selectedMember} onValueChange={setSelectedMember}>
          <SelectTrigger>
            <SelectValue placeholder="選擇成員" />
          </SelectTrigger>
          <SelectContent>
            {members.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>日期 (YYYY-MM-DD，多筆用逗號或換行分隔)</Label>
        <Input
          value={dates}
          onChange={(e) => setDates(e.target.value)}
          placeholder="2026-01-25, 2026-01-26"
        />
      </div>

      <div>
        <Label>班別</Label>
        <Select value={slotCode} onValueChange={(v) => setSlotCode(v as SlotCode | 'any')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">全部班別</SelectItem>
            {Object.entries(SLOT_INFO).map(([code, info]) => (
              <SelectItem key={code} value={code} title={info.time}>{info.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>原因 (選填)</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例：請假"
        />
      </div>

      <Button onClick={handleAdd} className="w-full gap-2">
        <Plus className="w-4 h-4" />
        新增日期規則
      </Button>
    </div>
  );
}

// Range Builder
function RangeBuilder({ onRuleChange }: { onRuleChange: () => void }) {
  const { toast } = useToast();
  const members = useMemo(() => getMembers().filter(m => m.is_active), []);
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [slotCode, setSlotCode] = useState<SlotCode | 'any'>('any');
  const [reason, setReason] = useState<string>('');

  const handleAdd = async () => {
    if (!selectedMember || !startDate || !endDate) {
      toast({ title: "請填寫完整資料", variant: "destructive" });
      return;
    }

    if (startDate > endDate) {
      toast({ title: "開始日期不可大於結束日期", variant: "destructive" });
      return;
    }

    await upsertRule({
      member_id: selectedMember,
      rule_type: 'range',
      action: 'blocked',
      start_date: startDate,
      end_date: endDate,
      slot_code: slotCode,
      reason: reason || `${startDate} ~ ${endDate} 不可排`,
    });

    toast({ title: "已新增區間規則" });
    setStartDate('');
    setEndDate('');
    setReason('');
    onRuleChange();
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>選擇成員</Label>
        <Select value={selectedMember} onValueChange={setSelectedMember}>
          <SelectTrigger>
            <SelectValue placeholder="選擇成員" />
          </SelectTrigger>
          <SelectContent>
            {members.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>開始日期</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <Label>結束日期</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label>班別</Label>
        <Select value={slotCode} onValueChange={(v) => setSlotCode(v as SlotCode | 'any')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">全部班別</SelectItem>
            {Object.entries(SLOT_INFO).map(([code, info]) => (
              <SelectItem key={code} value={code} title={info.time}>{info.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>原因 (選填)</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例：出差"
        />
      </div>

      <Button onClick={handleAdd} className="w-full gap-2">
        <Plus className="w-4 h-4" />
        新增區間規則
      </Button>
    </div>
  );
}

// 同天搭檔：此兩人須排同一天（19&25、12&13、09&10 等）
function SameDayPairsEditor({ refreshKey, onRefresh }: { refreshKey: number; onRefresh: () => void }) {
  const { toast } = useToast();
  const members = useMemo(() => getMembers().filter(m => m.is_active && !m.exclude_roster), []);
  const pairs = useMemo(() => getSameDayPairs(), [refreshKey]);
  const [addA, setAddA] = useState<string>('');
  const [addB, setAddB] = useState<string>('');

  const getMemberName = (id: string) => members.find(m => m.id === id)?.name ?? id;

  const handleAdd = () => {
    if (!addA || !addB) {
      toast({ title: '請選擇兩位成員', variant: 'destructive' });
      return;
    }
    if (addA === addB) {
      toast({ title: '兩人不可相同', variant: 'destructive' });
      return;
    }
    const exists = pairs.some(([x, y]) => (x === addA && y === addB) || (x === addB && y === addA));
    if (exists) {
      toast({ title: '此搭檔已存在', variant: 'destructive' });
      return;
    }
    setSameDayPairs([...pairs, [addA, addB]]);
    setAddA('');
    setAddB('');
    onRefresh();
    toast({ title: '已新增同天搭檔' });
  };

  const handleRemove = (index: number) => {
    setSameDayPairs(pairs.filter((_, i) => i !== index));
    onRefresh();
    toast({ title: '已移除同天搭檔' });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        設定<strong>須排同一天</strong>的兩人，自動排班時會盡量讓搭檔同天上班（且其中一人排某日時，另一人須能在該日其他時段排到，否則不排）。
      </p>
      <GlassCard className="p-3">
        <div className="space-y-2">
          {pairs.map(([a, b], i) => (
            <div key={`${a}-${b}-${i}`} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
              <span className="font-medium">{getMemberName(a)} & {getMemberName(b)}</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => handleRemove(i)} title="移除">
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          {pairs.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">尚未設定，可於下方新增。預設為 19&25、12&13、09&10（若從未儲存過）。</p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2 mt-4 pt-3 border-t">
          <div className="flex-1 min-w-[120px]">
            <Label className="text-xs">成員 A</Label>
            <Select value={addA} onValueChange={setAddA}>
              <SelectTrigger><SelectValue placeholder="選擇" /></SelectTrigger>
              <SelectContent>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-muted-foreground self-center pb-2">&</span>
          <div className="flex-1 min-w-[120px]">
            <Label className="text-xs">成員 B</Label>
            <Select value={addB} onValueChange={setAddB}>
              <SelectTrigger><SelectValue placeholder="選擇" /></SelectTrigger>
              <SelectContent>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={handleAdd} size="sm" className="gap-1">
            <Plus className="w-4 h-4" /> 新增
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}

// Rules Table：依成員分組、勾選、全選刪除、刪除顯示全部、刪除此成員全部
function RulesTable({ refreshKey, onRuleChange }: { refreshKey: number; onRuleChange: () => void }) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedMembers, setCollapsedMembers] = useState<Set<string>>(new Set());
  const [confirmModal, setConfirmModal] = useState<{ count: number; label?: string; onConfirm: () => void } | null>(null);
  const members = useMemo(() => getMembers(), []);
  const { data: rulesData } = useQuery({
    queryKey: ["rules", "all", refreshKey],
    queryFn: () => getRules(),
  });
  const rules = rulesData ?? [];

  const getMemberName = (id: string) => members.find(m => m.id === id)?.name || '?';

  const getRuleSummary = (rule: AvailabilityRule): string => {
    const slot = rule.slot_code === 'any' ? '全部' : SLOT_INFO[rule.slot_code as SlotCode].short;
    switch (rule.rule_type) {
      case 'weekly':
        return `每${WEEKDAY_NAMES_FULL[rule.weekday!]} ${slot}`;
      case 'date':
        return `${rule.date} ${slot}`;
      case 'range':
        return `${rule.start_date} ~ ${rule.end_date} ${slot}`;
      default:
        return '';
    }
  };

  const filteredRules = useMemo(() => rules.filter(r => {
    if (!search) return true;
    const memberName = getMemberName(r.member_id);
    return memberName.includes(search) || getRuleSummary(r).includes(search);
  }), [rules, search, members]);

  const grouped = useMemo(() => {
    const g: { memberId: string; memberName: string; rules: AvailabilityRule[] }[] = [];
    const map = new Map<string, AvailabilityRule[]>();
    filteredRules.forEach(r => {
      const arr = map.get(r.member_id) || [];
      arr.push(r);
      map.set(r.member_id, arr);
    });
    map.forEach((arr, memberId) => {
      g.push({ memberId, memberName: getMemberName(memberId), rules: arr });
    });
    g.sort((a, b) => a.memberName.localeCompare(b.memberName));
    return g;
  }, [filteredRules, members]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filteredRules.map(r => r.rule_id)));
  const unselectAll = () => setSelectedIds(new Set());
  const toggleGroup = (memberId: string) => {
    setCollapsedMembers(prev => { const s = new Set(prev); if (s.has(memberId)) s.delete(memberId); else s.add(memberId); return s; });
  };

  const runDelete = async (ids: string[], message: string) => {
    await deleteRules(ids);
    setSelectedIds(prev => { const s = new Set(prev); ids.forEach(i => s.delete(i)); return s; });
    toast({ title: message });
    onRuleChange();
    setConfirmModal(null);
  };

  const handleDeleteOne = (ruleId: string) => {
    setConfirmModal({
      count: 1,
      onConfirm: () => runDelete([ruleId], '已刪除規則'),
    });
  };

  const handleDeleteSelected = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setConfirmModal({
      count: ids.length,
      onConfirm: () => runDelete(ids, `已刪除所選 ${ids.length} 筆規則`),
    });
  };

  const handleDeleteFiltered = () => {
    const ids = filteredRules.map(r => r.rule_id);
    if (ids.length === 0) return;
    setConfirmModal({
      count: ids.length,
      onConfirm: () => runDelete(ids, `已刪除顯示的 ${ids.length} 筆規則`),
    });
  };

  const handleDeleteMember = (memberName: string, ids: string[]) => {
    if (ids.length === 0) return;
    setConfirmModal({
      count: ids.length,
      label: `${memberName} 的`,
      onConfirm: () => runDelete(ids, `已刪除 ${memberName} 的 ${ids.length} 筆規則`),
    });
  };

  const handleToggle = async (ruleId: string, isActive: boolean) => {
    await toggleRuleActive(ruleId, isActive);
    toast({ title: isActive ? "已啟用規則" : "已停用規則" });
    onRuleChange();
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        依成員分組顯示；可搜尋、勾選後批次刪除、或刪除顯示全部／此成員全部。
      </p>
      <Input
        placeholder="搜尋成員或規則..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={selectAll}>全選</Button>
        <Button type="button" variant="outline" size="sm" onClick={unselectAll}>取消全選</Button>
        {selectedCount > 0 && (
          <Button type="button" variant="outline" size="sm" className="text-destructive border-destructive/50 hover:bg-destructive/10" onClick={handleDeleteSelected}>
            刪除所選 ({selectedCount})
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" className="text-destructive border-destructive/50 hover:bg-destructive/10" onClick={handleDeleteFiltered} disabled={filteredRules.length === 0}>
          刪除顯示全部 ({filteredRules.length})
        </Button>
      </div>

      <div className="space-y-3 max-h-[380px] overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">尚無規則</div>
        ) : (
          grouped.map(({ memberId, memberName, rules: groupRules }) => {
            const collapsed = collapsedMembers.has(memberId);
            return (
              <GlassCard key={memberId} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(memberId)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {collapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    <span className="font-medium">{memberName}</span>
                    <span className="text-xs text-muted-foreground">({groupRules.length})</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 h-8 text-xs"
                    onClick={(e) => { e.stopPropagation(); handleDeleteMember(memberName, groupRules.map(r => r.rule_id)); }}
                  >
                    刪除此成員全部
                  </Button>
                </button>
                {!collapsed && (
                  <div className="border-t border-border/60 divide-y divide-border/40">
                    {groupRules.map(rule => (
                      <div key={rule.rule_id} className="flex items-center gap-2 px-3 py-2 bg-background/30">
                        <Checkbox
                          checked={selectedIds.has(rule.rule_id)}
                          onCheckedChange={() => toggleSelect(rule.rule_id)}
                        />
                        <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                          rule.rule_type === 'weekly' ? 'bg-sky-100 text-sky-700' :
                          rule.rule_type === 'date' ? 'bg-violet-100 text-violet-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {rule.rule_type === 'weekly' ? '每週' : rule.rule_type === 'date' ? '日期' : '區間'}
                        </span>
                        <span className="text-sm text-muted-foreground truncate flex-1 min-w-0" title={rule.slot_code !== 'any' ? SLOT_INFO[rule.slot_code as SlotCode]?.time : undefined}>
                          {getRuleSummary(rule)}
                          {rule.reason && ` · ${rule.reason}`}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggle(rule.rule_id, !rule.is_active)}>
                            {rule.is_active ? <ToggleRight className="w-4 h-4 text-success" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteOne(rule.rule_id)} aria-label="刪除">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            );
          })
        )}
      </div>

      <AlertDialog open={!!confirmModal} onOpenChange={(open) => !open && setConfirmModal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除？</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmModal ? (confirmModal.label ? `確定刪除 ${confirmModal.label} ${confirmModal.count} 筆規則？` : `確定刪除 ${confirmModal.count} 筆規則？`) : ''} 此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmModal?.onConfirm()}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
