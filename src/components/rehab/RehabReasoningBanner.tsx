import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

export function RehabReasoningBanner({ reasoning }: { reasoning?: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (!reasoning || dismissed) return null;

  // Try to split to readable chunks
  const paragraphs = reasoning
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Card className="mb-6 border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/20">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-600 text-emerald-50">Rehab Insight</Badge>
            <div className="text-sm text-muted-foreground">Why these exercises were chosen</div>
          </div>
          <button onClick={() => setDismissed(true)} className="text-xs text-muted-foreground hover:underline">
            Dismiss
          </button>
        </div>
        <Accordion type="single" collapsible defaultValue="why">
          <AccordionItem value="why">
            <AccordionTrigger>Show reasoning</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 text-sm leading-relaxed">
                {paragraphs.length > 1
                  ? paragraphs.map((p, i) => (
                      <p key={i} className="text-muted-foreground">{p}</p>
                    ))
                  : <p className="text-muted-foreground">{reasoning}</p>}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

export default RehabReasoningBanner;

