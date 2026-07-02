import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth, RequirePermission } from './guards';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { UsersPage } from '@/features/users/UsersPage';
import { RolesPage } from '@/features/roles/RolesPage';
import { OfficesPage } from '@/features/offices/OfficesPage';
import { LeadsPage } from '@/features/leads/LeadsPage';
import { LeadDetailPage } from '@/features/leads/LeadDetailPage';
import { PipelinePage } from '@/features/pipeline/PipelinePage';
import { SourcesPage } from '@/features/sources/SourcesPage';
import { DealsPage } from '@/features/deals/DealsPage';
import { DealDetailPage } from '@/features/deals/DealDetailPage';
import { ForbiddenPage, NotFoundPage } from '@/features/misc/ErrorPages';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/403', element: <ForbiddenPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          {
            element: <RequirePermission perm="leads.read" />,
            children: [
              { path: '/leads', element: <LeadsPage /> },
              { path: '/leads/:id', element: <LeadDetailPage /> },
            ],
          },
          {
            element: <RequirePermission perm="pipeline.read" />,
            children: [{ path: '/pipeline', element: <PipelinePage /> }],
          },
          {
            element: <RequirePermission perm="sources.read" />,
            children: [{ path: '/sources', element: <SourcesPage /> }],
          },
          {
            element: <RequirePermission perm="deals.read" />,
            children: [
              { path: '/deals', element: <DealsPage /> },
              { path: '/deals/:id', element: <DealDetailPage /> },
            ],
          },
          {
            element: <RequirePermission perm="users.read" />,
            children: [{ path: '/users', element: <UsersPage /> }],
          },
          {
            element: <RequirePermission perm="roles.read" />,
            children: [{ path: '/roles', element: <RolesPage /> }],
          },
          {
            element: <RequirePermission perm="offices.read" />,
            children: [{ path: '/offices', element: <OfficesPage /> }],
          },
          // Placeholders for upcoming phases — redirect to dashboard for now.
          { path: '/marketing', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
