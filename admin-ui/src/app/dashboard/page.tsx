'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState({ projects: 0, skills: 0, experiences: 0, certifications: 0, unread: 0 });

  useEffect(() => {
    Promise.all([
      adminApi.getProjects(),
      adminApi.getSkills(),
      adminApi.getExperiences(),
      adminApi.getCertifications(),
      adminApi.getMessages(),
    ]).then(([projects, skills, experiences, certifications, messages]) => {
      setStats({
        projects: projects?.length ?? 0,
        skills: skills?.length ?? 0,
        experiences: experiences?.length ?? 0,
        certifications: certifications?.length ?? 0,
        unread: messages?.filter((m: any) => !m.read).length ?? 0,
      });
    }).catch(() => {});
  }, []);

  const cards = [
    { label: 'Projects',       value: stats.projects,       href: '/dashboard/projects',       icon: '◈' },
    { label: 'Skills',         value: stats.skills,         href: '/dashboard/skills',         icon: '◎' },
    { label: 'Experiences',    value: stats.experiences,    href: '/dashboard/experience',     icon: '◷' },
    { label: 'Certifications', value: stats.certifications, href: '/dashboard/certifications', icon: '✦' },
    { label: 'Unread Messages',value: stats.unread,         href: '/dashboard/messages',       icon: '✉' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
      <p className="text-gray-500 text-sm mb-8">Overview of your portfolio content</p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(c => (
          <Link key={c.label} href={c.href}
            className="card hover:border-indigo-500/50 transition-colors block">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{c.icon}</span>
              <span className="text-3xl font-bold text-white">{c.value}</span>
            </div>
            <p className="text-gray-400 text-sm">{c.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
