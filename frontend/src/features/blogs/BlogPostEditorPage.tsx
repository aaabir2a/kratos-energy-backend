import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { ArrowLeft, CheckCircle2, Globe, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useBlogPost,
  useCreateBlogPost,
  useUpdateBlogPost,
  useBlogCategories,
  useBlogTypes,
  BlogPost,
} from './api/blogsApi';
import BlockEditor from './components/BlockEditor';
import BlogImageUpload from './components/BlogImageUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

export function BlogPostEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const postId = id ? parseInt(id) : undefined;

  const { data: post, isLoading: isPostLoading } = useBlogPost(postId);
  const { data: categories } = useBlogCategories();
  const { data: types } = useBlogTypes();

  const createMut = useCreateBlogPost();
  const updateMut = useUpdateBlogPost();

  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);

  const { register, handleSubmit, reset, setValue, control, watch } = useForm<Partial<BlogPost>>({
    defaultValues: {
      title: '',
      slug: '',
      excerpt: '',
      author: 'Kratos Energy',
      featuredImage: '',
      status: 'draft',
      metaTitle: '',
      metaDescription: '',
      canonicalUrl: '',
    },
  });

  const watchTitle = watch('title');

  // Load post details if editing
  useEffect(() => {
    if (post) {
      reset({
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt || '',
        author: post.author || 'Kratos Energy',
        featuredImage: post.featuredImage || '',
        categoryId: post.categoryId || undefined,
        typeId: post.typeId || undefined,
        status: post.status,
        metaTitle: post.metaTitle || '',
        metaDescription: post.metaDescription || '',
        canonicalUrl: post.canonicalUrl || '',
      });
      setTags(post.tags || []);
      setBlocks(post.blocks || []);
    }
  }, [post, reset]);

  // Real-time slug auto-generation
  useEffect(() => {
    if (!postId && watchTitle) {
      const slug = watchTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      setValue('slug', slug);
    }
  }, [watchTitle, setValue, postId]);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = tagInput.trim().toLowerCase();
      if (tag && !tags.includes(tag)) {
        setTags([...tags, tag]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const onSubmit = async (formData: Partial<BlogPost>) => {
    const postPayload = {
      ...formData,
      tags,
      blocks,
      categoryId: formData.categoryId ? Number(formData.categoryId) : null,
      typeId: formData.typeId ? Number(formData.typeId) : null,
    };

    try {
      if (postId) {
        await updateMut.mutateAsync({ id: postId, postData: postPayload });
        toast.success('Blog post updated successfully');
      } else {
        const newPost = await createMut.mutateAsync(postPayload);
        toast.success('Blog post created successfully');
        navigate(`/blogs/${newPost.id}/edit`);
      }
    } catch (e) {
      toast.error('Failed to save blog post. Check if slug is unique.');
    }
  };

  if (isPostLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header toolbar */}
      <div className="flex items-center justify-between border-b pb-4">
        <Button variant="ghost" size="sm" asChild className="h-8">
          <Link to="/blogs" className="flex items-center gap-1 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Posts
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSubmit((data) => onSubmit({ ...data, status: 'draft' }))}
            className="h-8 text-xs font-semibold"
            disabled={createMut.isPending || updateMut.isPending}
          >
            Save Draft
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit((data) => onSubmit({ ...data, status: 'published' }))}
            className="h-8 text-xs font-semibold flex items-center gap-1 bg-green-600 hover:bg-green-700"
            disabled={createMut.isPending || updateMut.isPending}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Publish
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Editor Area (Col 1-3) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-card border rounded-lg p-6 shadow-sm space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-xs font-bold text-gray-800">
                Post Title
              </Label>
              <Input
                id="title"
                {...register('title', { required: true })}
                placeholder="Enter title here..."
                className="text-lg font-bold py-6"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slug" className="text-xs font-bold text-gray-800">
                Post URL Slug
              </Label>
              <Input
                id="slug"
                {...register('slug', { required: true })}
                placeholder="post-url-slug"
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="excerpt" className="text-xs font-bold text-gray-800">
                Excerpt
              </Label>
              <Textarea
                id="excerpt"
                {...register('excerpt')}
                placeholder="Brief summary of the post..."
                className="text-xs min-h-[80px]"
              />
            </div>
          </div>

          {/* Block Editor */}
          <div className="bg-card border rounded-lg p-6 shadow-sm">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-4 border-b pb-2">
              Post Content Blocks
            </h3>
            <BlockEditor initialBlocks={blocks} onChange={setBlocks} />
          </div>
        </div>

        {/* Sidebar Settings (Col 4) */}
        <div className="space-y-6">
          {/* Post Settings */}
          <div className="bg-card border rounded-lg p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-[13px] text-gray-900 border-b pb-2">Post Settings</h3>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Cover Image</Label>
              <Controller
                name="featuredImage"
                control={control}
                render={({ field }) => (
                  <BlogImageUpload value={field.value || ''} onChange={field.onChange} />
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="categoryId" className="text-xs font-semibold">
                Category
              </Label>
              <select
                id="categoryId"
                {...register('categoryId')}
                className="w-full border rounded-md px-3 py-1.5 text-xs bg-white"
              >
                <option value="">No Category</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="typeId" className="text-xs font-semibold">
                Blog Type
              </Label>
              <select
                id="typeId"
                {...register('typeId')}
                className="w-full border rounded-md px-3 py-1.5 text-xs bg-white"
              >
                <option value="">No Type</option>
                {types?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="author" className="text-xs font-semibold">
                Author Name
              </Label>
              <Input id="author" {...register('author')} className="text-xs" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tags</Label>
              <div className="space-y-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="Type tag and press Enter..."
                  className="text-xs"
                />
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px] py-0.5 px-2 flex items-center gap-1">
                        {t}
                        <button type="button" onClick={() => handleRemoveTag(t)}>
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SEO Settings */}
          <div className="bg-card border rounded-lg p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-[13px] text-gray-900 border-b pb-2 flex items-center gap-1">
              <Globe className="w-4 h-4 text-primary" />
              SEO & Metadata
            </h3>

            <div className="space-y-1.5">
              <Label htmlFor="metaTitle" className="text-xs font-semibold">
                Meta Title
              </Label>
              <Input
                id="metaTitle"
                {...register('metaTitle')}
                placeholder="Google search listing title..."
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="metaDescription" className="text-xs font-semibold">
                Meta Description
              </Label>
              <Textarea
                id="metaDescription"
                {...register('metaDescription')}
                placeholder="Google search summary (max 160 characters)..."
                className="text-xs min-h-[60px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="canonicalUrl" className="text-xs font-semibold">
                Canonical URL
              </Label>
              <Input
                id="canonicalUrl"
                {...register('canonicalUrl')}
                placeholder="https://..."
                className="text-xs"
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
