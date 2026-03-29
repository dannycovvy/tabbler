import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Spade, Heart, ArrowRight, UserCircle, Sparkles, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProfile } from '@/hooks/use-profile';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type AuthTab = 'guest' | 'signup' | 'login';

const TABS: { id: AuthTab; label: string; icon: React.ReactNode }[] = [
  { id: 'guest', label: 'Play as Guest', icon: <Spade className="w-4 h-4" /> },
  { id: 'signup', label: 'Create Account', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'login', label: 'Sign In', icon: <LogIn className="w-4 h-4" /> },
];

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { profile, authenticate } = useProfile();
  const { toast } = useToast();
  const [tab, setTab] = useState<AuthTab>('guest');
  const [name, setName] = useState(
    profile.username && profile.username !== 'Guest' ? profile.username : '',
  );
  const [email, setEmail] = useState('');

  const handleContinueAsGuest = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: 'Name required', description: 'Enter a name to continue.', variant: 'destructive' });
      return;
    }
    authenticate(trimmed, 'guest');
    setLocation('/');
  };

  const handleCreateAccount = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: 'Name required', description: 'Enter a display name.', variant: 'destructive' });
      return;
    }
    authenticate(trimmed, 'registered');
    toast({
      title: 'Account created!',
      description: 'Your profile is saved locally. Cloud sync coming soon.',
    });
    setLocation('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          alt=""
          className="w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background" />
      </div>

      {/* Decorative floating cards */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ rotate: 10, y: [0, -20, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/4 -left-20 opacity-15"
        >
          <div className="w-56 h-80 border-4 border-white/10 rounded-2xl flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Spade className="w-24 h-24 text-white" />
          </div>
        </motion.div>
        <motion.div
          animate={{ rotate: -15, y: [0, 20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute bottom-1/4 -right-20 opacity-15"
        >
          <div className="w-56 h-80 border-4 border-red-500/10 rounded-2xl flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Heart className="w-24 h-24 text-red-500" />
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="glass-panel rounded-[2rem] max-w-sm w-full mx-4 z-10 overflow-hidden"
      >
        {/* Header */}
        <div className="px-8 pt-10 pb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/50 p-[2px] mb-6 shadow-xl shadow-primary/30 mx-auto">
            <div className="w-full h-full bg-zinc-900 rounded-[14px] flex items-center justify-center">
              <Spade className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-1">Tabbler</h1>
          <p className="text-zinc-400 text-sm">Game night, anywhere.</p>
        </div>

        {/* Tab switcher */}
        <div className="px-6">
          <div className="flex gap-0.5 bg-black/30 p-1 rounded-xl border border-white/5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs font-semibold transition-all',
                  tab === t.id
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {t.icon}
                <span className="hidden sm:block">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-6 pb-8 pt-5">
          <AnimatePresence mode="wait">
            {tab === 'guest' && (
              <motion.div
                key="guest"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Display Name
                  </label>
                  <Input
                    placeholder="e.g. CardShark99"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleContinueAsGuest()}
                    className="h-12 bg-black/40 border-white/10 focus-visible:ring-primary focus-visible:border-primary"
                    maxLength={20}
                  />
                </div>
                <div className="flex items-start gap-2 bg-white/3 border border-white/8 rounded-xl px-3 py-2.5">
                  <UserCircle className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-zinc-500 leading-snug">
                    Guest profiles are saved locally on this device. Create an account to sync your stats everywhere.
                  </p>
                </div>
                <Button
                  onClick={handleContinueAsGuest}
                  className="w-full h-12 font-bold text-sm shadow-[0_0_24px_hsla(152,60%,35%,0.4)] rounded-xl"
                >
                  Continue as Guest <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </motion.div>
            )}

            {tab === 'signup' && (
              <motion.div
                key="signup"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Display Name</label>
                  <Input
                    placeholder="e.g. CardShark99"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-12 bg-black/40 border-white/10 focus-visible:ring-primary"
                    maxLength={20}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Email</label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateAccount()}
                    className="h-12 bg-black/40 border-white/10 focus-visible:ring-primary"
                  />
                </div>
                <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5">
                  <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-zinc-400 leading-snug">
                    <span className="text-primary font-semibold">V1 note:</span> Accounts are stored locally. Cloud sync with real authentication is coming soon.
                  </p>
                </div>
                <Button
                  onClick={handleCreateAccount}
                  className="w-full h-12 font-bold text-sm shadow-[0_0_24px_hsla(152,60%,35%,0.4)] rounded-xl"
                >
                  Create Account <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </motion.div>
            )}

            {tab === 'login' && (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <div className="rounded-2xl border border-white/10 bg-white/3 p-6 text-center">
                  <LogIn className="w-8 h-8 text-zinc-500 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-zinc-300 mb-1">Sign In Coming Soon</p>
                  <p className="text-xs text-zinc-500 leading-snug">
                    Real authentication with persistent cloud profiles is on the roadmap. For now, create a local account or continue as a guest.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full h-12 font-semibold text-sm border-white/10 hover:bg-white/5"
                  onClick={() => setTab('signup')}
                >
                  Create a Local Account Instead
                </Button>
                <Button
                  variant="ghost"
                  className="w-full h-10 text-sm text-zinc-500 hover:text-white"
                  onClick={() => setTab('guest')}
                >
                  Continue as Guest
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
