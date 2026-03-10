
import React, { useState } from 'react';
import { Layout } from './Layout';
import { Dashboard } from './Dashboard';
import { ProcessBuilder } from './ProcessBuilder';
import { Resources } from './Resources';
import { Departments } from './Departments';
import { Materials } from './Materials';
import { Scenarios } from './Scenarios';
import { AppStateProvider } from './src/state/store';

function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'builder':
        return <ProcessBuilder onNavigate={setActiveTab} />;
      case 'resources':
        return <Resources onNavigate={setActiveTab} />;
      case 'departments':
        return <Departments />;
      case 'materials':
        return <Materials />;
      case 'scenarios':
        return <Scenarios onNavigate={setActiveTab} />;
      default:
        return (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
                <h3 className="text-lg font-medium text-slate-500">Under Construction</h3>
                <p>The {activeTab} module is coming soon.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </Layout>
  );
}

function App() {
  return (
    <AppStateProvider>
      <AppContent />
    </AppStateProvider>
  );
}

export default App;
