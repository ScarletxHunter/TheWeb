declare module 'tus-js-client' {
  export interface TusResponse {
    getBody?: () => string;
    getStatus?: () => number;
  }

  export interface TusError extends Error {
    originalResponse?: TusResponse;
  }

  export interface PreviousUpload {
    url?: string;
  }

  export interface UploadOptions {
    endpoint: string;
    retryDelays?: number[];
    headers?: Record<string, string>;
    uploadDataDuringCreation?: boolean;
    removeFingerprintOnSuccess?: boolean;
    metadata?: Record<string, string>;
    chunkSize?: number;
    onError?: (error: TusError) => void;
    onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
    onSuccess?: () => void;
  }

  export class Upload {
    constructor(file: Blob, options: UploadOptions);
    file: Blob;
    url?: string | null;
    findPreviousUploads(): Promise<PreviousUpload[]>;
    resumeFromPreviousUpload(previousUpload: PreviousUpload): void;
    start(): void;
  }
}
