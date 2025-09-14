import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";

// Shared types based on backend models
export type Exercise = {
  name: string;
  duration: string;
  description: string;
  difficulty: string;
  modifications?: string[];
};

export type WorkoutResponse = {
  workoutName: string;
  totalDuration: string;
  exercises: Exercise[];
};

type WorkoutContextValue = {
  workout: WorkoutResponse | null;
  setWorkout: (w: WorkoutResponse | null) => void;
  // Camera permission helpers
  cameraStatus: "idle" | "pending" | "granted" | "denied" | "unsupported";
  ensureCamera: () => Promise<boolean>;
};

const WorkoutContext = createContext<WorkoutContextValue | undefined>(undefined);

export const WorkoutProvider = ({ children }: { children: ReactNode }) => {
  const [workout, setWorkout] = useState<WorkoutResponse | null>(null);
  const [cameraStatus, setCameraStatus] = useState<
    "idle" | "pending" | "granted" | "denied" | "unsupported"
  >("idle");
  const { toast } = useToast();

  const ensureCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setCameraStatus("unsupported");
      toast({
        title: "Camera not supported",
        description: "This browser does not support camera access.",
        variant: "destructive" as any,
      } as any);
      return false;
    }

    try {
      setCameraStatus("pending");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      // Immediately release; MediaPipe will acquire its own stream later.
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {}
      setCameraStatus("granted");
      toast({ title: "Camera enabled", description: "You're all set." });
      return true;
    } catch (err: any) {
      const name = err?.name || "Error";
      setCameraStatus(name === "NotAllowedError" ? "denied" : "idle");
      const description =
        name === "NotAllowedError"
          ? "Camera permission was blocked. Enable it in your browser settings and reload."
          : name === "NotFoundError"
          ? "No camera device found."
          : name === "NotReadableError"
          ? "Camera is in use by another app."
          : "Could not access the camera.";
      toast({
        title: "Camera access failed",
        description,
        variant: "destructive" as any,
        open: true,
      } as any);
      return false;
    }
  }, [toast]);

  // On load, nudge the user to enable camera with a one-click toast action.
  useEffect(() => {
    let shown = false;
    const checkPermissionAndPrompt = async () => {
      try {
        // Prefer Permissions API if available
        const anyNav = navigator as any;
        if (anyNav?.permissions?.query) {
          const status = await anyNav.permissions.query({ name: "camera" as any });
          if (status?.state === "granted") {
            setCameraStatus("granted");
            return;
          }
          if (status?.state === "denied") {
            setCameraStatus("denied");
            toast({
              title: "Camera blocked",
              description: "Enable camera permissions in your browser and reload.",
              variant: "destructive" as any,
            } as any);
            return;
          }
          // state === "prompt" → show CTA toast below
        }
      } catch {}

      if (!shown) {
        shown = true;
        toast({
          title: "Enable your camera",
          description: "We use it to score your form.",
          action: (
            <ToastAction altText="Enable camera" onClick={ensureCamera}>
              Enable Camera
            </ToastAction>
          ),
          open: true,
        } as any);
      }
    };

    checkPermissionAndPrompt();
  }, [ensureCamera, toast]);

  return (
    <WorkoutContext.Provider
      value={{ workout, setWorkout, cameraStatus, ensureCamera }}
    >
      {children}
    </WorkoutContext.Provider>
  );
};

export const useWorkout = () => {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error("useWorkout must be used within a WorkoutProvider");
  return ctx;
};
