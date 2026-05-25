'use client';
import React from 'react';

// Figure-8 (lemniscate) path centered at origin.
// Horizontal span ≈ ±190px, vertical span ≈ ±140px — scaled to sit just
// outside the 22rem (352px) avatar circle.
const PATH = "M 0 0 C 190 -140, 190 140, 0 0 C -190 -140, -190 140, 0 0";
const DURATION = 14; // seconds per full orbit

interface Props {
  orbitBadgeIds: string[];
}

export default function BadgeOrbit({ orbitBadgeIds }: Props) {
  if (!orbitBadgeIds?.length) return null;

  const count = orbitBadgeIds.length;

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
      `}</style>

      {orbitBadgeIds.map((id, i) => {
        const delay = `${(-(DURATION * i / count)).toFixed(2)}s`;
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
            <img
              src={`/api/certifications/${id}/image`}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '50%',
                border: '2.5px solid rgba(255,255,255,0.65)',
                boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
                display: 'block',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
