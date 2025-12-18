export enum Rating {
  S = 'S', // Ad Quality / Masterpiece
  A = 'A', // Excellent / Client Happy
  B = 'B', // Standard / Deliverable
  Unrated = 'Unrated',
  Rejected = 'Rejected' // Optional internal state for very bad photos
}

export enum ProcessStatus {
  Idle = 'idle',
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Error = 'error'
}

export interface PhotoData {
  id: string;
  file: File;
  previewUrl: string;
  rating: Rating;
  reason: string;
  status: ProcessStatus;
}

export interface BatchStats {
  total: number;
  s_count: number;
  a_count: number;
  b_count: number;
  processed: number;
}

export interface GroupReport {
  overallGrade: 'S' | 'A' | 'B';
  summary: string;
  strengths: string[];
  improvements: string[];
}