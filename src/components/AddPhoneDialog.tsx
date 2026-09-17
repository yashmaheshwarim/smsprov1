import { useEffect, useState } from "react";
import { Loader2, Phone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AddPhoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string | null;
  studentName: string;
  /** Called after the number is saved so callers can update their local state. */
  onSaved?: (studentId: string, phone: string) => void;
}

/**
 * Quick "add mobile number" dialog — lets staff feed a missing phone number for
 * a student right from the absent-students popups, so every absent student can
 * be notified without leaving the attendance flow.
 */
export function AddPhoneDialog({ open, onOpenChange, studentId, studentName, onSaved }: AddPhoneDialogProps) {
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Fresh input each time the dialog opens (or another student is targeted).
  useEffect(() => {
    if (open) setPhone("");
  }, [open, studentId]);

  const handleSave = async () => {
    if (!studentId) return;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      toast({ title: "Invalid Number", description: "Enter a valid mobile number (at least 10 digits).", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("students")
        .update({ student_phone: digits })
        .eq("id", studentId);
      if (error) throw error;
      toast({ title: "Number Saved ✓", description: `${studentName}'s mobile number was added.` });
      onSaved?.(studentId, digits);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message || "Could not save the number.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" />
            Add Mobile Number
          </DialogTitle>
          <DialogDescription className="truncate">
            For <span className="font-medium text-foreground">{studentName}</span> — saved to their profile so absent notifications can reach them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="add-phone-input">Mobile number</Label>
          <Input
            id="add-phone-input"
            type="tel"
            inputMode="tel"
            autoFocus
            placeholder="e.g. 9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save Number
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
