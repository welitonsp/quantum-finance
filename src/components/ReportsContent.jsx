// src/components/ReportsContent.jsx
import ReportsDashboard from './ReportsDashboard';

export default function ReportsContent({ transactions, balances }) {
  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4">
      <ReportsDashboard transactions={transactions} balances={balances} />
    </div>
  );
}