import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/lib/api/endpoints';
import { useAuthStore } from '@/stores/auth.store';

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (data) => {
      setSession(data);
      navigate('/', { replace: true });
    },
  });
}

export function useLogout() {
  const { refreshToken, clear } = useAuthStore.getState();
  const navigate = useNavigate();
  return async () => {
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } finally {
      clear();
      navigate('/login', { replace: true });
    }
  };
}
