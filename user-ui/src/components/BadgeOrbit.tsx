'use client';
import React from 'react';

const PATH = "M 0 0 C 190 -140, 190 140, 0 0 C -190 -140, -190 140, 0 0";
const DURATION = 14;

interface OrbitBadge {
  id: string;
  name?: string;
  credential_url?: string;
}

interface Props {
  orbitBadges: OrbitBadge[];
}

export default function BadgeOrbit({ orbitBadges }: Props) {
  if (!orbitBadges?.length) return null;

  const count = orbitBadges.length;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 3,
      }}
    >
      <style>{`
        @keyframes badge-orbit {
          from { offset-distance: 0%; }
          to   { offset-distance: 100%; }
        }
        @keyframes badge-depth {
          0%   { transform: scale(0.58); opacity: 0.38; }
          22%  { transform: scale(1.05); opacity: 1;    }
          47%  { transform: scale(1.08); opacity: 1;    }
          50%  { transform: scale(0.58); opacity: 0.38; }
          72%  { transform: scale(1.05); opacity: 1;    }
          97%  { transform: scale(1.08); opacity: 1;    }
          100% { transform: scale(0.58); opacity: 0.38; }
        }
        .orbit-badge-link:hover img {
          border-color: rgba(255,255,255,0.95);
          box-shadow: 0 0 22px rgba(124,58,237,0.7), 0 4px 18px rgba(0,0,0,0.45);
        }
      `}</style>

      {orbitBadges.map(({ id, name, credential_url }, i) => {
        const delay = `${(-(DURATION * i / count)).toFixed(2)}s`;
        const img = (
          <img
            src={`/api/certifications/${id}/image`}
            alt={name ?? ''}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '50%',
              border: '2.5px solid rgba(255,255,255,0.65)',
              boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
              display: 'block',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
          />
        );

        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              width: '54px',
              height: '54px',
              offsetPath: `path('${PATH}')`,
              offsetDistance: '0%',
              animation: [
                `badge-orbit ${DURATION}s linear ${delay} infinite`,
                `badge-depth ${DURATION}s ease-in-out ${delay} infinite`,
              ].join(', '),
            } as React.CSSProperties}
          >
            {credential_url ? (
              <a
                href={credential_url}
                target="_blank"
                rel="noopener noreferrer"
                title={name ? `Verify: ${name}` : 'Verify credential'}
                className="orbit-badge-link"
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                }}
                aria-label={name ? `Verify ${name} credential` : 'Verify credential'}
              >
                {img}
              </a>
            ) : img}
          </div>
        );
      })}
    </div>
  );
}
