import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { zhTW } from "date-fns/locale";
import { 
  BarChart3, 
  Download, 
  ExternalLink, 
  FileSpreadsheet, 
  LogIn, 
  ClipboardList, 
  Map,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/glass-card";
import { SlotBadge } from "@/components/ui/slot-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMonth } from "@/lib/utils";
import { SLOT_INFO, DEFAULT_EXTERNAL_LINKS } from "@/lib/constants";
import type { SlotCode, Member, KeyItem, ExternalLink } from "@/types";
import { 
  getMembers, 
  getRosterSlots, 
  getKeys, 
  upsertKey, 
  toggleKeyActive, 
  deleteKey,
  listLendings,
  upsertMember,
  deleteMember,
  setMemberActive,
  setExcludeRoster,
  getRules,
  getSameDayPairs
} from "@/services/dataService";
import { getScheduleReport } from "@/services/schedulerEngine";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";

export function ToolsPage() {
  return (
    <div className="px-4">
      <PageHeader title="工具與管理" subtitle="統計報表、資料管理、外部連結" />

      <Tabs defaultValue="stats" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="stats" className="text-xs">統計</TabsTrigger>
          <TabsTrigger value="members" className="text-xs">成員</TabsTrigger>
          <TabsTrigger value="keys" className="text-xs">Key</TabsTrigger>
          <TabsTrigger value="links" className="text-xs">連結</TabsTrigger>
          <TabsTrigger value="export" className="text-xs">匯出設定</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="mt-4">
          <StatsPanel />
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <MembersPanel />
        </TabsContent>

        <TabsContent value="keys" className="mt-4">
          <KeysPanel />
        </TabsContent>

        <TabsContent value="links" className="mt-4">
          <LinksPanel />
        </TabsContent>

        <TabsContent value="export" className="mt-4">
          <ExportSettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Stats Panel
function StatsPanel() {
  const [selectedMonth, setSelectedMonth] = useState(() => formatMonth(new Date()));
  const { data: report } = useQuery({
    queryKey: ["scheduleReport", selectedMonth],
    queryFn: () => getScheduleReport(selectedMonth),
  });
  const { data: lendingsData } = useQuery({
    queryKey: ["listLendings", "all"],
    queryFn: () => listLendings({}),
  });
  const lendings = lendingsData ?? [];

  const slotCodes: SlotCode[] = ['WD_AM', 'WD_PM', 'WE_AM', 'WE_MD', 'WE_PM'];
  const outCount = lendings.filter(l => l.lending.status === 'out').length;
  const partnerCount = lendings.filter(l => l.lending.borrower_type === 'partner').length;
  const memberStats = report?.member_stats ?? [];
  const slotCounts = report?.slot_counts ?? { WD_AM: 0, WD_PM: 0, WE_AM: 0, WE_MD: 0, WE_PM: 0 };
  const missingSlots = report?.missing_slots ?? [];

  return (
    <div className="space-y-4">
      {/* Month Selector */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setSelectedMonth(formatMonth(subMonths(new Date(`${selectedMonth}-01`), 1)))}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium">{selectedMonth}</span>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setSelectedMonth(formatMonth(new Date()))}
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="p-3 text-center">
          <div className="text-2xl font-bold text-destructive">{missingSlots.length}</div>
          <div className="text-xs text-muted-foreground">缺人班次</div>
        </GlassCard>
        <GlassCard className="p-3 text-center">
          <div className="text-2xl font-bold text-warning">{outCount}</div>
          <div className="text-xs text-muted-foreground">借出中 Key</div>
        </GlassCard>
        <GlassCard className="p-3 text-center">
          <div className="text-2xl font-bold text-info">{memberStats.length}</div>
          <div className="text-xs text-muted-foreground">參與排班人數</div>
        </GlassCard>
        <GlassCard className="p-3 text-center">
          <div className="text-2xl font-bold" style={{ color: 'hsl(var(--partner))' }}>{partnerCount}</div>
          <div className="text-xs text-muted-foreground">同業借出</div>
        </GlassCard>
      </div>

      {/* Member Stats Table */}
      <GlassCard className="p-3">
        <h3 className="font-semibold mb-3">排班統計</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">成員</TableHead>
                {slotCodes.map(code => (
                  <TableHead key={code} className="text-center w-12" title={SLOT_INFO[code].time}>
                    <span className="text-[10px]">{SLOT_INFO[code].short}</span>
                  </TableHead>
                ))}
                <TableHead className="text-center w-12">計</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberStats.map(({ member, assigned }) => {
                const total = Object.values(assigned).reduce((a, b) => a + b, 0);
                return (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium text-xs">{member.name}</TableCell>
                    {slotCodes.map(code => (
                      <TableCell key={code} className="text-center text-sm">
                        {assigned[code]}
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-medium">{total}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </GlassCard>

      {/* Export Buttons */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 gap-2" onClick={() => exportRosterCSV(selectedMonth)}>
          <Download className="w-4 h-4" />
          匯出排班
        </Button>
        <Button variant="outline" className="flex-1 gap-2" onClick={() => exportLendingsCSV()}>
          <Download className="w-4 h-4" />
          匯出借還
        </Button>
      </div>
    </div>
  );
}

const MEMBERS_PANEL_LOCK_KEY = 'app/shun1010/duty_members_panel_locked';

// Members Panel
function MembersPanel() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState('');
  const [membersPanelLocked, setMembersPanelLocked] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(MEMBERS_PANEL_LOCK_KEY) === '1'
  );
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const members = useMemo(() => getMembers(), [refreshKey]);

  const refresh = () => setRefreshKey(k => k + 1);

  const handleLockConfirm = () => {
    if (lockPassword !== '8888') {
      toast({ title: '密碼錯誤', variant: 'destructive' });
      return;
    }
    const next = !membersPanelLocked;
    setMembersPanelLocked(next);
    localStorage.setItem(MEMBERS_PANEL_LOCK_KEY, next ? '1' : '0');
    setLockDialogOpen(false);
    setLockPassword('');
    if (next) {
      setShowAdd(false);
      setEditingMember(null);
    }
    toast({ title: next ? '成員管理已鎖定' : '成員管理已解鎖' });
  };

  const handleAdd = () => {
    if (!newName.trim()) {
      toast({ title: "請輸入姓名", variant: "destructive" });
      return;
    }
    upsertMember({ name: newName.trim() });
    setNewName('');
    setShowAdd(false);
    refresh();
    toast({ title: "已新增成員" });
  };

  const handleDelete = (id: string) => {
    deleteMember(id);
    refresh();
    toast({ title: "已刪除成員" });
  };

  const handleToggleActive = (id: string, isActive: boolean) => {
    setMemberActive(id, isActive);
    refresh();
  };

  const handleToggleExclude = (id: string, exclude: boolean) => {
    setExcludeRoster(id, exclude);
    refresh();
  };

  const openEdit = (m: Member) => {
    setEditingMember(m);
    setEditName(m.name);
  };

  const handleSaveEdit = () => {
    if (!editingMember) return;
    if (!editName.trim()) {
      toast({ title: "請輸入姓名", variant: "destructive" });
      return;
    }
    upsertMember({ id: editingMember.id, name: editName.trim() });
    setEditingMember(null);
    refresh();
    toast({ title: "已更新成員" });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">成員管理</h3>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLockDialogOpen(true)}
            className="gap-1"
            title={membersPanelLocked ? '解鎖' : '鎖定'}
          >
            {membersPanelLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {membersPanelLocked ? '解鎖' : '鎖定'}
          </Button>
          <Button
            size="sm"
            onClick={() => setShowAdd(true)}
            className="gap-1"
            disabled={membersPanelLocked}
          >
            <Plus className="w-4 h-4" />
            新增
          </Button>
        </div>
      </div>

      <Dialog open={lockDialogOpen} onOpenChange={(o) => { setLockDialogOpen(o); if (!o) setLockPassword(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{membersPanelLocked ? '解鎖成員管理' : '鎖定成員管理'}</DialogTitle>
            <DialogDescription>
              {membersPanelLocked
                ? '請輸入密碼以解鎖，解鎖後可新增、編輯、刪除成員。'
                : '請輸入密碼以鎖定，鎖定後將無法新增、編輯、刪除成員。'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              type="password"
              value={lockPassword}
              onChange={(e) => setLockPassword(e.target.value)}
              placeholder="密碼"
              onKeyDown={(e) => e.key === 'Enter' && handleLockConfirm()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLockDialogOpen(false); setLockPassword(''); }}>取消</Button>
            <Button onClick={handleLockConfirm}>確認</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAdd && (
        <GlassCard className="p-3 flex gap-2">
          <Input 
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="姓名"
            className="flex-1"
          />
          <Button onClick={handleAdd}>新增</Button>
          <Button variant="ghost" onClick={() => setShowAdd(false)}>取消</Button>
        </GlassCard>
      )}

      <div className="space-y-2">
        {members.map(member => (
          <GlassCard key={member.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{member.id} {member.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {member.role} · {member.is_active ? '啟用' : '停用'}
                  {member.exclude_roster && ' · 不參與排班'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">啟用</span>
                  <Switch 
                    checked={member.is_active}
                    onCheckedChange={(c) => handleToggleActive(member.id, c)}
                    disabled={membersPanelLocked}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">不排班</span>
                  <Switch 
                    checked={member.exclude_roster}
                    onCheckedChange={(c) => handleToggleExclude(member.id, c)}
                    disabled={membersPanelLocked}
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => openEdit(member)} aria-label="編輯" disabled={membersPanelLocked}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="刪除" disabled={membersPanelLocked}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>確定刪除 {member.id} {member.name}？</AlertDialogTitle>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(member.id)}>刪除</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <Sheet open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>編輯成員</SheetTitle>
          </SheetHeader>
          {editingMember && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>編號</Label>
                <div className="text-sm text-muted-foreground py-2">{editingMember.id}</div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-name">姓名</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="姓名"
                />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleSaveEdit}>儲存</Button>
                <Button variant="outline" onClick={() => setEditingMember(null)}>取消</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Keys Panel
function KeysPanel() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const keys = useMemo(() => getKeys(), [refreshKey]);

  const refresh = () => setRefreshKey(k => k + 1);

  const handleAdd = () => {
    if (!newKey.trim()) {
      toast({ title: "請輸入 Key 名稱", variant: "destructive" });
      return;
    }
    
    // Support multiple keys separated by comma/newline
    const keyList = newKey.split(/[,\n]/).map(k => k.trim()).filter(Boolean);
    keyList.forEach(keyName => {
      upsertKey({ key_name: keyName, address: newAddress.trim() || undefined });
    });
    
    setNewKey('');
    setNewAddress('');
    setShowAdd(false);
    refresh();
    toast({ title: `已新增 ${keyList.length} 個 Key` });
  };

  const handleDelete = (id: string) => {
    deleteKey(id);
    refresh();
    toast({ title: "已刪除 Key" });
  };

  const handleToggle = (id: string, isActive: boolean) => {
    toggleKeyActive(id, isActive);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Key 管理</h3>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
          <Plus className="w-4 h-4" />
          新增
        </Button>
      </div>

      {showAdd && (
        <GlassCard className="p-3 space-y-2">
          <Input 
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Key 名稱 (多筆用逗號分隔)"
          />
          <Input 
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="地址 (選填)"
          />
          <div className="flex gap-2">
            <Button onClick={handleAdd} className="flex-1">新增</Button>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>取消</Button>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-2 gap-2">
        {keys.map(key => (
          <GlassCard 
            key={key.key_id} 
            className={`p-3 ${!key.is_active && 'opacity-50'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">{key.key_name}</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleToggle(key.key_id, !key.is_active)}
                >
                  {key.is_active ? (
                    <ToggleRight className="w-4 h-4 text-success" />
                  ) : (
                    <ToggleLeft className="w-4 h-4" />
                  )}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>確定刪除 {key.key_name}？</AlertDialogTitle>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(key.key_id)}>刪除</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            {key.address && (
              <div className="text-xs text-muted-foreground truncate">{key.address}</div>
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

// Links Panel
function LinksPanel() {
  const { toast } = useToast();
  const [linkUnlockOpen, setLinkUnlockOpen] = useState(false);
  const [linkUnlockPassword, setLinkUnlockPassword] = useState('');
  const [pendingLink, setPendingLink] = useState<ExternalLink | null>(null);

  const iconMap: Record<string, React.ReactNode> = {
    FileSpreadsheet: <FileSpreadsheet className="w-5 h-5" />,
    LogIn: <LogIn className="w-5 h-5" />,
    ClipboardList: <ClipboardList className="w-5 h-5" />,
    Map: <Map className="w-5 h-5" />,
  };

  const handleLinkClick = (link: ExternalLink) => {
    if (link.id === 'objects-table') {
      setPendingLink(link);
      setLinkUnlockOpen(true);
    } else {
      window.open(link.url, '_blank');
    }
  };

  const handleLinkUnlockConfirm = () => {
    if (linkUnlockPassword !== '8888') {
      toast({ title: '密碼錯誤', variant: 'destructive' });
      return;
    }
    if (pendingLink) window.open(pendingLink.url, '_blank');
    setLinkUnlockOpen(false);
    setLinkUnlockPassword('');
    setPendingLink(null);
  };

  return (
    <div className="space-y-3">
      {DEFAULT_EXTERNAL_LINKS.map(link => (
        <GlassCard 
          key={link.id}
          className="p-4 flex items-center gap-4 hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => handleLinkClick(link)}
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {iconMap[link.icon || 'ExternalLink'] || <ExternalLink className="w-5 h-5" />}
          </div>
          <div className="flex-1">
            <div className="font-medium">{link.title}</div>
            {link.description && (
              <div className="text-xs text-muted-foreground">{link.description}</div>
            )}
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </GlassCard>
      ))}

      <Dialog open={linkUnlockOpen} onOpenChange={(o) => { setLinkUnlockOpen(o); if (!o) { setLinkUnlockPassword(''); setPendingLink(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>密碼解鎖</DialogTitle>
            <DialogDescription>
              請輸入密碼以開啟「{pendingLink?.title || '物件總表'}」。
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              type="password"
              value={linkUnlockPassword}
              onChange={(e) => setLinkUnlockPassword(e.target.value)}
              placeholder="密碼"
              onKeyDown={(e) => e.key === 'Enter' && handleLinkUnlockConfirm()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLinkUnlockOpen(false); setLinkUnlockPassword(''); setPendingLink(null); }}>取消</Button>
            <Button onClick={handleLinkUnlockConfirm}>確認</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GlassCard className="p-4 opacity-50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="w-4 h-4" />
          <span className="text-sm">從 Sheets 同步（即將推出）</span>
        </div>
      </GlassCard>
    </div>
  );
}

// Export functions
function exportRosterCSV(month: string) {
  const slots = getRosterSlots(month);
  const members = getMembers();
  
  const getMemberName = (id: string | null) => id ? members.find(m => m.id === id)?.name || '?' : '缺人';
  
  const rows = slots.map(s => ({
    日期: s.date,
    班別: s.slot_code,
    人員: getMemberName(s.assignee_id),
    代班: s.is_substitute ? '是' : '否',
    狀態: s.status,
  }));

  downloadCSV(rows, `roster_${month}.csv`);
}

async function exportLendingsCSV() {
  const lendings = await listLendings({});
  
  const rows = lendings.flatMap(({ lending, items }) => 
    items.map(item => ({
      建立時間: lending.created_at,
      借用人: lending.borrower_name,
      類型: lending.borrower_type === 'partner' ? '同業' : '成員',
      公司: lending.partner_company || '',
      Key: item.key_name,
      狀態: lending.status,
      歸還時間: lending.returned_at || '',
    }))
  );

  downloadCSV(rows, `lendings_${format(new Date(), 'yyyyMMdd')}.csv`);
}

function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// Export Settings Panel：匯出目前設定供更新 constants.ts
function ExportSettingsPanel() {
  const { toast } = useToast();
  const members = useMemo(() => getMembers(), []);
  const rules = useMemo(() => getRules(), []);
  const sameDayPairs = useMemo(() => getSameDayPairs(), []);

  const handleExportMembers = () => {
    const data = members.map(m => ({
      id: m.id,
      name: m.name,
      exclude_roster: m.exclude_roster || false,
    }));
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'current_members.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: '已匯出成員列表' });
  };

  const handleExportRules = () => {
    const weeklyRules = rules
      .filter(r => r.rule_type === 'weekly' && r.is_active && r.action === 'blocked' && r.slot_code === 'any')
      .map(r => ({
        member_id: r.member_id,
        weekday: r.weekday,
      }));
    const json = JSON.stringify(weeklyRules, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'current_weekly_rules.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: '已匯出每週不可排規則' });
  };

  const handleExportSameDayPairs = () => {
    const json = JSON.stringify(sameDayPairs, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'current_same_day_pairs.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: '已匯出同天搭檔' });
  };

  const handleCopyAll = () => {
    const memberNames = new Map(members.map(m => [m.id, m.name]));
    const weeklyRulesFormatted = rules
      .filter(r => r.rule_type === 'weekly' && r.is_active && r.action === 'blocked' && r.slot_code === 'any')
      .map(r => `  { member_id: '${r.member_id}', weekday: ${r.weekday} },  // ${memberNames.get(r.member_id) || '?'} 不能排${['週日', '週一', '週二', '週三', '週四', '週五', '週六'][r.weekday!]}`)
      .join('\n');
    const sameDayPairsFormatted = sameDayPairs.map(([a, b]) => `  ['${a}', '${b}'],  // ${memberNames.get(a) || '?'} & ${memberNames.get(b) || '?'}`).join('\n');
    const membersFormatted = members.map(m => `  { id: '${m.id}', name: '${m.name}'${m.exclude_roster ? ', exclude_roster: true' : ''} },`).join('\n');
    
    const text = `// 目前實際設定（供更新 constants.ts 用）

// 成員列表
export const DEFAULT_LEGACY_MEMBERS = [
${membersFormatted}
];

// 每週不可排規則
export const DEFAULT_AVAILABILITY_RULES = [
${weeklyRulesFormatted}
];

// 同天搭檔
export const DEFAULT_SAME_DAY_PAIRS: [string, string][] = [
${sameDayPairsFormatted}
];`;
    
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: '已複製到剪貼簿', description: '可貼上到 constants.ts 更新預設值' });
    }).catch(() => {
      toast({ title: '複製失敗', variant: 'destructive' });
    });
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <h3 className="font-semibold mb-3">匯出目前設定</h3>
        <p className="text-sm text-muted-foreground mb-4">
          匯出目前實際儲存的設定（成員、規則、同天搭檔），可用於更新 constants.ts 的預設值。
        </p>
        <div className="space-y-2">
          <Button variant="outline" className="w-full gap-2" onClick={handleExportMembers}>
            <Download className="w-4 h-4" />
            匯出成員列表 (JSON)
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={handleExportRules}>
            <Download className="w-4 h-4" />
            匯出每週不可排規則 (JSON)
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={handleExportSameDayPairs}>
            <Download className="w-4 h-4" />
            匯出同天搭檔 (JSON)
          </Button>
          <Button className="w-full gap-2" onClick={handleCopyAll}>
            <Download className="w-4 h-4" />
            複製全部設定（供更新 constants.ts）
          </Button>
        </div>
        <div className="mt-4 p-3 bg-muted/50 rounded text-xs text-muted-foreground">
          <p className="font-medium mb-1">使用說明：</p>
          <ul className="list-disc list-inside space-y-1">
            <li>點擊「複製全部設定」會將格式化的程式碼複製到剪貼簿</li>
            <li>可貼上到 <code className="bg-background px-1 rounded">src/lib/constants.ts</code> 更新預設值</li>
            <li>或使用個別匯出功能取得 JSON 檔案</li>
          </ul>
        </div>
      </GlassCard>
    </div>
  );
}
