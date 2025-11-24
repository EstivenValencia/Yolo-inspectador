export interface YoloLabel {
  classId: number;
  x: number; // Center X (0-1)
  y: number; // Center Y (0-1)
  w: number; // Width (0-1)
  h: number; // Height (0-1)
}

export interface ImageAsset {
  name: string;
  url: string;
  file: File;
}

export interface LabelFile {
  name: string;
  content: string;
}

export interface DatasetContext {
  images: ImageAsset[];
  labels: Map<string, string>; // Filename (without ext) -> content
  classes: string[];
}
