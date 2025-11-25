export interface YoloLabel {
  classId: number;
  x: number; // Center X (0-1)
  y: number; // Center Y (0-1)
  w: number; // Width (0-1)
  h: number; // Height (0-1)
}

// Define minimal interfaces for File System Access API
export interface FileSystemHandle {
  kind: 'file' | 'directory';
  name: string;
}

export interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(options?: any): Promise<FileSystemWritableFileStream>;
}

export interface FileSystemDirectoryHandle extends FileSystemHandle {
  kind: 'directory';
  values(): AsyncIterableIterator<FileSystemHandle | FileSystemFileHandle | FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

export interface FileSystemWritableFileStream extends WritableStream {
  write(data: any): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
}

export interface ImageAsset {
  name: string;
  url: string;
  file?: File;
  // Handle for potential future use
  handle?: FileSystemFileHandle; 
}

export interface DatasetContext {
  images: ImageAsset[];
  labels: Map<string, string>; // Filename (without ext) -> content
  classes: string[];
}