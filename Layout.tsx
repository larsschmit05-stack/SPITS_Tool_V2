
import React, { useState, useMemo } from 'react';
import { LayoutDashboard, Workflow, Settings, Database, BarChart3, Bell, User, Download, CheckCircle2, Factory, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useAppState } from './src/state/store';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const NavItem = ({ icon: Icon, label, id, active, onClick }: { icon: any, label: string, id: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors rounded-md mb-1 ${
      active 
        ? 'bg-brand-50 text-brand-600' 
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <Icon className={`w-4 h-4 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
    {label}
  </button>
);

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const [isExporting, setIsExporting] = useState(false);
  const { state, setActiveScenario } = useAppState();

  const activeScenario = useMemo(
    () => state.scenarios.find(s => s.id === state.activeScenarioId) || null,
    [state.scenarios, state.activeScenarioId]
  );

  const handleExportPDF = async () => {
    const input = document.getElementById('main-content');
    if (!input) return;

    setIsExporting(true);

    try {
      const canvas = await html2canvas(input, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#F4F6F8',
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`mkb-simulatie-${activeScenario?.name || 'rapport'}.pdf`);
    } catch (error) {
      console.error("Export failed", error);
      alert("Er ging iets mis bij het genereren van de PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col z-20">
        <div className="p-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-600 rounded-md flex items-center justify-center text-white shadow-sm">
              <Factory className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight tracking-tight">MKB Simulator</h1>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Process Engine</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <div className="mb-6">
            <p className="px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Operations</p>
            <NavItem 
              icon={LayoutDashboard} 
              label="Dashboard" 
              id="dashboard" 
              active={activeTab === 'dashboard'} 
              onClick={() => onTabChange('dashboard')} 
            />
            <NavItem 
              icon={Workflow} 
              label="Process Builder" 
              id="builder" 
              active={activeTab === 'builder'} 
              onClick={() => onTabChange('builder')} 
            />
             <NavItem
              icon={Database}
              label="Resources & Steps"
              id="resources"
              active={activeTab === 'resources'}
              onClick={() => onTabChange('resources')}
            />
            <NavItem
              icon={Factory}
              label="Departments"
              id="departments"
              active={activeTab === 'departments'}
              onClick={() => onTabChange('departments')}
            />
          </div>

          <div>
            <p className="px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Configuration</p>
            <NavItem 
              icon={BarChart3} 
              label="Scenarios" 
              id="scenarios" 
              active={activeTab === 'scenarios'} 
              onClick={() => onTabChange('scenarios')} 
            />
            <NavItem 
              icon={Settings} 
              label="System Settings" 
              id="settings" 
              active={activeTab === 'settings'} 
              onClick={() => onTabChange('settings')} 
            />
          </div>
        </nav>

        <div className="p-4 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-600">
                    <User className="w-4 h-4" />
                </div>
                <div>
                    <p className="text-xs font-bold text-slate-900">Operator View</p>
                    <p className="text-[10px] text-slate-500">v2.4.0-stable</p>
                </div>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10">
            <div className="flex items-center gap-4">
                 <h2 className="text-sm font-semibold text-slate-900">Production Line Alpha</h2>
                 <div className="h-4 w-px bg-slate-200"></div>
                <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs font-medium">Active Scenario:</span>
                    <div className="relative">
                        <select
                          value={state.activeScenarioId || ''}
                          onChange={(e) => setActiveScenario(e.target.value)}
                          className="appearance-none bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold rounded-md pl-3 pr-8 py-1.5 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all hover:bg-slate-100 cursor-pointer"
                        >
                          {state.scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-status-green px-2 py-0.5">
                        <CheckCircle2 className="w-3 h-3" /> SAVED
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button 
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
                >
                    {isExporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    Export Report
                </button>
                <button className="text-slate-400 hover:text-slate-600 p-2 relative">
                    <Bell className="w-5 h-5" />
                </button>
            </div>
        </header>

        <main id="main-content" className="flex-1 overflow-auto bg-slate-50">
            {children}
        </main>
      </div>
    </div>
  );
};
