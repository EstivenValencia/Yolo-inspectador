
import { YoloLabel } from '../types';

export interface BackendConfig {
  apiUrl: string;
  confidenceThreshold: number;
  iouThreshold: number;
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
  formData.append('confidence', config.confidenceThreshold.toString());
  formData.append('iou', config.iouThreshold.toString());

  try {
    const response = await fetch(`${config.apiUrl}/predict`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Validate and cast data
    if (Array.isArray(data)) {
        return data.map((item: any) => ({
            classId: Number(item.classId),
            x: Number(item.x),
            y: Number(item.y),
            w: Number(item.w),
            h: Number(item.h),
            isPredicted: true
        }));
    }
    return [];

  } catch (error) {
    console.error("Backend inference error:", error);
    throw error;
  }
};
