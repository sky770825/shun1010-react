import { useMemo, useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { zhTW } from "date-fns/locale";
import { X, UserCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlotBadge } from "@/components/ui/slot-badge";
import { GlassCard } from "@/components/ui/glass-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn, getSlotsForDay } from "@/lib/utils";
import type { SlotCode, Member, RosterSlot } from "@/types";
import { getMembers, getRosterSlots, setRosterSlot, isAvailable } from "@/services/dataService";
import { useToast } from "@/hooks/use-toast";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface DayDrawerProps {
  date: string | null;
  onClose: () => void;
  onUpdate: () => void;
  isLocked: boolean;
}

export function DayDrawer({ date, onClose, onUpdate, isLocked }: DayDrawerProps) {
  const { toast } = useToast();
  
  const slots = useMemo(() => {
    if (!date) return [];
    const month = date.substring(0, 7);
    return getRosterSlots(month).filter(s => s.date === date);
  }, [date]);

  const members = useMemo(() => getMembers().filter(m => m.is_active && !m.exclude_roster), []);
  const daySlots = useMemo(() => date ? getSlotsForDay(date) : [], [date]);
  const [candidatesBySlot, setCandidatesBySlot] = useState<Record<string, Array<{ member: Member; available: boolean; reason?: string }>>>({});

  useEffect(() => {
    if (!date || daySlots.length === 0 || members.length === 0) {
      setCandidatesBySlot({});
      return;
    }
    let cancelled = false;
    (async () => {
      const out: Record<string, Array<{ member: Member; available: boolean; reason?: string }>> = {};
      for (const t of daySlots) {
        if (cancelled) return;
        const arr = await Promise.all(members.map(async (m) => {
          const av = await isAvailable(m.id, date, t.slot_code);
          return { member: m, available: av.available, reason: av.reason };
        }));
        out[t.slot_code] = arr;
      }
      if (!cancelled) setCandidatesBySlot(out);
    })();
    return () => { cancelled = true; };
  }, [date, daySlots, members]);

  // Get assigned members on this day
  const getSlotData = (slotCode: SlotCode): RosterSlot | undefined => {
    return slots.find(s => s.slot_code === slotCode);
  };

  const getCandidates = (slotCode: SlotCode): Array<{ member: Member; available: boolean; reason?: string }> => {
    return candidatesBySlot[slotCode] ?? [];
  };

  const handleAssign = (slotCode: SlotCode, memberId: string | null) => {
    if (!date || isLocked) return;
    
    const currentSlot = getSlotData(slotCode);
    setRosterSlot(date, slotCode, memberId, {
      is_substitute: currentSlot?.is_substitute || false,
      original_assignee_id: currentSlot?.original_assignee_id || null,
      status: 'draft',
    });
    
    onUpdate();
    toast({ 
      title: memberId ? "已指派" : "已清除",
      description: memberId ? `已指派值班人員` : `已清除此班次指派`,
    });
  };

  const handleSubstituteToggle = (slotCode: SlotCode, isSubstitute: boolean) => {
    if (!date || isLocked) return;
    
    const currentSlot = getSlotData(slotCode);
    if (!currentSlot) return;
    
    setRosterSlot(date, slotCode, currentSlot.assignee_id, {
      is_substitute: isSubstitute,
      original_assignee_id: isSubstitute ? currentSlot.assignee_id : null,
      status: 'draft',
    });
    
    onUpdate();
  };

  if (!date) return null;

  return (
    <Drawer open={!!date} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {format(parseISO(date), "M月d日 (EEEE)", { locale: zhTW })}
          </DrawerTitle>
          <DrawerDescription>
            {isLocked ? "已鎖定，無法編輯" : "點選班次卡片調整人員"}
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="px-4 pb-4 space-y-3">
          {daySlots.map((template) => {
            const slotData = getSlotData(template.slot_code);
            const candidates = getCandidates(template.slot_code);
            const currentMember = slotData?.assignee_id 
              ? members.find(m => m.id === slotData.assignee_id)
              : null;

            return (
              <GlassCard key={template.slot_code} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <SlotBadge slotCode={template.slot_code} />
                    <span className="text-sm text-muted-foreground">
                      {template.start_time} - {template.end_time}
                    </span>
                  </div>
                  {slotData?.is_substitute && (
                    <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded">代班</span>
                  )}
                </div>

                <Select
                  value={slotData?.assignee_id || ""}
                  onValueChange={(val) => handleAssign(template.slot_code, val || null)}
                  disabled={isLocked}
                >
                  <SelectTrigger className={cn(!slotData?.assignee_id && "border-destructive text-destructive")}>
                    <SelectValue placeholder="選擇人員">
                      {currentMember ? (
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-success" />
                          <span>{currentMember.name}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          <span>缺人</span>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">
                      <span className="text-muted-foreground">清除指派</span>
                    </SelectItem>
                    {candidates.map(({ member, available, reason }) => (
                      <SelectItem 
                        key={member.id} 
                        value={member.id}
                        disabled={!available}
                        className={cn(!available && "opacity-50")}
                      >
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span>{member.name}</span>
                          {!available && (
                            <span className="text-xs text-muted-foreground">{reason}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {slotData?.assignee_id && (
                  <div className="flex items-center gap-2 mt-2">
                    <Switch
                      id={`sub-${template.slot_code}`}
                      checked={slotData?.is_substitute || false}
                      onCheckedChange={(checked) => handleSubstituteToggle(template.slot_code, checked)}
                      disabled={isLocked}
                    />
                    <Label htmlFor={`sub-${template.slot_code}`} className="text-sm">
                      標記為代班
                    </Label>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">關閉</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
