import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";

export type PainFormValues = {
  areas: string[];
  painTypes: string[];
  intensity: number; // 0-10
  onset: string; // sudden | gradual | chronic
  duration?: string;
  aggravators: string[];
  relievers: string[];
  goals?: string;
  notes?: string;
};

const AREAS = [
  "Neck",
  "Shoulder",
  "Upper Back",
  "Lower Back",
  "Hip",
  "Knee",
  "Ankle",
  "Foot",
  "Elbow",
  "Wrist",
  "Hand",
];

const PAIN_TYPES = ["Sharp", "Dull", "Aching", "Burning", "Tingling", "Stiffness"];
const AGGRAVATORS = ["Squatting", "Bending", "Lifting", "Running", "Overhead", "Twisting", "Sitting", "Standing"];
const RELIEVERS = ["Rest", "Ice", "Heat", "Stretching", "Massage", "Medication"];

export function PainForm({ onSubmit, submitting }: { onSubmit: (values: PainFormValues) => void; submitting?: boolean }) {
  const [areas, setAreas] = useState<string[]>([]);
  const [painTypes, setPainTypes] = useState<string[]>([]);
  const [intensity, setIntensity] = useState<number>(4);
  const [onset, setOnset] = useState<string>("gradual");
  const [duration, setDuration] = useState<string>("");
  const [aggravators, setAggravators] = useState<string[]>([]);
  const [relievers, setRelievers] = useState<string[]>([]);
  const [goals, setGoals] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ areas, painTypes, intensity, onset, duration, aggravators, relievers, goals, notes });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Where is your pain?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AREAS.map((a) => (
                <Button
                  key={a}
                  type="button"
                  variant={areas.includes(a) ? "default" : "outline"}
                  className="justify-center"
                  onClick={() => toggle(areas, setAreas, a)}
                >
                  {a}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Describe the pain</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block">Pain type</Label>
              <div className="flex flex-wrap gap-2">
                {PAIN_TYPES.map((t) => (
                  <Badge
                    key={t}
                    onClick={() => toggle(painTypes, setPainTypes, t)}
                    className={`cursor-pointer ${painTypes.includes(t) ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  >
                    {t}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Intensity: {intensity}/10</Label>
              <Slider value={[intensity]} max={10} step={1} onValueChange={(v) => setIntensity(v[0] ?? 0)} />
            </div>

            <div>
              <Label className="mb-2 block">Onset</Label>
              <div className="flex gap-2">
                {[{"k":"sudden","l":"Sudden"},{"k":"gradual","l":"Gradual"},{"k":"chronic","l":"Chronic"}].map((o) => (
                  <Button
                    key={o.k}
                    type="button"
                    variant={onset === o.k ? "default" : "outline"}
                    onClick={() => setOnset(o.k)}
                  >
                    {o.l}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="duration" className="mb-2 block">How long?</Label>
              <Textarea id="duration" placeholder="e.g., 2 weeks, 3 months" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>What makes it better or worse?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block">Aggravating movements</Label>
              <div className="flex flex-wrap gap-2">
                {AGGRAVATORS.map((m) => (
                  <Badge
                    key={m}
                    onClick={() => toggle(aggravators, setAggravators, m)}
                    className={`cursor-pointer ${aggravators.includes(m) ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}
                  >
                    {m}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">What brings relief?</Label>
              <div className="flex flex-wrap gap-2">
                {RELIEVERS.map((m) => (
                  <Badge
                    key={m}
                    onClick={() => toggle(relievers, setRelievers, m)}
                    className={`cursor-pointer ${relievers.includes(m) ? "bg-emerald-600 text-emerald-50" : "bg-muted"}`}
                  >
                    {m}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your goals</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea placeholder="e.g., Run 5km pain-free, lift overhead without pain" value={goals} onChange={(e) => setGoals(e.target.value)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anything else we should know?</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea placeholder="Previous injuries, diagnoses, or context" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center mt-8">
        <Button type="submit" size="lg" className="min-w-[220px]" disabled={submitting}>
          {submitting ? "Generating Plan…" : "Generate Rehab Plan"}
        </Button>
      </div>
    </form>
  );
}

export default PainForm;

