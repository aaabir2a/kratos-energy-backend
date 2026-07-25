import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Eye, EyeOff, Calendar, User, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { useBlogs, usePublishBlogPost, useDeleteBlogPost, useBlogCategories, useBlogTypes } from './api/blogsApi';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export function BlogsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [typeId, setTypeId] = useState<number | undefined>(undefined);

  const { data, isLoading } = useBlogs({
    page,
    limit: 10,
    search,
    status,
    categoryId,
    typeId,
  });

  const { data: categories } = useBlogCategories();
  const { data: types } = useBlogTypes();

  const publishMut = usePublishBlogPost();
  const deleteMut = useDeleteBlogPost();

  const handleTogglePublish = async (id: number) => {
    try {
      await publishMut.mutateAsync(id);
      toast.success('Publish status toggled');
    } catch (e) {
      toast.error('Failed to change publish status');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this blog post?')) return;
    try {
      await deleteMut.mutateAsync(id);
      toast.success('Blog post deleted');
    } catch (e) {
      toast.error('Failed to delete blog post');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog Posts"
        description="Create and manage your website articles, guides, and FAQ resources."
        action={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/blogs/categories">Manage Categories</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/blogs/types">Manage Types</Link>
            </Button>
            <Button asChild>
              <Link to="/blogs/new" className="flex items-center gap-1">
                <Plus className="w-4 h-4" />
                New Post
              </Link>
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-card border rounded-lg p-4 shadow-sm">
        <input
          type="text"
          placeholder="Search by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary w-full"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-xs bg-white w-full"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        <select
          value={categoryId || ''}
          onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value) : undefined)}
          className="border rounded-md px-3 py-1.5 text-xs bg-white w-full"
        >
          <option value="">All Categories</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={typeId || ''}
          onChange={(e) => setTypeId(e.target.value ? parseInt(e.target.value) : undefined)}
          className="border rounded-md px-3 py-1.5 text-xs bg-white w-full"
        >
          <option value="">All Types</option>
          {types?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch('');
            setStatus('');
            setCategoryId(undefined);
            setTypeId(undefined);
          }}
          className="text-xs font-semibold h-full w-full"
        >
          Clear Filters
        </Button>
      </div>

      {/* Post Grid/Table */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !data?.posts || data.posts.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card shadow-sm">
          <p className="text-muted-foreground text-sm">No blog posts found matching current filters.</p>
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
          <div className="divide-y">
            {data.posts.map((post) => (
              <div key={post.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/5 transition-colors">
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={post.status === 'published' ? 'default' : 'secondary'} className="text-[10px] py-0.5 px-2 font-semibold">
                      {post.status}
                    </Badge>
                    {post.category && (
                      <Badge variant="outline" className="text-[10px] py-0.5 px-2 bg-blue-50/50 border-blue-200 text-blue-700">
                        {post.category.name}
                      </Badge>
                    )}
                    {post.type && (
                      <Badge variant="outline" className="text-[10px] py-0.5 px-2 bg-green-50/50 border-green-200 text-green-700">
                        {post.type.name}
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-[16px] text-gray-900 leading-snug">
                    <Link to={`/blogs/${post.id}/edit`} className="hover:text-primary transition-colors">
                      {post.title}
                    </Link>
                  </h3>
                  {post.excerpt && <p className="text-xs text-muted-foreground line-clamp-2">{post.excerpt}</p>}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {post.author || 'Kratos Energy'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : 'Unpublished'}
                    </span>
                    {post.readMins && (
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {post.readMins} min read
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/blogs/${post.id}/edit`)} className="h-8 text-xs font-semibold flex items-center gap-1">
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTogglePublish(post.id)}
                    className="h-8 text-xs font-semibold flex items-center gap-1"
                  >
                    {post.status === 'published' ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Unpublish
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Publish
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(post.id)}
                    className="h-8 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {data.pagination && data.pagination.totalPages > 1 && (
            <div className="px-5 py-3 border-t bg-muted/10 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="h-8 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="h-8 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
