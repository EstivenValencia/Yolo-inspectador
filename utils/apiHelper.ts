
import { YoloLabel } from '../types';

export interface BackendConfig {
  apiUrl: string;
  confidenceThreshold: number;
  iouThreshold: number;
  // SAHI Parameters
  sliceHeight: number;
  sliceWidth: number;
  overlapHeightRatio: number;
  overlapWidthRatio: number;
}

export const checkBackendHealth = async (url: string): Promise<boolean> => {
  try {
    const res = await fetch(`${url}/health`);
    return res.ok;
  } catch (e) {
    return false;
  }
};

export const detectObjects = async (
  imageFile: File,
  config: BackendConfig
): Promise<YoloLabel[]> => {
  const formData = new FormData();
  formData.append('image', imageFile);
  
  // Map frontend config names to backend expected names
  formData.append('confidence', config.confidenceThreshold.toString());
  formData.append('iou', config.iouThreshold.toString());
  
  // SAHI Params
  formData.append('slice_height', config.sliceHeight.toString());
  formData.append('slice_width', config.sliceWidth.toString());
  formData.append('overlap_height', config.overlapHeightRatio.toString());
  formData.append('overlap_width', config.overlapWidthRatio.toString());

  try {
    const response = await fetch(`${config.apiUrl}/predict`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Validar y castear datos
    if (Array.isArray(data)) {
        return data.map((item: any) => ({
            classId: Number(item.classId),
            x: Number(item.x),
            y: Number(item.y),
            w: Number(item.w),
            h: Number(item.h),
            isPredicted: true,
            confidence: item.confidence ? Number(item.confidence) : undefined
        }));
    }
    return [];

  } catch (error) {
    console.error("Backend inference error:", error);
    throw error;
  }
};