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
import { GlobalFormPage } from '@/features/marketing/GlobalFormPage';
import { CustomFormsPage } from '@/features/marketing/CustomFormsPage';
import { CustomFormEditorPage } from '@/features/marketing/CustomFormEditorPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { NotificationSettingsPage } from '@/features/notifications/NotificationSettingsPage';
import { LeadAssignmentPage } from '@/features/settings/LeadAssignmentPage';
import { MessageQueuePage } from '@/features/messaging/MessageQueuePage';
import { MessagingSettingsPage } from '@/features/messaging/MessagingSettingsPage';
import { TemplateLibraryPage } from '@/features/messaging/TemplateLibraryPage';
import { TemplateEditorPage } from '@/features/messaging/TemplateEditorPage';
import { UnsubscribePage } from '@/features/messaging/UnsubscribePage';
import { PublicLandingPage } from '@/features/marketing/PublicLandingPage';
import { ProductsPage } from '@/features/catalog/ProductsPage';
import { PackagesPage } from '@/features/catalog/PackagesPage';
import { ChatInboxPage } from '@/features/chat/ChatInboxPage';
import { HeroImagesPage } from '@/features/media/HeroImagesPage';
import { BlogsPage } from '@/features/blogs/BlogsPage';
import { BlogPostEditorPage } from '@/features/blogs/BlogPostEditorPage';
import { BlogCategoriesPage } from '@/features/blogs/BlogCategoriesPage';
import { BlogTypesPage } from '@/features/blogs/BlogTypesPage';
import { ForbiddenPage, NotFoundPage } from '@/features/misc/ErrorPages';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/403', element: <ForbiddenPage /> },
  // Public landing pages — no auth.
  { path: '/p/:slug', element: <PublicLandingPage /> },
  // Unsubscribe, reached from an email footer — no auth, no layout.
  { path: '/unsubscribe/:token', element: <UnsubscribePage /> },
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
            element: <RequirePermission perm="messaging.read" />,
            children: [
              { path: '/messaging/queue', element: <MessageQueuePage /> },
              { path: '/messaging/templates', element: <TemplateLibraryPage /> },
              { path: '/messaging/templates/:id', element: <TemplateEditorPage /> },
            ],
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
            element: <RequirePermission perm="blogs.read" />,
            children: [
              { path: '/blogs', element: <BlogsPage /> },
              { path: '/blogs/new', element: <BlogPostEditorPage /> },
              { path: '/blogs/:id/edit', element: <BlogPostEditorPage /> },
              { path: '/blogs/categories', element: <BlogCategoriesPage /> },
              { path: '/blogs/types', element: <BlogTypesPage /> },
            ],
          },
          {
            element: <RequirePermission perm="forms.read" />,
            children: [
              { path: '/website/lead-form', element: <GlobalFormPage /> },
              { path: '/marketing/forms', element: <CustomFormsPage /> },
              { path: '/marketing/forms/:id', element: <CustomFormEditorPage /> },
            ],
          },
          {
            element: <RequirePermission perm="projects.read" />,
            children: [{ path: '/website/projects', element: <ProjectsPage /> }],
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
          {
            element: <RequirePermission perm="settings.read" />,
            children: [
              { path: '/settings/notifications', element: <NotificationSettingsPage /> },
              { path: '/settings/lead-assignment', element: <LeadAssignmentPage /> },
              { path: '/settings/messaging', element: <MessagingSettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
