import { CalendarDays, Key, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  activeTab: 'roster' | 'duty' | 'tools';
  onTabChange: (tab: 'roster' | 'duty' | 'tools') => void;
}

const tabs = [
  { id: 'roster' as const, label: '排班', icon: CalendarDays },
  { id: 'duty' as const, label: '值班台', icon: Key },
  { id: 'tools' as const, label: '工具', icon: Wrench },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav">
      <div className="flex items-stretch justify-around h-full max-w-md mx-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "bottom-nav-item flex-1 touch-btn",
              activeTab === tab.id && "active"
            )}
          >
            <tab.icon className="w-6 h-6 transition-transform duration-200" />
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
