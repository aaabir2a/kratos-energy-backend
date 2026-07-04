import { createBrowserRouter } from 'react-router-dom';
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
import { LandingPagesPage } from '@/features/marketing/LandingPagesPage';
import { LandingPageEditorPage } from '@/features/marketing/LandingPageEditorPage';
import { PublicLandingPage } from '@/features/marketing/PublicLandingPage';
import { ProductsPage } from '@/features/catalog/ProductsPage';
import { PackagesPage } from '@/features/catalog/PackagesPage';
import { ChatInboxPage } from '@/features/chat/ChatInboxPage';
import { HeroImagesPage } from '@/features/media/HeroImagesPage';
import { ForbiddenPage, NotFoundPage } from '@/features/misc/ErrorPages';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/403', element: <ForbiddenPage /> },
  // Public landing pages — no auth.
  { path: '/p/:slug', element: <PublicLandingPage /> },
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
            element: <RequirePermission perm="landing_pages.read" />,
            children: [
              { path: '/marketing', element: <LandingPagesPage /> },
              { path: '/marketing/pages/:id', element: <LandingPageEditorPage /> },
            ],
          },
          {
            element: <RequirePermission perm="catalog.read" />,
            children: [
              { path: '/website/products', element: <ProductsPage /> },
              { path: '/website/packages', element: <PackagesPage /> },
            ],
          },
          {
            element: <RequirePermission perm="leads.read" />,
            children: [{ path: '/chat', element: <ChatInboxPage /> }],
          },
          {
            element: <RequirePermission perm="landing_pages.read" />,
            children: [{ path: '/website/images', element: <HeroImagesPage /> }],
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
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
