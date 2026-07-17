import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Camera, Loader2 } from "lucide-react";

interface LivenessResult {
  isLive: boolean;
  confidence: number;
  spoofDetected: boolean;
  faceQuality: number;
}

export function LivenessVerification({ onVerified }: { onVerified: (sessionId: string) => void }) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [result, setResult] = useState<LivenessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frames, setFrames] = useState<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup: stop camera when component unmounts
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCapture = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
      
      setIsCapturing(true);
      
      // Capture frames every 500ms for 3 seconds
      const capturedFrames: Blob[] = [];
      const interval = setInterval(async () => {
        if (canvasRef.current && videoRef.current) {
          const canvas = canvasRef.current;
          const video = videoRef.current;
          
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            
            canvas.toBlob((blob) => {
              if (blob) {
                capturedFrames.push(blob);
              }
            }, "image/jpeg", 0.8);
          }
        }
      }, 500);
      
      // Stop after 3 seconds
      setTimeout(async () => {
        clearInterval(interval);
        setIsCapturing(false);
        
        // Stop camera
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        
        setFrames(capturedFrames);
        
        // Send frames for verification
        await verifyLiveness(capturedFrames);
      }, 3000);
      
    } catch (err) {
      setError("Failed to access camera. Please grant camera permissions.");
      setIsCapturing(false);
    }
  };

  const verifyLiveness = async (capturedFrames: Blob[]) => {
    try {
      const formData = new FormData();
      formData.append("user_id", "current_user");
      
      capturedFrames.forEach((frame, index) => {
        formData.append("files", frame, `frame_${index}.jpg`);
      });
      
      // In production, call actual liveness API
      // const response = await fetch("http://liveness-service:8006/verify-identity", {
      //   method: "POST",
      //   body: formData
      // });
      // const data = await response.json();
      
      // Simulate API response
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const mockResult: LivenessResult = {
        isLive: true,
        confidence: 0.94,
        spoofDetected: false,
        faceQuality: 0.89
      };
      
      setResult(mockResult);
      
      if (mockResult.isLive && !mockResult.spoofDetected) {
        onVerified("session_" + Date.now());
      }
      
    } catch (err) {
      setError("Verification failed. Please try again.");
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Identity Verification</h3>
          <p className="text-sm text-muted-foreground">
            Position your face in the camera and click Start Verification
          </p>
        </div>

        <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          
          {isCapturing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-white text-center">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-2" />
                <p>Analyzing...</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert variant={result.isLive && !result.spoofDetected ? "default" : "destructive"}>
            {result.isLive && !result.spoofDetected ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  Verification successful! Confidence: {(result.confidence * 100).toFixed(1)}%
                </AlertDescription>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {result.spoofDetected
                    ? "Spoof detected. Please use a live camera feed."
                    : "Liveness check failed. Please try again."}
                </AlertDescription>
              </>
            )}
          </Alert>
        )}

        <Button
          onClick={startCapture}
          disabled={isCapturing}
          className="w-full"
        >
          {isCapturing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              <Camera className="mr-2 h-4 w-4" />
              Start Verification
            </>
          )}
        </Button>

        {result && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Confidence:</span>
              <span className="ml-2 font-medium">
                {(result.confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Face Quality:</span>
              <span className="ml-2 font-medium">
                {(result.faceQuality * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Frames Analyzed:</span>
              <span className="ml-2 font-medium">{frames.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>
              <span className={`ml-2 font-medium ${result.isLive ? "text-green-600" : "text-red-600"}`}>
                {result.isLive ? "Live" : "Not Live"}
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
