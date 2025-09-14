import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useWorkout } from "@/context/WorkoutContext";
import PainForm, { PainFormValues } from "@/components/rehab/PainForm";
import { generateRehabPlan } from "@/services/rehab";

import backgroundImage from "@/assets/background-image.png"; 

const Rehab = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setWorkout } = useWorkout();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: PainFormValues) => {
    // ... (your form submission logic remains the same)
    setSubmitting(true);
    const pending = toast({ title: "Generating rehab plan", description: "Personalizing to your symptoms…" });
    try {
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
      setWorkout(data);
      pending.update({ title: "Rehab plan ready", description: data?.workoutName || "Let's get moving", open: true } as any);
      navigate("/session");
      setTimeout(() => pending.dismiss?.(), 2500);
    } catch (err) {
      console.error("Rehab generation failed", err);
      pending.update({ title: "Could not generate plan", description: "Please adjust inputs and try again.", variant: "destructive", open: true } as any);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div 
      className="min-h-screen p-4 flex items-center justify-center bg-cover bg-center"
      style={{ backgroundImage: `url(${backgroundImage})` }}
    >
      {/* Card now has relative positioning and the custom-scrollbar class */}
      <Card className="w-full max-w-4xl bg-white/80 backdrop-blur-sm border-0 shadow-lg max-h-[85vh] overflow-y-auto relative custom-scrollbar">
        {/* CardHeader is centered and has padding for the button */}
        <CardHeader className="pt-12 text-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            // Button is positioned absolutely within the card
            className="absolute top-4 left-4 text-gray-600 hover:bg-black/10 hover:text-black" 
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <CardTitle className="text-2xl">Tell us about your pain</CardTitle>
          <CardDescription>
            We’ll craft a safe, targeted plan based on your symptoms and goals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PainForm onSubmit={handleSubmit} submitting={submitting} />
        </CardContent>
      </Card>
    </div>
  );
};

export default Rehab;