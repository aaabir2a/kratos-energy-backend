import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt?: string;
  author?: string;
  featuredImage?: string;
  readMins?: number;
  tags: string[];
  blocks: any[];
  status: 'draft' | 'published';
  categoryId?: number | null;
  typeId?: number | null;
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  category?: { id: number; name: string; slug: string };
  type?: { id: number; name: string; slug: string };
}

export interface BlogCategory {
  id: number;
  name: string;
  slug: string;
  description?: string;
}

export interface BlogType {
  id: number;
  name: string;
  slug: string;
  description?: string;
}

export interface QueryParams {
  page?: number;
  limit?: number;
  status?: string;
  categoryId?: number;
  typeId?: number;
  search?: string;
}

// ── POSTS HOOKS ──

export function useBlogs(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['blogs', params],
    queryFn: async () => {
      const { data } = await api.get<{
        success: true;
        data: {
          posts: BlogPost[];
          pagination: { total: number; page: number; limit: number; totalPages: number };
        };
      }>('/blogs/posts', { params });
      return data.data;
    },
  });
}

export function useBlogPost(id?: number) {
  return useQuery({
    queryKey: ['blogs', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await api.get<{ success: true; data: BlogPost }>(`/blogs/posts/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postData: Partial<BlogPost>) => {
      const { data } = await api.post<{ success: true; data: BlogPost }>('/blogs/posts', postData);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blogs'] });
    },
  });
}

export function useUpdateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, postData }: { id: number; postData: Partial<BlogPost> }) => {
      const { data } = await api.put<{ success: true; data: BlogPost }>(`/blogs/posts/${id}`, postData);
      return data.data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['blogs'] });
      qc.invalidateQueries({ queryKey: ['blogs', id] });
    },
  });
}

export function useDeleteBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/blogs/posts/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blogs'] });
    },
  });
}

export function usePublishBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<{ success: true; data: BlogPost }>(`/blogs/posts/${id}/publish`);
      return data.data;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['blogs'] });
      qc.invalidateQueries({ queryKey: ['blogs', id] });
    },
  });
}

// ── CATEGORIES HOOKS ──

export function useBlogCategories() {
  return useQuery({
    queryKey: ['blog-categories'],
    queryFn: async () => {
      const { data } = await api.get<{ success: true; data: BlogCategory[] }>('/blogs/categories');
      return data.data;
    },
  });
}

export function useCreateBlogCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (catData: Partial<BlogCategory>) => {
      const { data } = await api.post<{ success: true; data: BlogCategory }>('/blogs/categories', catData);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blog-categories'] });
    },
  });
}

export function useUpdateBlogCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, catData }: { id: number; catData: Partial<BlogCategory> }) => {
      const { data } = await api.put<{ success: true; data: BlogCategory }>(`/blogs/categories/${id}`, catData);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blog-categories'] });
    },
  });
}

export function useDeleteBlogCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/blogs/categories/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blog-categories'] });
    },
  });
}

// ── TYPES HOOKS ──

export function useBlogTypes() {
  return useQuery({
    queryKey: ['blog-types'],
    queryFn: async () => {
      const { data } = await api.get<{ success: true; data: BlogType[] }>('/blogs/types');
      return data.data;
    },
  });
}

export function useCreateBlogType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (typeData: Partial<BlogType>) => {
      const { data } = await api.post<{ success: true; data: BlogType }>('/blogs/types', typeData);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blog-types'] });
    },
  });
}

export function useUpdateBlogType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, typeData }: { id: number; typeData: Partial<BlogType> }) => {
      const { data } = await api.put<{ success: true; data: BlogType }>(`/blogs/types/${id}`, typeData);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blog-types'] });
    },
  });
}

export function useDeleteBlogType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/blogs/types/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blog-types'] });
    },
  });
}
