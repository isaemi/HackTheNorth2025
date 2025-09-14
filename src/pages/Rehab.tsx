import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useWorkout } from "@/context/WorkoutContext";
import PainForm, { PainFormValues } from "@/components/rehab/PainForm";
import { generateRehabPlan } from "@/services/rehab";

const Rehab = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setWorkout } = useWorkout();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: PainFormValues) => {
    setSubmitting(true);
    const pending = toast({ title: "Generating rehab plan", description: "Personalizing to your symptoms…" });
    try {
      // Build payload; keep keys readable for the backend
      const payload = {
        areas: values.areas,
        painTypes: values.painTypes,
        intensity: values.intensity,
        onset: values.onset,
        duration: values.duration?.trim() || undefined,
        aggravators: values.aggravators,
        relievers: values.relievers,
        goals: values.goals?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
      };

      const data = await generateRehabPlan(payload);

      // Store in context and proceed to session
      setWorkout(data);

      try {
        pending.update({
          title: "Rehab plan ready",
          description: data?.workoutName || "Let's get moving",
          open: true,
        } as any);
      } catch {}

      navigate("/session");
      setTimeout(() => pending.dismiss?.(), 2500);
    } catch (err) {
      console.error("Rehab generation failed", err);
      pending.update({
        title: "Could not generate plan",
        description: "Please adjust inputs and try again.",
        variant: "destructive",
        open: true,
      } as any);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
          <h1 className="text-3xl font-bold">Begin Rehab</h1>
        </div>

        {/* Intro */}
        <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
          <CardHeader>
            <CardTitle>Tell us about your pain</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              We’ll craft a safe, targeted plan based on your symptoms and goals. You can start your session right after.
            </p>
            <PainForm onSubmit={handleSubmit} submitting={submitting} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Rehab;

