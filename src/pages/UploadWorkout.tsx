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
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

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
    if (files && files[0]) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = (file: File) => {
    if (file.type.startsWith('video/')) {
      setUploadedFile(file);
      toast({
        title: "Video uploaded successfully!",
        description: `${file.name} is ready for analysis.`,
      });
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file.",
        variant: "destructive",
      });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFileUpload(files[0]);
    }
  };

  const handleStartAnalysis = () => {
    if (uploadedFile) {
      navigate('/session', { 
        state: { 
          type: 'upload',
          file: uploadedFile
        } 
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
          <h1 className="text-4xl font-bold text-foreground">Upload Your Workout Video</h1>
        </div>

        <div className="grid gap-6">
          {/* Upload Area */}
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                Upload Video File
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
                  accept="video/*"
                  onChange={handleFileInputChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                    <FileVideo className="w-8 h-8 text-primary" />
                  </div>
                  
                  {uploadedFile ? (
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        ✅ {uploadedFile.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        File size: {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        Drop your workout video here
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Or click to browse files
                      </p>
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    Supported formats: MP4, MOV, AVI, WMV
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardHeader>
              <CardTitle>Tips for Best Results</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Ensure good lighting in your video</li>
                <li>• Keep the full body visible in frame</li>
                <li>• Use a stable camera position</li>
                <li>• Wear contrasting clothes from background</li>
                <li>• Record from the side for best pose detection</li>
              </ul>
            </CardContent>
          </Card>

          {/* Start Analysis Button */}
          <div className="flex justify-center">
            <Button
              variant="hero"
              size="xl"
              onClick={handleStartAnalysis}
              disabled={!uploadedFile}
              className="min-w-[250px]"
            >
              Start Video Analysis
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadWorkout;