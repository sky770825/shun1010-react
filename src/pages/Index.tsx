import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { RosterPage } from "@/components/roster/RosterPage";
import { DutyPage } from "@/components/duty/DutyPage";
import { ToolsPage } from "@/components/tools/ToolsPage";
import { initializeDemoData } from "@/services/dataService";
import { Toaster } from "@/components/ui/toaster";

const Index = () => {
  // 從 localStorage 恢復上次選擇的 tab，預設為 'roster'（排班）
  const [activeTab, setActiveTab] = useState<'roster' | 'duty' | 'tools'>(() => {
    const saved = localStorage.getItem('activeTab');
    return (saved === 'roster' || saved === 'duty' || saved === 'tools') ? saved : 'roster';
  });
  
  // 保存 activeTab 到 localStorage
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  // Initialize demo data on first load
  useEffect(() => {
    void initializeDemoData().catch(console.error);
  }, []);

  return (
    <AppLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'roster' && <RosterPage />}
      {activeTab === 'duty' && <DutyPage onNavigateToRoster={() => setActiveTab('roster')} />}
      {activeTab === 'tools' && <ToolsPage />}
    </AppLayout>
  );
};

export default Index;
