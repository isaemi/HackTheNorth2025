import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const Session = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // PresetWorkout.tsx에서 넘긴 state
  const {
    level,
    style,
    duration,
    injuries,
    routines,
  } = (location.state as any) || {};

  if (!routines) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>No workout data found. Please go back and try again.</p>
      </div>
    );
  }

  // Cohere 응답에 맞춰 workout_plan 안쪽 routine 꺼내기
  const workoutPlan = routines?.workout_plan || {};
  const routineList = workoutPlan.routine || [];

  return (
    <div className="min-h-screen bg-gradient-background p-6">
      {/* Header */}
      <div className="flex items-center mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      </div>

      <h1 className="text-3xl font-bold text-center mb-2">
        {workoutPlan.style || style} Session
      </h1>
      <p className="text-center text-muted-foreground mb-6">
        Level: {workoutPlan.level || level} • Duration:{" "}
        {workoutPlan.duration || duration}{" "}
        {injuries ? `• Injuries: ${injuries}` : ""}
      </p>

      {/* Routine list */}
      <div className="grid md:grid-cols-2 gap-4">
        {routineList.map((exercise: any, idx: number) => (
          <Card
            key={idx}
            className="bg-white/95 backdrop-blur-sm border-0 shadow-card"
          >
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                {exercise.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                {exercise.description}
              </p>
              <p className="text-sm font-medium">
                Duration: {exercise.duration || "N/A"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Session;
