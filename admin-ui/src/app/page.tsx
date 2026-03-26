'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    router.replace(token ? '/dashboard' : '/login');
  }, [router]);
  return null;
}
