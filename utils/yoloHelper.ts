import { YoloLabel } from '../types';

export const parseYoloString = (content: string): YoloLabel[] => {
  if (!content) return [];
  
  return content.split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) return null;
      
      const [classId, x, y, w, h] = parts.map(Number);
      
      // Basic validation
      if (isNaN(classId) || isNaN(x)) return null;

      return { classId, x, y, w, h };
    })
    .filter((l): l is YoloLabel => l !== null);
};

export const serializeYoloString = (labels: YoloLabel[]): string => {
  return labels.map(l => {
    return `${l.classId} ${l.x.toFixed(6)} ${l.y.toFixed(6)} ${l.w.toFixed(6)} ${l.h.toFixed(6)}`;
  }).join('\n');
};

export const getColor = (index: number) => {
  // Use a golden angle approximation to distribute colors evenly around the hue wheel
  // ensuring high contrast between consecutive indices.
  const hue = (index * 137.508) % 360;
  // Saturation 95%, Lightness 60% for good visibility on dark UI
  return `hsl(${hue}, 95%, 60%)`;
};

export const getLabelHash = (l: YoloLabel) => {
    // Generate a unique string signature for the label to track its review status
    // independent of its array index (which changes on delete)
    return `${l.classId}:${l.x.toFixed(6)}:${l.y.toFixed(6)}:${l.w.toFixed(6)}:${l.h.toFixed(6)}`;
};