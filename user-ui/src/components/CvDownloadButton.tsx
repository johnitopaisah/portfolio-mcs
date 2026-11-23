'use client';
import { openCvRequest } from './CvRequestDialog';

// The CV is emailed (CvRequestDialog) so John knows who received it.
export default function CvDownloadButton() {
  return (
    <button type="button" onClick={() => openCvRequest({ source: 'hero' })} className="btn-outline" aria-haspopup="dialog">
      Get my CV ↓
    </button>
  );
}
