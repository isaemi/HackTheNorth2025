import api from "@/services/api";

export type RehabPayload = {
  areas: string[];
  painTypes: string[];
  intensity: number; // 0-10
  onset: string; // sudden | gradual | chronic
  duration?: string; // e.g., "2 weeks"
  aggravators?: string[];
  relievers?: string[];
  goals?: string;
  notes?: string;
};

export async function generateRehabPlan(payload: RehabPayload) {
  // Uses the shared axios instance configured to base "/api"
  const { data } = await api.post("/rehab/generate", payload);
  return data;
}

export default generateRehabPlan;
