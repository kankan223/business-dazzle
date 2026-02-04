import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface SidebarItemProps {
  id: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
  activeTab: string;
  navigate: (id: string) => void;
}

export function SidebarItem({ id, icon: Icon, label, badge, activeTab, navigate }: SidebarItemProps) {
  return (
    <button
      onClick={() => navigate(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
        activeTab === id 
          ? 'bg-primary text-primary-foreground shadow-md' 
          : 'hover:bg-muted text-muted-foreground'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && (
        <Badge variant={activeTab === id ? "secondary" : "default"} className="text-xs">
          {badge}
        </Badge>
      )}
    </button>
  );
}
