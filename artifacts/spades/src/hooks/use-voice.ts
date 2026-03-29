import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';

/**
 * Voice state machine:
 *   idle    → waiting for user action (join overlay shown)
 *   joining → browser permission dialog in progress
 *   active  → mic acquired, WebRTC mesh connected
 *   denied  → permission denied OR user skipped audio
 */
export type VoiceState = 'idle' | 'joining' | 'active' | 'denied';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface PeerEntry {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
}

export function useVoiceChat(
  _roomId: string | undefined,
  meId: string | undefined,
  socket: Socket | null,
  canSpeak: boolean,
) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const voiceStateRef = useRef<VoiceState>('idle');
  const isMutedRef = useRef(false);
  const canSpeakRef = useRef(canSpeak);
  const lastSpeakingRef = useRef(false);
  const socketRef = useRef(socket);

  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { canSpeakRef.current = canSpeak; }, [canSpeak]);
  useEffect(() => { socketRef.current = socket; }, [socket]);

  // ---- Peer lifecycle ----

  const closePeer = useCallback((peerId: string) => {
    const entry = peersRef.current.get(peerId);
    if (!entry) return;
    try { entry.pc.close(); } catch { /* ignore */ }
    entry.audioEl.srcObject = null;
    entry.audioEl.remove();
    peersRef.current.delete(peerId);
    setActiveSpeakers((prev) => {
      if (!prev.has(peerId)) return prev;
      const next = new Set(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing.pc;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', '');
    document.body.appendChild(audioEl);

    peersRef.current.set(peerId, { pc, audioEl });

    const stream = localStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit('webrtc_ice', { targetId: peerId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const remoteStream = e.streams[0];
      if (!remoteStream) return;
      const entry = peersRef.current.get(peerId);
      if (entry) {
        entry.audioEl.srcObject = remoteStream;
        entry.audioEl.play().catch(() => {/* autoplay policy — browser will allow after user gesture */});
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        closePeer(peerId);
      }
    };

    return pc;
  }, [closePeer]);

  // ---- Offer flow: we are the new joiner — call each existing peer ----

  const callPeer = useCallback(async (peerId: string) => {
    const sock = socketRef.current;
    if (!sock) return;
    const pc = createPeerConnection(peerId);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      sock.emit('webrtc_offer', { targetId: peerId, offer: pc.localDescription });
    } catch (err) {
      console.error('[voice] createOffer failed for', peerId, err);
      closePeer(peerId);
    }
  }, [createPeerConnection, closePeer]);

  // ---- Socket event handlers ----

  useEffect(() => {
    if (!socket) return;

    const onVoiceRoomPeers = async ({ peerIds }: { peerIds: string[] }) => {
      for (const peerId of peerIds) {
        await callPeer(peerId);
      }
    };

    const onWebRtcOffer = async ({ fromId, offer }: { fromId: string; offer: RTCSessionDescriptionInit }) => {
      const sock = socketRef.current;
      if (!sock) return;
      const pc = createPeerConnection(fromId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sock.emit('webrtc_answer', { targetId: fromId, answer: pc.localDescription });
      } catch (err) {
        console.error('[voice] setRemoteDescription/createAnswer failed for', fromId, err);
        closePeer(fromId);
      }
    };

    const onWebRtcAnswer = async ({ fromId, answer }: { fromId: string; answer: RTCSessionDescriptionInit }) => {
      const entry = peersRef.current.get(fromId);
      if (!entry) return;
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('[voice] setRemoteDescription (answer) failed for', fromId, err);
      }
    };

    const onWebRtcIce = async ({ fromId, candidate }: { fromId: string; candidate: RTCIceCandidateInit }) => {
      const entry = peersRef.current.get(fromId);
      if (!entry) return;
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch { /* ICE errors are non-fatal */ }
    };

    const onVoicePeerLeft = ({ peerId }: { peerId: string }) => {
      closePeer(peerId);
    };

    const onVoiceSpeaking = ({ peerId, speaking }: { peerId: string; speaking: boolean }) => {
      if (peerId === meId) return;
      setActiveSpeakers((prev) => {
        const has = prev.has(peerId);
        if (speaking === has) return prev;
        const next = new Set(prev);
        if (speaking) next.add(peerId); else next.delete(peerId);
        return next;
      });
    };

    socket.on('voice_room_peers', onVoiceRoomPeers);
    socket.on('webrtc_offer', onWebRtcOffer);
    socket.on('webrtc_answer', onWebRtcAnswer);
    socket.on('webrtc_ice', onWebRtcIce);
    socket.on('voice_peer_left', onVoicePeerLeft);
    socket.on('voice_speaking', onVoiceSpeaking);

    return () => {
      socket.off('voice_room_peers', onVoiceRoomPeers);
      socket.off('webrtc_offer', onWebRtcOffer);
      socket.off('webrtc_answer', onWebRtcAnswer);
      socket.off('webrtc_ice', onWebRtcIce);
      socket.off('voice_peer_left', onVoicePeerLeft);
      socket.off('voice_speaking', onVoiceSpeaking);
    };
  }, [socket, meId, callPeer, createPeerConnection, closePeer]);

  // ---- When canSpeak is revoked force-mute the mic ----

  useEffect(() => {
    if (voiceStateRef.current !== 'active') return;
    const stream = localStreamRef.current;
    if (!stream) return;
    if (!canSpeak) {
      stream.getAudioTracks().forEach((t) => { t.enabled = false; });
      setIsMuted(true);
    }
  }, [canSpeak]);

  // ---- Public actions ----

  const joinAudio = useCallback(async () => {
    setVoiceState('joining');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      if (!canSpeakRef.current) {
        stream.getAudioTracks().forEach((t) => { t.enabled = false; });
        setIsMuted(true);
      } else {
        setIsMuted(false);
      }

      voiceStateRef.current = 'active';
      setVoiceState('active');

      socketRef.current?.emit('voice_join');
    } catch {
      setVoiceState('denied');
    }
  }, []);

  const skipAudio = useCallback(() => {
    setVoiceState('denied');
  }, []);

  const toggleMute = useCallback(() => {
    if (voiceStateRef.current !== 'active') return;
    if (!canSpeakRef.current) return;
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    const nowMuted = track.enabled;
    track.enabled = !nowMuted;
    isMutedRef.current = nowMuted;
    setIsMuted(nowMuted);
  }, []);

  // ---- Local VAD + speaking notifications ----

  useEffect(() => {
    if (voiceState !== 'active' || !localStreamRef.current || !meId || !socket) return;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(localStreamRef.current);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const check = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((s, v) => s + v, 0) / data.length;
      const amISpeaking = avg > 12 && !isMutedRef.current && canSpeakRef.current;

      setActiveSpeakers((prev) => {
        const has = prev.has(meId);
        if (amISpeaking === has) return prev;
        const next = new Set(prev);
        if (amISpeaking) next.add(meId); else next.delete(meId);
        return next;
      });

      if (amISpeaking !== lastSpeakingRef.current) {
        lastSpeakingRef.current = amISpeaking;
        socketRef.current?.emit('voice_speaking', { speaking: amISpeaking });
      }

      rafRef.current = requestAnimationFrame(check);
    };
    rafRef.current = requestAnimationFrame(check);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ctx.close().catch(() => {});
    };
  }, [voiceState, meId, socket]);

  // ---- Cleanup on unmount ----

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      for (const peerId of [...peersRef.current.keys()]) {
        closePeer(peerId);
      }
      socketRef.current?.emit('voice_leave');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { voiceState, isMuted, activeSpeakers, joinAudio, skipAudio, toggleMute };
}
