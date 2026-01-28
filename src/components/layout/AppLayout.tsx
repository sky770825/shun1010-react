import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

interface AppLayoutProps {
  children: ReactNode;
  activeTab: 'roster' | 'duty' | 'tools';
  onTabChange: (tab: 'roster' | 'duty' | 'tools') => void;
}

export function AppLayout({ children, activeTab, onTabChange }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30">
      <main className="main-content">
        {children}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={onTabChange} />
    </div>
  );
}
