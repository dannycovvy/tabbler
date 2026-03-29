import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Lock, Check, Sparkles, Crown, Zap,
  Palette, CreditCard, Star, ShieldCheck, Trophy, Gamepad2,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProfile } from '@/hooks/use-profile';
import {
  AVATARS, TABLE_THEMES, CARD_BACKS, BADGES, AVATAR_FRAMES,
  CosmeticItem,
} from '@/lib/cosmetics';

// ── Avatar display ────────────────────────────────────────────────────────────

function AvatarDisplay({
  avatarId,
  frameId,
  size = 'lg',
}: {
  avatarId: string;
  frameId: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const avatar = AVATARS.find((a) => a.id === avatarId) ?? AVATARS[0];
  const frameBorder = frameIdToBorderClass(frameId);
  const sizes = {
    sm: { outer: 'w-10 h-10', text: 'text-xl' },
    md: { outer: 'w-14 h-14', text: 'text-2xl' },
    lg: { outer: 'w-24 h-24', text: 'text-5xl' },
    xl: { outer: 'w-32 h-32', text: 'text-6xl' },
  }[size];

  return (
    <div className={`${sizes.outer} rounded-full flex items-center justify-center bg-zinc-800 border-4 ${frameBorder} shadow-lg transition-all duration-300`}>
      <span className={sizes.text} role="img" aria-label={avatar.label}>{avatar.emoji}</span>
    </div>
  );
}

function frameIdToBorderClass(frameId: string): string {
  const map: Record<string, string> = {
    'frame-none': 'border-zinc-700',
    'frame-bronze': 'border-amber-600',
    'frame-silver': 'border-zinc-300',
    'frame-gold': 'border-yellow-400',
    'frame-diamond': 'border-cyan-300',
  };
  return map[frameId] ?? 'border-zinc-700';
}

// ── Rank display ──────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: string }) {
  const colors: Record<string, string> = {
    Newcomer: 'bg-zinc-700 text-zinc-300',
    Rookie: 'bg-blue-900 text-blue-300',
    Regular: 'bg-violet-900 text-violet-300',
    Veteran: 'bg-amber-900 text-amber-300',
    Champion: 'bg-orange-900 text-orange-300',
    Legend: 'bg-yellow-500 text-zinc-900 font-black',
  };
  return (
    <span className={`text-xs px-3 py-1 rounded-full font-semibold tracking-wider uppercase ${colors[rank] ?? colors.Rookie}`}>
      {rank}
    </span>
  );
}

// ── Cosmetic item card ────────────────────────────────────────────────────────

function CosmeticCard({
  item,
  isUnlocked,
  isEquipped,
  onEquip,
  onToggle,
  devMode,
}: {
  item: CosmeticItem;
  isUnlocked: boolean;
  isEquipped: boolean;
  onEquip: () => void;
  onToggle: () => void;
  devMode: boolean;
}) {
  const isPremium = item.unlockMethod === 'premium' || item.unlockMethod === 'limited';

  return (
    <motion.div
      whileHover={{ y: isUnlocked ? -4 : 0, scale: isUnlocked ? 1.02 : 1 }}
      className={`relative rounded-2xl border-2 p-3 flex flex-col items-center gap-2 cursor-pointer transition-colors duration-200 ${
        isEquipped
          ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
          : isUnlocked
          ? 'border-white/10 bg-zinc-900/60 hover:border-white/25 hover:bg-zinc-800/60'
          : 'border-white/5 bg-zinc-950/60 opacity-60'
      }`}
      onClick={isUnlocked ? onEquip : undefined}
    >
      {/* Equipped check */}
      {isEquipped && (
        <div className="absolute -top-2 -right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-md">
          <Check className="w-3 h-3 text-black" />
        </div>
      )}

      {/* Premium crown */}
      {isPremium && (
        <div className="absolute -top-2 -left-2 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-md">
          <Crown className="w-3 h-3 text-black" />
        </div>
      )}

      {/* Preview */}
      <ItemPreview item={item} />

      {/* Name */}
      <span className="text-xs font-semibold text-center text-zinc-200 leading-tight">
        {item.name}
      </span>

      {/* Status */}
      {!isUnlocked && (
        <div className="flex flex-col items-center gap-1 w-full">
          <Lock className="w-3.5 h-3.5 text-zinc-500" />
          {item.unlockHint && (
            <span className="text-[10px] text-zinc-500 text-center leading-tight">{item.unlockHint}</span>
          )}
          {isPremium && !item.unlockHint && (
            <span className="text-[10px] text-amber-500 font-semibold">Premium</span>
          )}
        </div>
      )}

      {isEquipped && (
        <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Equipped</span>
      )}

      {/* Dev mode toggle */}
      {devMode && item.unlockMethod !== 'default' && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`mt-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-colors ${
            isUnlocked
              ? 'border-red-500/50 text-red-400 hover:bg-red-500/10'
              : 'border-green-500/50 text-green-400 hover:bg-green-500/10'
          }`}
        >
          {isUnlocked ? 'Lock' : 'Unlock'}
        </button>
      )}
    </motion.div>
  );
}

function ItemPreview({ item }: { item: CosmeticItem }) {
  if (item.type === 'tableTheme') {
    return (
      <div
        className="w-12 h-8 rounded-lg border border-white/10 shadow-inner"
        style={{ backgroundColor: item.preview }}
      />
    );
  }
  if (item.type === 'cardBack') {
    if (item.preview === 'holographic') {
      return (
        <div className="w-8 h-12 rounded-md border border-white/20 overflow-hidden shadow-inner"
          style={{ background: 'linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff, #c77dff)' }}
        />
      );
    }
    return (
      <div className="w-8 h-12 rounded-md border border-white/20 shadow-inner"
        style={{ backgroundColor: item.preview }}
      />
    );
  }
  if (item.type === 'badge') {
    return (
      <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl">
        {item.preview || '—'}
      </div>
    );
  }
  if (item.type === 'avatarFrame') {
    return (
      <div className={`w-10 h-10 rounded-full bg-zinc-800 border-4 ${item.preview}`} />
    );
  }
  return null;
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="text-primary">{icon}</div>
      <h3 className="font-bold text-zinc-200">{title}</h3>
      <span className="text-xs text-zinc-500 ml-auto">{count} items</span>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'wardrobe';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Profile', icon: <Star className="w-4 h-4" /> },
  { id: 'wardrobe', label: 'Wardrobe', icon: <Palette className="w-4 h-4" /> },
];

// ── Main Profile Page ─────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const { profile, setUsername, setAvatar, equipItem, unlockItem, lockItem, isUnlocked, isEquipped } = useProfile();
  const [tab, setTab] = useState<Tab>('overview');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.username);
  const [devMode, setDevMode] = useState(false);

  const winRate = profile.gamesPlayed === 0
    ? '—'
    : `${Math.round((profile.wins / profile.gamesPlayed) * 100)}%`;

  const equippedAvatar = AVATARS.find((a) => a.id === profile.avatarId) ?? AVATARS[0];

  const handleSaveName = () => {
    if (nameInput.trim()) setUsername(nameInput.trim());
    setEditingName(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-white/5 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation('/')}
            className="p-2 rounded-xl hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-white">My Profile</span>

          <div className="ml-auto flex items-center gap-2">
            {/* Dev mode toggle — clearly labelled as test-only */}
            <button
              onClick={() => setDevMode((d) => !d)}
              title="Test mode: unlock/lock any item manually. Remove before production."
              className={`text-[11px] px-3 py-1 rounded-full border font-semibold transition-all ${
                devMode
                  ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                  : 'border-white/10 text-zinc-500 hover:border-white/20'
              }`}
            >
              <Zap className="w-3 h-3 inline mr-1" />
              Test Mode
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Profile card */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <AvatarDisplay avatarId={profile.avatarId} frameId={profile.equippedItems.avatarFrame} size="xl" />
            <RankBadge rank={profile.rank} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col gap-3 text-center sm:text-left">
            {/* Username */}
            {editingName ? (
              <div className="flex gap-2">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                  className="h-10 bg-zinc-800 border-white/10 text-white font-bold text-xl"
                  autoFocus
                  maxLength={20}
                />
                <Button size="sm" onClick={handleSaveName} className="bg-primary text-black hover:bg-primary/90">
                  <Check className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <h2 className="text-2xl font-black text-white truncate">{profile.username}</h2>
                <button onClick={() => { setNameInput(profile.username); setEditingName(true); }} className="text-zinc-500 hover:text-white transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Equipped badge */}
            {profile.equippedItems.badge !== 'badge-none' && (() => {
              const badge = BADGES.find((b) => b.id === profile.equippedItems.badge);
              return badge ? (
                <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                  <span className="text-base">{badge.preview}</span>
                  <span className="text-sm text-zinc-300 font-semibold">{badge.name}</span>
                </div>
              ) : null;
            })()}

            {/* Stats */}
            <div className="flex gap-6 justify-center sm:justify-start mt-2">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <Gamepad2 className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider font-medium">Played</span>
                </div>
                <span className="text-2xl font-black text-white">{profile.gamesPlayed}</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <Trophy className="w-4 h-4 text-primary" />
                  <span className="text-xs uppercase tracking-wider font-medium">Wins</span>
                </div>
                <span className="text-2xl font-black text-primary">{profile.wins}</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider font-medium">Win %</span>
                </div>
                <span className="text-2xl font-black text-white">{winRate}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900/60 p-1 rounded-xl border border-white/5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                tab === t.id
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          {tab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Avatar picker */}
              <div className="glass-panel rounded-2xl p-5">
                <SectionHeader icon={<Star className="w-4 h-4" />} title="Choose Avatar" count={AVATARS.length} />
                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2">
                  {AVATARS.map((av) => (
                    <motion.button
                      key={av.id}
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setAvatar(av.id)}
                      title={av.label}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-2xl transition-all border-2 ${
                        profile.avatarId === av.id
                          ? 'border-primary bg-primary/20 shadow-lg shadow-primary/20'
                          : 'border-transparent bg-zinc-800 hover:bg-zinc-700'
                      }`}
                    >
                      {av.emoji}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Future monetization note */}
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3 items-start">
                <Crown className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-300">Wardrobe is coming soon</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Unlock exclusive card backs, table themes, avatar frames, and badges. Some items are earned through gameplay — others will be available as one-time purchases or through a membership plan.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {tab === 'wardrobe' && (
            <motion.div
              key="wardrobe"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {devMode && (
                <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 px-4 py-2 text-sm text-orange-300 flex items-center gap-2">
                  <Zap className="w-4 h-4" /> Test mode active — use unlock/lock buttons to simulate purchases. This UI is hidden in production.
                </div>
              )}

              {/* Table Themes */}
              <div className="glass-panel rounded-2xl p-5">
                <SectionHeader icon={<Palette className="w-4 h-4" />} title="Table Themes" count={TABLE_THEMES.length} />
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {TABLE_THEMES.map((item) => (
                    <CosmeticCard key={item.id} item={item} isUnlocked={isUnlocked(item.id)} isEquipped={isEquipped(item.id)} onEquip={() => equipItem(item.id)} onToggle={() => isUnlocked(item.id) ? lockItem(item.id) : unlockItem(item.id)} devMode={devMode} />
                  ))}
                </div>
              </div>

              {/* Card Backs */}
              <div className="glass-panel rounded-2xl p-5">
                <SectionHeader icon={<CreditCard className="w-4 h-4" />} title="Card Backs" count={CARD_BACKS.length} />
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {CARD_BACKS.map((item) => (
                    <CosmeticCard key={item.id} item={item} isUnlocked={isUnlocked(item.id)} isEquipped={isEquipped(item.id)} onEquip={() => equipItem(item.id)} onToggle={() => isUnlocked(item.id) ? lockItem(item.id) : unlockItem(item.id)} devMode={devMode} />
                  ))}
                </div>
              </div>

              {/* Badges */}
              <div className="glass-panel rounded-2xl p-5">
                <SectionHeader icon={<ShieldCheck className="w-4 h-4" />} title="Badges" count={BADGES.length} />
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {BADGES.map((item) => (
                    <CosmeticCard key={item.id} item={item} isUnlocked={isUnlocked(item.id)} isEquipped={isEquipped(item.id)} onEquip={() => equipItem(item.id)} onToggle={() => isUnlocked(item.id) ? lockItem(item.id) : unlockItem(item.id)} devMode={devMode} />
                  ))}
                </div>
              </div>

              {/* Avatar Frames */}
              <div className="glass-panel rounded-2xl p-5">
                <SectionHeader icon={<Sparkles className="w-4 h-4" />} title="Avatar Frames" count={AVATAR_FRAMES.length} />
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {AVATAR_FRAMES.map((item) => (
                    <CosmeticCard key={item.id} item={item} isUnlocked={isUnlocked(item.id)} isEquipped={isEquipped(item.id)} onEquip={() => equipItem(item.id)} onToggle={() => isUnlocked(item.id) ? lockItem(item.id) : unlockItem(item.id)} devMode={devMode} />
                  ))}
                </div>
              </div>

              {/* Premium teaser */}
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex flex-col sm:flex-row items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <Crown className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-white mb-1">Unlock everything with Tabbler Pass</p>
                  <p className="text-sm text-zinc-400">
                    Get instant access to all premium cosmetics plus early access to new items as they drop. Subscriptions, one-time purchases, and limited-time bundles — coming soon.
                  </p>
                  <div className="mt-3 text-xs text-zinc-500 font-mono">
                    {/* Placeholder for Stripe/RevenueCat integration */}
                    [Payment integration — not yet enabled]
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
