import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLogin } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage } from '@/lib/api/client';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const token = useAuthStore((s) => s.accessToken);
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (token) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="rounded-xl bg-white p-1.5">
            <img src="/logo.svg" alt="Kratos Sustainability" className="h-11 w-auto" />
          </div>
          <div className="font-bold uppercase tracking-wide leading-tight">
            <p className="text-[#6abf2e]">Kratos</p>
            <p className="text-white">Sustainability</p>
          </div>
        </div>
        <div className="relative space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">
            Capture every lead.
            <br />
            Close every deal.
          </h2>
          <p className="max-w-sm text-sm text-white/70">
            One platform to capture leads from your website, social media and chatbot — then track
            them from first touch to a closed solar installation.
          </p>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Kratos Energy Pty Ltd</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <img src="/logo.svg" alt="Kratos Sustainability" className="h-10 w-auto" />
            <span className="font-bold uppercase tracking-wide">
              <span className="text-[#6abf2e]">Kratos</span> <span className="text-[#175c4c] dark:text-emerald-100">Sustainability</span>
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your credentials to access the CRM.</p>

          <form
            className="mt-8 space-y-4"
            onSubmit={handleSubmit((values) => login.mutate(values))}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@kratosenergy.com.au" autoComplete="email" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" autoComplete="current-password" {...register('password')} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            {login.isError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {apiErrorMessage(login.error)}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
