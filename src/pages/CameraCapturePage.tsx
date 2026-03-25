import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, RotateCcw, Save, Plus, Trash2, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CapturedEntry {
  id: string;
  type: string;
  fields: Record<string, string>;
  capturedAt: string;
}

const entryTypes = [
  { key: "student", label: "Student Admission", fields: ["Name", "Father's Name", "Phone", "Batch", "Address"] },
  { key: "fee", label: "Fee Receipt", fields: ["Student Name", "Receipt No", "Amount", "Payment Mode", "Date"] },
  { key: "visitor", label: "Visitor Entry", fields: ["Name", "Phone", "Purpose", "Meeting With"] },
  { key: "custom", label: "Custom Entry", fields: ["Field 1", "Field 2", "Field 3"] },
];

export default function CameraCapturePage() {
  const [capturing, setCapturing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState(entryTypes[0]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [entries, setEntries] = useState<CapturedEntry[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(mediaStream);
      setCapturing(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch {
      toast({ title: "Camera Error", description: "Could not access camera. Please check permissions.", variant: "destructive" });
    }
  }, []);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      setCapturedImage(canvas.toDataURL("image/jpeg", 0.8));
      stopCamera();
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setCapturing(false);
  };

  const retake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleSaveEntry = () => {
    const filledFields = Object.entries(formData).filter(([, v]) => v.trim());
    if (filledFields.length === 0) {
      toast({ title: "Error", description: "Please fill at least one field.", variant: "destructive" });
      return;
    }
    const entry: CapturedEntry = {
      id: `CAP-${String(entries.length + 1).padStart(4, "0")}`,
      type: selectedType.label,
      fields: { ...formData },
      capturedAt: new Date().toLocaleString("en-IN"),
    };
    setEntries(prev => [entry, ...prev]);
    setFormData({});
    setCapturedImage(null);
    toast({ title: "Entry Saved", description: `${selectedType.label} data saved successfully. Image discarded.` });
  };

  const deleteEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    toast({ title: "Deleted", description: "Entry removed." });
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Camera Capture</h2>
        <p className="text-sm text-muted-foreground">Capture reference image and enter data manually. Images are not stored.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Camera Section */}
        <div className="space-y-3">
          <div className="surface-elevated rounded-lg overflow-hidden aspect-video bg-foreground/5 flex items-center justify-center relative">
            {capturing ? (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            ) : capturedImage ? (
              <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center space-y-2">
                <Camera className="w-10 h-10 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">Open camera to capture reference</p>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex gap-2">
            {!capturing && !capturedImage && (
              <Button onClick={startCamera} className="flex-1"><Camera className="w-4 h-4 mr-1" /> Open Camera</Button>
            )}
            {capturing && (
              <>
                <Button onClick={capturePhoto} className="flex-1"><Camera className="w-4 h-4 mr-1" /> Capture</Button>
                <Button variant="outline" onClick={stopCamera}>Cancel</Button>
              </>
            )}
            {capturedImage && (
              <>
                <Button variant="outline" onClick={retake} className="flex-1"><RotateCcw className="w-4 h-4 mr-1" /> Retake</Button>
                <Button variant="outline" onClick={() => setCapturedImage(null)}>Discard</Button>
              </>
            )}
          </div>
        </div>

        {/* Data Entry Section */}
        <div className="surface-elevated rounded-lg p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground">Entry Type</label>
            <select
              value={selectedType.key}
              onChange={e => {
                setSelectedType(entryTypes.find(t => t.key === e.target.value) || entryTypes[0]);
                setFormData({});
              }}
              className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground"
            >
              {entryTypes.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          {selectedType.fields.map(field => (
            <div key={field}>
              <label className="text-xs font-medium text-foreground">{field}</label>
              <Input
                value={formData[field] || ""}
                onChange={e => setFormData(p => ({ ...p, [field]: e.target.value }))}
                placeholder={`Enter ${field.toLowerCase()}`}
              />
            </div>
          ))}
          <Button className="w-full" onClick={handleSaveEntry}>
            <Save className="w-4 h-4 mr-1" /> Save Data Entry
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">📷 Image is used only for reference and will NOT be stored</p>
        </div>
      </div>

      {/* Saved Entries */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Recent Entries ({entries.length})</h3>
          {entries.map(entry => (
            <div key={entry.id} className="surface-elevated rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground">{entry.type}</span>
                  <span className="text-[10px] text-muted-foreground">{entry.capturedAt}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                  {Object.entries(entry.fields).filter(([, v]) => v).map(([k, v]) => (
                    <span key={k} className="text-xs text-muted-foreground"><span className="text-foreground">{k}:</span> {v}</span>
                  ))}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => deleteEntry(entry.id)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
