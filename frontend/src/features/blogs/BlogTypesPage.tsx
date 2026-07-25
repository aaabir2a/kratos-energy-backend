import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Trash2, Edit2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useBlogTypes,
  useCreateBlogType,
  useUpdateBlogType,
  useDeleteBlogType,
  BlogType,
} from './api/blogsApi';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function BlogTypesPage() {
  const { data: types, isLoading } = useBlogTypes();
  const createMut = useCreateBlogType();
  const updateMut = useUpdateBlogType();
  const deleteMut = useDeleteBlogType();

  const [editingId, setEditingId] = useState<number | null>(null);

  const { register, handleSubmit, reset, setValue } = useForm<Partial<BlogType>>({
    defaultValues: { name: '', slug: '', description: '' },
  });

  const onSubmit = async (data: Partial<BlogType>) => {
    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, typeData: data });
        toast.success('Blog type updated successfully');
        setEditingId(null);
      } else {
        await createMut.mutateAsync(data);
        toast.success('Blog type created successfully');
      }
      reset({ name: '', slug: '', description: '' });
    } catch (e) {
      toast.error('Operation failed. Check if slug is unique.');
    }
  };

  const handleEdit = (typeObj: BlogType) => {
    setEditingId(typeObj.id);
    setValue('name', typeObj.name);
    setValue('slug', typeObj.slug);
    setValue('description', typeObj.description || '');
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete blog type? Posts assigned to it will be set to no type.')) return;
    try {
      await deleteMut.mutateAsync(id);
      toast.success('Blog type deleted');
    } catch (e) {
      toast.error('Failed to delete blog type');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    reset({ name: '', slug: '', description: '' });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (editingId) return;
    const val = e.target.value;
    const slug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    setValue('slug', slug);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="h-8">
          <Link to="/blogs" className="flex items-center gap-1 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Posts
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Blog Types"
        description="Types define the post layout format style (e.g. Article, FAQ, General Blog, How-To)."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CRUD Form */}
        <div className="bg-card border rounded-lg p-5 shadow-sm space-y-4 h-fit">
          <h3 className="font-bold text-[14px] text-gray-900 border-b pb-2">
            {editingId ? 'Edit Blog Type' : 'Create New Blog Type'}
          </h3>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-semibold">
                Type Name
              </Label>
              <Input
                id="name"
                {...register('name', { required: true })}
                onChange={(e) => {
                  register('name').onChange(e);
                  handleNameChange(e);
                }}
                placeholder="e.g. FAQ"
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug" className="text-xs font-semibold">
                Type Slug (URL identifier)
              </Label>
              <Input
                id="slug"
                {...register('slug', { required: true })}
                placeholder="e.g. faq"
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-semibold">
                Description (optional)
              </Label>
              <Input
                id="description"
                {...register('description')}
                placeholder="Short type description..."
                className="text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" size="sm" className="text-xs font-semibold flex-1">
                {editingId ? 'Save Changes' : 'Create Blog Type'}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" size="sm" onClick={handleCancel} className="text-xs">
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Types List */}
        <div className="md:col-span-2 bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/10">
            <h3 className="font-bold text-[14px] text-gray-900">All Blog Types</h3>
          </div>
          {isLoading ? (
            <div className="p-5 space-y-2">
              <div className="h-8 bg-muted rounded animate-pulse" />
              <div className="h-8 bg-muted rounded animate-pulse" />
            </div>
          ) : !types || types.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-xs">No blog types created yet.</div>
          ) : (
            <div className="divide-y text-xs">
              {types.map((typeObj) => (
                <div key={typeObj.id} className="p-4 flex items-center justify-between hover:bg-muted/5 transition-colors">
                  <div className="space-y-1">
                    <p className="font-bold text-gray-900">{typeObj.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">/{typeObj.slug}</p>
                    {typeObj.description && <p className="text-[11px] text-muted-foreground">{typeObj.description}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(typeObj)} className="h-7 w-7 p-0">
                      <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(typeObj.id)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
