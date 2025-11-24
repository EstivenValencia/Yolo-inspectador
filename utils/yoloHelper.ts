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

export const getBoundingBoxStyle = (
  label: YoloLabel, 
  imgWidth: number, 
  imgHeight: number,
  isSelected: boolean,
  colorIndex: number
) => {
  // Convert center x/y to top/left
  const pixelW = label.w * imgWidth;
  const pixelH = label.h * imgHeight;
  const pixelX = (label.x * imgWidth) - (pixelW / 2);
  const pixelY = (label.y * imgHeight) - (pixelH / 2);

  return {
    left: `${pixelX}px`,
    top: `${pixelY}px`,
    width: `${pixelW}px`,
    height: `${pixelH}px`,
    borderColor: isSelected ? '#facc15' : getColor(colorIndex), // Yellow if selected, else cycled color
    boxShadow: isSelected ? '0 0 0 2px rgba(250, 204, 21, 0.5), 0 0 10px rgba(0,0,0,0.5)' : 'none',
    zIndex: isSelected ? 20 : 10
  };
};

const COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#f97316', // orange
  '#ec4899', // pink
  '#06b6d4', // cyan
];

export const getColor = (index: number) => COLORS[index % COLORS.length];
