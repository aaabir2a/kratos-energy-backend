import { Link } from 'react-router-dom';
import { ShieldX, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

function Shell({ icon: Icon, code, title, message }: { icon: React.ElementType; code: string; title: string; message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-8 w-8" />
      </div>
      <p className="text-5xl font-bold tracking-tight">{code}</p>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button asChild className="mt-2">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <Shell
      icon={ShieldX}
      code="403"
      title="Access denied"
      message="You don't have permission to view this page. Contact an administrator if you think this is a mistake."
    />
  );
}

export function NotFoundPage() {
  return (
    <Shell
      icon={Compass}
      code="404"
      title="Page not found"
      message="The page you're looking for doesn't exist or has moved."
    />
  );
}
