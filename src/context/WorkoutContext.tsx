import React, { createContext, useContext, useState, ReactNode } from "react";

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
};

const WorkoutContext = createContext<WorkoutContextValue | undefined>(undefined);

export const WorkoutProvider = ({ children }: { children: ReactNode }) => {
  const [workout, setWorkout] = useState<WorkoutResponse | null>(null);
  return (
    <WorkoutContext.Provider value={{ workout, setWorkout }}>
      {children}
    </WorkoutContext.Provider>
  );
};

export const useWorkout = () => {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error("useWorkout must be used within a WorkoutProvider");
  return ctx;
};

