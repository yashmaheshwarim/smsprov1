import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/maheshwari-tech-logo.png";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      const success = login(email, password);
      if (!success) {
        toast({ title: "Login Failed", description: "Invalid email or password.", variant: "destructive" });
      }
      setLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <img src={logo} alt="Apex SMS" className="h-16 mx-auto object-contain" />
          <h1 className="text-xl sm:text-2xl font-bold text-foreground text-balance">Apex SMS</h1>
          <p className="text-sm text-muted-foreground">Sign in to your coaching account</p>
        </div>

        <form onSubmit={handleSubmit} className="surface-elevated rounded-lg p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Email</label>
            <Input type="email" placeholder="admin@institute.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Password</label>
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>


        <p className="text-center text-[10px] text-muted-foreground">Powered by <span className="font-semibold text-foreground">Maheshwari Tech</span></p>
      </div>
    </div>
  );
}
