import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Upload, FileVideo } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const UploadWorkout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [dragActive, setDragActive] = useState(false);
  const [uploadedTemplates, setUploadedTemplates] = useState<any[]>([]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) processFile(files[0]);
  };

  // JSON 파일 처리
  const processFile = (file: File) => {
    if (file.type === "application/json" || /\.json$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string);
          setUploadedTemplates(prev => [...prev, json]);
          toast({
            title: "Template loaded",
            description: `${file.name} applied.`,
          });
        } catch {
          toast({
            title: "Invalid JSON",
            description: "Could not parse the template.",
            variant: "destructive",
          });
        }
      };
      reader.readAsText(file);
      return;
    }
    toast({
      title: "Invalid file type",
      description: "Please upload a JSON template file.",
      variant: "destructive",
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) processFile(files[0]);
  };

  const handleStartAnalysis = () => {
    if (uploadedTemplates.length === 0) return;
    navigate("/session", {
      state: {
        type: "templates",
        templates: uploadedTemplates,
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
          <h1 className="text-4xl font-bold text-foreground">
            Upload Your Pose Templates
          </h1>
        </div>

        {/* Upload Card */}
        <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Upload JSON Templates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-all duration-300 ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept="application/json"
                onChange={handleFileInputChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                  <FileVideo className="w-8 h-8 text-primary" />
                </div>

                {uploadedTemplates.length > 0 ? (
                  <div>
                    <p className="text-lg font-semibold text-foreground">
                      ✅ {uploadedTemplates.length} templates loaded
                    </p>
                    <ul className="text-sm text-muted-foreground mt-2">
                      {uploadedTemplates.map((t, i) => (
                        <li key={i}>
                          {i + 1}. {t.pose_id || "Unnamed pose"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div>
                    <p className="text-lg font-semibold text-foreground">
                      Drop your JSON templates here
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Or click to browse files
                    </p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Supported: JSON pose templates
                </p>
              </div>
            </div>

            <div className="flex justify-center mt-6">
              <Button
                variant="hero"
                size="lg"
                onClick={handleStartAnalysis}
                disabled={uploadedTemplates.length === 0}
                className="min-w-[200px]"
              >
                Start Analysis
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UploadWorkout;
