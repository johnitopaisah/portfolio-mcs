import { api } from '@/lib/api';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import ProjectsSection from '@/components/ProjectsSection';
import SkillsSection from '@/components/SkillsSection';
import ExperienceSection from '@/components/ExperienceSection';
import CertificationsSection from '@/components/CertificationsSection';
import ContactSection from '@/components/ContactSection';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [profile, projects, skills, experiences, certifications] = await Promise.all([
    api.getProfile().catch(() => null),
    api.getProjects().catch(() => []),
    api.getSkills().catch(() => []),
    api.getExperiences().catch(() => []),
    api.getCertifications().catch(() => []),
  ]);

  return (
    <>
      <Navbar />
      <main>
        <HeroSection profile={profile} />
        <ProjectsSection projects={projects} />
        <SkillsSection skills={skills} />
        <ExperienceSection experiences={experiences} />
        <CertificationsSection certifications={certifications} />
        <ContactSection />
      </main>

      <footer className="border-t border-zinc-800/60 py-10 mt-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-zinc-500 text-sm">
            © {new Date().getFullYear()} John Itopa ISAH
          </p>
          <p className="text-zinc-700 text-xs font-mono">
            Built with Next.js · Deployed on Kubernetes
          </p>
          <div className="flex gap-5">
            {[
              { label: 'GitHub',   href: '#' },
              { label: 'LinkedIn', href: '#' },
            ].map(l => (
              <a key={l.label} href={l.href}
                className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}
