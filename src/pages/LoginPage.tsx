import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, GraduationCap, Building2, UserCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/maheshwari-tech-logo.png";

type LoginMode = "email" | "enrollment";

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<LoginMode>("email");
  const [email, setEmail] = useState("");
  const [enrollment, setEnrollment] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const identifier = mode === "email" ? email : enrollment;
    if (!identifier) {
      toast({ title: "Error", description: mode === "email" ? "Please enter your email." : "Please enter your enrollment number.", variant: "destructive" });
      setLoading(false);
      return;
    }
    const success = await login(identifier, password);
    if (!success) {
      toast({ title: "Login Failed", description: "Invalid credentials. Please try again.", variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo & Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 shadow-sm">
            <img src={logo} alt="Apex SMS" className="h-10 w-auto object-contain" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Apex SMS</h1>
            <p className="text-sm text-muted-foreground mt-1">Student Management System</p>
          </div>
        </div>

        {/* Login Mode Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50 border border-border">
          <button
            type="button"
            onClick={() => setMode("email")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              mode === "email"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Staff Login
          </button>
          <button
            type="button"
            onClick={() => setMode("enrollment")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              mode === "enrollment"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Student Login
          </button>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="surface-elevated rounded-lg p-6 space-y-4 border border-border/50 shadow-sm">
          {mode === "email" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Email Address</label>
              <Input
                type="email"
                placeholder="admin@institute.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10"
              />
              <p className="text-[10px] text-muted-foreground">For admins, teachers, and parents</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 mb-1">
                <UserCheck className="w-4 h-4 text-primary" />
                <label className="text-xs font-medium text-foreground">Enrollment Number</label>
              </div>
              <Input
                type="text"
                placeholder="e.g., MT-2025000"
                value={enrollment}
                onChange={(e) => setEnrollment(e.target.value)}
                required
                className="h-10 font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Enter your enrollment number provided by the institute</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Password</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-10 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-sm"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Signing in...
              </span>
            ) : mode === "enrollment" ? (
              <span className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4" />
                Sign In as Student
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Sign In
              </span>
            )}
          </Button>
        </form>

        {/* Help Hint */}
        <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 text-center">
          <p className="text-[10px] text-muted-foreground">
            {mode === "enrollment"
              ? "Contact your institute admin if you don't have your login credentials."
              : "New here? Contact your institute for account setup."
            }
          </p>
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          Powered by <span className="font-semibold text-foreground">Maheshwari Tech</span>
        </p>
      </div>
    </div>
  );
}
