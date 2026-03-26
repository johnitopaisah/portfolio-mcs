'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await adminApi.login(creds.username, creds.password);
      localStorage.setItem('admin_token', data.token);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Portfolio Admin</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to manage your content</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              className="input" type="text" required autoFocus
              value={creds.username}
              onChange={e => setCreds(p => ({ ...p, username: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input" type="password" required
              value={creds.password}
              onChange={e => setCreds(p => ({ ...p, password: e.target.value }))}
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-center text-sm text-gray-500 pt-1">
            <Link href="/forgot-password" className="text-indigo-400 hover:text-indigo-300 transition-colors">
              Forgot your password?
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
