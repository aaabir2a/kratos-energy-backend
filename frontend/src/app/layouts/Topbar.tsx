import { Moon, Sun, LogOut, ChevronDown } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeStore } from '@/stores/theme.store';
import { useLogout } from '@/hooks/useAuth';
import { initials } from '@/lib/utils';
import { NotificationBell } from '@/features/notifications/NotificationBell';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  marketing: 'Marketing',
  sales: 'Sales',
};

export function Topbar() {
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const logout = useLogout();

  if (!user) return null;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          Welcome back, <span className="text-foreground">{user.firstName}</span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {theme === 'light' ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent">
              <Avatar>
                <AvatarFallback>{initials(user.firstName, user.lastName)}</AvatarFallback>
              </Avatar>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium leading-tight">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>My Account</span>
              <Badge variant="warning">{ROLE_LABEL[user.role.slug] ?? user.role.name}</Badge>
            </DropdownMenuLabel>
            {user.office && (
              <p className="px-2 pb-1 text-xs text-muted-foreground">{user.office.name}</p>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void logout()} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
