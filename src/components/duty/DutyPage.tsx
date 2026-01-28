import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, subDays, isSameDay } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Key, User, Building2, Plus, Check, RotateCcw, AlertCircle, Search, Users, XCircle, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge, PartnerBadge } from "@/components/ui/status-badge";
import { SlotBadge } from "@/components/ui/slot-badge";
import { GlassCard } from "@/components/ui/glass-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, getSlotCodesForDay, formatDate } from "@/lib/utils";
import { SLOT_INFO, PARTNER_COMPANIES } from "@/lib/constants";
import type { Lending, LendingItem, Member, SlotCode } from "@/types";
import {
  getMembers, 
  getRosterSlots, 
  getKeys, 
  upsertKey,
  createLending, 
  listLendings, 
  markReturned, 
  confirmDuty,
  getTempDuty,
  setTempDuty,
  clearTempDuty,
  getKeyItemHistory,
} from "@/services/dataService";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
export function DutyPage({ onNavigateToRoster }: { onNavigateToRoster?: () => void } = {}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayDisplay = format(new Date(), "M月d日 (EEEE)", { locale: zhTW });
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'out' | 'returned'>('all');
  const [showTempDutySheet, setShowTempDutySheet] = useState(false);
  const [localTempOverrides, setLocalTempOverrides] = useState<Partial<Record<SlotCode, string>>>({});
  const [showAddKeyDialog, setShowAddKeyDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  
  // 內嵌表單狀態（不再使用彈窗）
  const [borrowerType, setBorrowerType] = useState<"member" | "partner">("member");
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [partnerCompanySelect, setPartnerCompanySelect] = useState<string>("");
  const [partnerCompanyCustom, setPartnerCompanyCustom] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [partnerContact, setPartnerContact] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [customKeysInput, setCustomKeysInput] = useState("");
  const [note, setNote] = useState("");
  
  const { toast } = useToast();

  const refresh = () => setRefreshKey(k => k + 1);
  const viewDateStr = format(viewDate, 'yyyy-MM-dd');

  const members = useMemo(() => getMembers().filter(m => m.is_active), [refreshKey]);
  const todaySlots = useMemo(() => {
    const month = today.substring(0, 7);
    return getRosterSlots(month).filter(s => s.date === today);
  }, [today, refreshKey]);
  const { data: tempDutyData } = useQuery({
    queryKey: ["tempDuty", today, refreshKey],
    queryFn: () => getTempDuty(today),
  });
  const tempDuty = tempDutyData ?? {};
  const hasTempDuty = Object.keys(tempDuty).some(k => tempDuty[k as SlotCode]);

  const todaySlotCodes = getSlotCodesForDay(today);

  // 同步臨時代班 Sheet 的本地選項（開啟時從 tempDuty 載入；須於 tempDuty 定義之後）
  useEffect(() => {
    if (showTempDutySheet) {
      const slots = getSlotCodesForDay(today);
      const o: Partial<Record<SlotCode, string>> = {};
      slots.forEach(slot => { o[slot] = tempDuty[slot] || ''; });
      setLocalTempOverrides(o);
    }
  }, [showTempDutySheet, today, tempDuty]);

  const { data: lendingsData } = useQuery({
    queryKey: ["lendings", refreshKey, statusFilter, searchQuery, viewDateStr],
    queryFn: () => listLendings({
      status: statusFilter === 'all' ? 'all' : statusFilter,
      search: searchQuery || undefined,
      date: viewDateStr,
    }),
  });
  const lendings = lendingsData ?? [];

  const getMemberName = (id: string | null | undefined) => {
    if (!id) return null;
    return members.find(m => m.id === id)?.name || '?';
  };

  const getTodayDuty = (): Array<{ slotCode: SlotCode; member: Member | null; isMissing: boolean }> => {
    return todaySlotCodes.map(slotCode => {
      const overrideId = tempDuty[slotCode];
      const member = overrideId
        ? members.find(m => m.id === overrideId) || null
        : (() => {
            const slot = todaySlots.find(s => s.slot_code === slotCode);
            return slot?.assignee_id ? members.find(m => m.id === slot.assignee_id) || null : null;
          })();
      return { slotCode, member, isMissing: !member };
    });
  };

  const dutyList = getTodayDuty();
  const hasMissing = dutyList.some(d => d.isMissing);

  const openLending = (tab: 'member' | 'partner' | null, memberId: string | null) => {
    if (tab) setBorrowerType(tab);
    if (memberId) setSelectedMember(memberId);
  };
  
  const keys = useMemo(() => getKeys().filter((k) => k.is_active), [refreshKey]);
  const { data: keyHistory = [] } = useQuery({
    queryKey: ["keyItemHistory", refreshKey],
    queryFn: () => getKeyItemHistory(),
  });
  
  const toggleKey = (keyId: string) => {
    setSelectedKeys(prev => 
      prev.includes(keyId) 
        ? prev.filter(k => k !== keyId)
        : [...prev, keyId]
    );
  };
  
  const handleSubmitLending = async () => {
    const partnerCompanyVal = partnerCompanySelect === '其它' ? partnerCompanyCustom : partnerCompanySelect;
    // Validate
    if (borrowerType === 'member' && !selectedMember) {
      toast({ title: "請選擇借用成員", variant: "destructive" });
      return;
    }
    if (borrowerType === 'partner' && (!partnerCompanyVal?.trim() || !partnerName.trim())) {
      toast({ title: "請填寫同業公司與姓名", variant: "destructive" });
      return;
    }
    if (selectedKeys.length === 0 && !customKeysInput.trim()) {
      toast({ title: "請選擇或輸入 Key", variant: "destructive" });
      return;
    }

    // Build items
    const items: Array<{ key_id?: string; key_name: string; qty?: number }> = [];
    
    // From selected keys
    selectedKeys.forEach(keyId => {
      const key = keys.find(k => k.key_id === keyId);
      if (key) {
        items.push({ key_id: keyId, key_name: key.key_name });
      }
    });

    // From custom input
    if (customKeysInput.trim()) {
      const customList = customKeysInput.split(/[,;\n]/).map(k => k.trim()).filter(Boolean);
      customList.forEach(keyName => {
        items.push({ key_name: keyName });
      });
    }

    // Create lending
    const borrowerName = borrowerType === 'member' 
      ? members.find(m => m.id === selectedMember)?.name || ''
      : partnerName;

    await createLending(
      {
        borrower_type: borrowerType,
        borrower_name: borrowerName,
        borrower_member_id: borrowerType === 'member' ? selectedMember : undefined,
        partner_company: borrowerType === 'partner' ? partnerCompanyVal : undefined,
        partner_contact: borrowerType === 'partner' ? partnerContact : undefined,
        note: note || undefined,
      },
      items
    );

    toast({ title: "借出成功", description: `已記錄 ${items.length} 個 Key` });
    
    // 重置表單
    setSelectedMember("");
    setPartnerCompanySelect("");
    setPartnerCompanyCustom("");
    setPartnerName("");
    setPartnerContact("");
    setSelectedKeys([]);
    setCustomKeysInput("");
    setNote("");
    
    refresh();
  };

  const handleAddKey = () => {
    if (!newKeyName.trim()) {
      toast({ title: "請輸入 Key 名稱", variant: "destructive" });
      return;
    }
    upsertKey({ key_name: newKeyName.trim() });
    setNewKeyName('');
    setShowAddKeyDialog(false);
    refresh();
    toast({ title: "已新增 Key" });
  };

  const handleSaveTempDuty = async () => {
    const overrides: Partial<Record<SlotCode, string>> = {};
    todaySlotCodes.forEach(slot => { overrides[slot] = localTempOverrides[slot] ?? ''; });
    await setTempDuty(today, overrides);
    refresh();
    setShowTempDutySheet(false);
    toast({ title: "已儲存臨時代班" });
  };

  const handleReturn = async (lendingId: string) => {
    await markReturned(lendingId);
    refresh();
    toast({ title: "已標記歸還" });
  };

  const handleConfirm = async (lendingId: string) => {
    // Use first available duty member as confirmer
    const firstDuty = dutyList.find(d => d.member);
    if (firstDuty?.member) {
      await confirmDuty(lendingId, firstDuty.member.id);
      refresh();
      toast({ title: "已確認值班" });
    }
  };

  const dutyStr = dutyList.map(d => `${SLOT_INFO[d.slotCode].short} ${d.member ? d.member.name : "缺"}`).join("、");
  const isViewToday = isSameDay(viewDate, new Date());

  return (
    <div className="px-4">
      <PageHeader title="值班借 Key" subtitle={todayDisplay} />


      <div id="keyRecord" className="space-y-4">
        {/* 鑰匙借出表簿 橫幅 - 版本2.0 */}
        <div className="duty-key-banner">
          <span className="text-lg">🔑</span>
          <span>鑰匙借出表簿</span>
          <span className="text-lg">🔑</span>
        </div>

        {/* keyControl - 版本2.0 樣式；內嵌表單，無需彈窗 */}
        <GlassCard className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">快速登記借出</h3>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAddKeyDialog(true)}>
              <Plus className="h-4 w-4" /> 新增key名稱
            </Button>
          </div>
          
          {/* 借用人選擇 */}
          <Tabs value={borrowerType} onValueChange={(v) => { setBorrowerType(v as typeof borrowerType); setSelectedMember(""); setPartnerName(""); setPartnerContact(""); }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="member" className="gap-1">
                <User className="w-4 h-4" />
                成員
              </TabsTrigger>
              <TabsTrigger value="partner" className="gap-1">
                <Building2 className="w-4 h-4" />
                同業
              </TabsTrigger>
            </TabsList>

            <TabsContent value="member" className="mt-3 space-y-3">
              <div>
                <Label>選擇成員</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMember(m.id)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        selectedMember === m.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      {m.id} {m.name}
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="partner" className="mt-3 space-y-3">
              <div>
                <Label>公司名稱</Label>
                <Select value={partnerCompanySelect || '__none__'} onValueChange={v => { setPartnerCompanySelect(v === '__none__' ? '' : v); if (v !== '其它') setPartnerCompanyCustom(''); }}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="請選擇公司" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- 請選擇 --</SelectItem>
                    {PARTNER_COMPANIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {partnerCompanySelect === '其它' && (
                  <Input
                    className="mt-2"
                    value={partnerCompanyCustom}
                    onChange={e => setPartnerCompanyCustom(e.target.value)}
                    placeholder="請輸入公司名稱"
                  />
                )}
              </div>
              <div>
                <Label>聯絡人姓名</Label>
                <Input 
                  className="mt-2"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="請輸入姓名"
                />
              </div>
              <div>
                <Label>電話 (選填)</Label>
                <Input 
                  className="mt-2"
                  value={partnerContact}
                  onChange={(e) => setPartnerContact(e.target.value)}
                  placeholder="請輸入電話"
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Key 選擇 */}
          <div>
            <Label>選擇 Key</Label>
            <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-32 overflow-y-auto">
              {keys.map(key => (
                <div 
                  key={key.key_id}
                  onClick={() => toggleKey(key.key_id)}
                  className={cn(
                    "p-2 rounded-lg border text-center text-sm cursor-pointer transition-colors",
                    selectedKeys.includes(key.key_id)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  {key.key_name}
                </div>
              ))}
            </div>
          </div>

          {/* 常用鑰匙快速選擇 */}
          {keyHistory.length > 0 && (
            <div>
              <Label className="text-muted-foreground text-sm">常用鑰匙（點擊加入下方自訂）</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {keyHistory.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setCustomKeysInput(prev => (prev ? `${prev}, ${name}` : name))}
                    className="rounded-md border bg-muted/50 px-2 py-1 text-xs hover:bg-muted transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 自訂 Key 輸入 */}
          <div>
            <Label>或輸入自訂 Key (用逗號、分號或換行分隔)</Label>
            <Textarea
              className="mt-2"
              value={customKeysInput}
              onChange={(e) => setCustomKeysInput(e.target.value)}
              placeholder="A103, B205, C301"
              rows={2}
            />
          </div>

          {/* 備註 */}
          <div>
            <Label>備註 (選填)</Label>
            <Input 
              className="mt-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="備註說明"
            />
          </div>

          {/* 提交按鈕 */}
          <Button className="w-full gap-2" onClick={handleSubmitLending}>
            <Check className="h-4 w-4" /> 確認借出
          </Button>
        </GlassCard>

        {/* dutyControl - 版本2.0 綠底樣式，排班區：桌面版左右並排 */}
        <div className="dutyControl dutyControl-inner">
          <div className="dutyControl-info">
            <span className="duty-duty-label">今日值班人員：</span>
            <span className={cn("text-foreground", hasMissing && "text-destructive")}>{dutyStr}</span>
            {hasMissing && (
              <StatusBadge variant="missing" className="gap-1">
                <AlertCircle className="h-3 w-3" /> 缺人
              </StatusBadge>
            )}
            {hasTempDuty && (
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">臨時代班</span>
            )}
          </div>
          <div className="dutyControl-actions">
            <Button size="sm" variant="outline" className="duty-btn-duty gap-1.5" onClick={() => setShowTempDutySheet(true)}>
              <Users className="h-4 w-4" /> 臨時代班設定
            </Button>
            {hasTempDuty && (
              <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:bg-destructive/10" onClick={async () => { await clearTempDuty(today); refresh(); toast({ title: "已取消代班" }); }}>
                <XCircle className="h-4 w-4" /> 取消代班
              </Button>
            )}
            {onNavigateToRoster && (
              <Button size="sm" variant="outline" className="duty-btn-duty gap-1.5" onClick={onNavigateToRoster}>
                <CalendarDays className="h-4 w-4" /> 查看排班數據
              </Button>
            )}
          </div>
        </div>

        {/* keyDateNavigation - 版本2.0 樣式 */}
        <div className="keyDateNavigation flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="duty-date-btn text-muted-foreground hover:text-foreground" onClick={() => setViewDate((d) => subDays(d, 1))}>
            ← 前一天
          </Button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {format(viewDate, "yyyy年M月d日 (EEEE)", { locale: zhTW })}
              {isViewToday && <span className="ml-1 text-primary">📅 今天</span>}
            </span>
            <span className="text-xs text-muted-foreground">共 {lendings.length} 筆記錄 {isViewToday && "今天"}</span>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="duty-date-btn text-muted-foreground hover:text-foreground" onClick={() => setViewDate(new Date())}>
              📅 今天
            </Button>
            <Button variant="ghost" size="sm" className="duty-date-btn text-muted-foreground hover:text-foreground" onClick={() => setViewDate((d) => addDays(d, 1))}>
              下一天 →
            </Button>
          </div>
        </div>

        {/* table-container + duty-key-table - 版本2.0 樣式 */}
        <div className="table-container overflow-hidden">
          <div className="flex gap-2 border-b border-border p-2">
            <div className="duty-search-bar relative flex-1 rounded-md">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜尋借用人或 Key"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 border-0 bg-transparent pl-8 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-9 w-28 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="out">借出中</SelectItem>
                <SelectItem value="returned">已歸還</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="duty-key-table">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>借用人</th>
                  <th>鑰匙項目</th>
                  <th>狀態</th>
                  <th>值班確認</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {lendings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      當天沒有鑰匙借出記錄
                    </td>
                  </tr>
                ) : (
                  lendings.map(({ lending, items }) => (
                    <LendingTableRow
                      key={lending.lending_id}
                      lending={lending}
                      items={items}
                      members={members}
                      onReturn={() => handleReturn(lending.lending_id)}
                      onConfirm={() => handleConfirm(lending.lending_id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 臨時代班設定 Sheet */}
      <Sheet open={showTempDutySheet} onOpenChange={setShowTempDutySheet}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>臨時代班設定</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {todaySlotCodes.map(slotCode => (
              <div key={slotCode} className="flex items-center gap-3">
                <SlotBadge slotCode={slotCode} />
                <Select
                  value={localTempOverrides[slotCode] || '__roster__'}
                  onValueChange={v => setLocalTempOverrides(prev => ({ ...prev, [slotCode]: v === '__roster__' ? '' : v }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="選擇代班人" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__roster__">使用排班表</SelectItem>
                    {members.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <SheetFooter className="mt-6">
            <Button onClick={handleSaveTempDuty}>儲存</Button>
            <SheetClose asChild>
              <Button variant="outline">取消</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 新增 Key 名稱 Dialog */}
      <Dialog open={showAddKeyDialog} onOpenChange={o => { setShowAddKeyDialog(o); if (!o) setNewKeyName(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增 Key 名稱</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-key-name">Key 名稱</Label>
              <Input
                id="new-key-name"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="例：A103、B205"
                onKeyDown={e => { if (e.key === 'Enter') handleAddKey(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddKey} className="gap-1">
              <Plus className="w-4 h-4" /> 新增
            </Button>
            <Button variant="outline" onClick={() => { setNewKeyName(''); setShowAddKeyDialog(false); }}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// Lending Table Row（表格列）
function LendingTableRow({
  lending,
  items,
  members,
  onReturn,
  onConfirm,
}: {
  lending: Lending;
  items: LendingItem[];
  members: Member[];
  onReturn: () => void;
  onConfirm: () => void;
}) {
  const isReturned = lending.status === "returned";
  const isConfirmed = !!lending.duty_confirmed_by;
  const confirmerName = lending.duty_confirmed_by ? members.find((m) => m.id === lending.duty_confirmed_by)?.name : null;

  return (
    <tr className={cn(isReturned && "opacity-80")}>
      <td>{formatDate(lending.created_at, "M/d HH:mm")}</td>
      <td>
        <span className="font-medium">{lending.borrower_name}</span>
        {lending.borrower_type === "partner" && <span className="ml-1"><PartnerBadge /></span>}
        {lending.partner_company && <span className="ml-1 text-xs opacity-90">({lending.partner_company})</span>}
      </td>
      <td>
        <div className="flex flex-wrap gap-1 justify-center">
          {items.map((item) => (
            <span key={item.id} className="rounded bg-black/5 px-1.5 py-0.5 text-xs">
              {item.key_name}
            </span>
          ))}
        </div>
      </td>
      <td className={isReturned ? "status-returned" : "status-borrowed"}>
        {isReturned ? "已歸還" : "借出中"}
      </td>
      <td>
        {isConfirmed && confirmerName ? (
          <span className="text-primary font-medium">
            <Check className="mr-1 inline h-3.5 w-3.5" />
            {confirmerName}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td>
        {!isReturned && (
          <div className="flex flex-wrap gap-1.5 justify-center">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" className="key-action-btn return inline-flex items-center gap-1">
                  <RotateCcw className="h-3.5 w-3.5" />
                  歸還
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>確定標記為已歸還？</AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={onReturn}>確定</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {!isConfirmed && (
              <button type="button" className="key-action-btn confirm inline-flex items-center gap-1" onClick={onConfirm}>
                <Check className="h-3.5 w-3.5" />
                值班確認
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}


