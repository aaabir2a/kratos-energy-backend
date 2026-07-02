import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Building2,
  Sun,
  Megaphone,
  Target,
  Handshake,
  KanbanSquare,
  Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  perm?: string;
  soon?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    section: 'CRM',
    items: [
      { to: '/leads', label: 'Leads', icon: Target, perm: 'leads.read' },
      { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare, perm: 'pipeline.read' },
      { to: '/sources', label: 'Sources', icon: Share2, perm: 'sources.read' },
      { to: '/deals', label: 'Deals', icon: Handshake, perm: 'deals.read' },
      { to: '/marketing', label: 'Marketing', icon: Megaphone, perm: 'landing_pages.read', soon: true },
    ],
  },
  {
    section: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: Users, perm: 'users.read' },
      { to: '/roles', label: 'Roles & Permissions', icon: ShieldCheck, perm: 'roles.read' },
      { to: '/offices', label: 'Offices', icon: Building2, perm: 'offices.read' },
    ],
  },
];

export function Sidebar() {
  const { can } = usePermissions();

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-accent text-white">
          <Sun className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Kratos Energy</p>
          <p className="text-[11px] text-sidebar-foreground/70">Solar CRM</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          return (
            <div key={group.section}>
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                {group.section}
              </p>
              <div className="space-y-1">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-accent/15 text-white'
                          : 'text-sidebar-foreground/80 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    <item.icon className="h-[18px] w-[18px]" />
                    <span className="flex-1">{item.label}</span>
                    {item.soon && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-sidebar-foreground/60">
                        Soon
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-6 py-3 text-[11px] text-sidebar-foreground/50">
        v1.0 · Phase 1
      </div>
    </aside>
  );
}
